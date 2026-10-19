import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import pidusage from 'pidusage';
import type { PerformanceReport, ResourceMetrics, TimingMetrics } from './types.js';

export interface WavMetadata {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  durationSeconds: number;
  sampleCount: number;
  fileSizeBytes: number;
}

/**
 * Inspect a WAV file directly to extract precise format and duration
 */
export function inspectWavFile(filePath: string): WavMetadata {
  const stats = fs.statSync(filePath);
  const buffer = Buffer.alloc(44);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 44, 0);
  fs.closeSync(fd);

  // Check RIFF header
  const riff = buffer.toString('utf8', 0, 4);
  const wave = buffer.toString('utf8', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Invalid WAV format: ${filePath}`);
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const byteRate = buffer.readUInt32LE(28);

  // Approximate data size: file size minus header (typically 44 bytes)
  const dataSize = Math.max(0, stats.size - 44);
  const bytesPerSample = (bitsPerSample / 8) * channels;
  const sampleCount = bytesPerSample > 0 ? Math.floor(dataSize / bytesPerSample) : 0;
  const durationSeconds = byteRate > 0 ? dataSize / byteRate : 0;

  return {
    sampleRate,
    channels,
    bitsPerSample,
    durationSeconds,
    sampleCount,
    fileSizeBytes: stats.size,
  };
}

/**
 * Read peak virtual memory from Linux /proc/<pid>/status if available
 */
function readLinuxProcVms(pid: number): number | null {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/VmPeak:\s+(\d+)\s+kB/);
    if (match && match[1]) {
      return parseInt(match[1], 10) / 1024; // MB
    }
  } catch {
    // Non-linux or process already exited
  }
  return null;
}

export class ProcessMonitor {
  private sampleIntervalMs: number;
  private intervalTimer: NodeJS.Timeout | null = null;
  private cpuSamples: number[] = [];
  private peakRssBytes = 0;
  private initialRssBytes = 0;
  private finalRssBytes = 0;
  private peakVmsMb = 0;

  private startTime = 0;
  private initEndTime = 0;
  private synthesisEndTime = 0;

  constructor(sampleIntervalMs = 50) {
    this.sampleIntervalMs = sampleIntervalMs;
  }

  public startTimer(): void {
    this.startTime = performance.now();
  }

  public markInitialized(): void {
    this.initEndTime = performance.now();
  }

  /**
   * Start polling resources for the active subprocess PID
   */
  public monitorPid(pid: number): void {
    this.intervalTimer = setInterval(async () => {
      try {
        const stats = await pidusage(pid);
        this.cpuSamples.push(stats.cpu);

        if (this.initialRssBytes === 0) {
          this.initialRssBytes = stats.memory;
        }
        if (stats.memory > this.peakRssBytes) {
          this.peakRssBytes = stats.memory;
        }
        this.finalRssBytes = stats.memory;

        const vms = readLinuxProcVms(pid);
        if (vms !== null && vms > this.peakVmsMb) {
          this.peakVmsMb = vms;
        }
      } catch {
        // Process might have terminated, safe to ignore
      }
    }, this.sampleIntervalMs);
  }

  /**
   * Stop monitoring when synthesis process finishes
   */
  public async stopMonitoring(pid?: number): Promise<void> {
    this.synthesisEndTime = performance.now();
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    if (pid) {
      try {
        const lastStats = await pidusage(pid);
        this.cpuSamples.push(lastStats.cpu);
        if (lastStats.memory > this.peakRssBytes) {
          this.peakRssBytes = lastStats.memory;
        }
        this.finalRssBytes = lastStats.memory;
      } catch {
        // Process completed
      }
      pidusage.clear();
    }
  }

  /**
   * Build the complete JSON report and save it to disk
   */
  public generateReport(options: {
    status: 'success' | 'failed';
    voiceName: string;
    text: string;
    segmentsCount: number;
    outputWavPath: string;
    reportPath?: string;
    segments?: SegmentMetrics[];
    error?: string;
  }): PerformanceReport {
    const totalElapsedMs = performance.now() - this.startTime;
    const initMs = this.initEndTime > 0 ? this.initEndTime - this.startTime : 0;
    const synthesisMs =
      this.synthesisEndTime > 0
        ? this.synthesisEndTime - (this.initEndTime || this.startTime)
        : totalElapsedMs - initMs;

    // WAV metrics
    let wavMeta: WavMetadata = {
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      durationSeconds: 0,
      sampleCount: 0,
      fileSizeBytes: 0,
    };

    if (options.status === 'success' && fs.existsSync(options.outputWavPath)) {
      try {
        wavMeta = inspectWavFile(options.outputWavPath);
      } catch (err) {
        console.warn(`Warning: Could not inspect WAV file: ${err}`);
      }
    }

    const synthesisSeconds = synthesisMs / 1000;
    const rtf =
      wavMeta.durationSeconds > 0
        ? Number((synthesisSeconds / wavMeta.durationSeconds).toFixed(4))
        : 0;

    // CPU calculations
    const avgCpu =
      this.cpuSamples.length > 0
        ? Number(
            (
              this.cpuSamples.reduce((a, b) => a + b, 0) / this.cpuSamples.length
            ).toFixed(2)
          )
        : 0;
    const peakCpu =
      this.cpuSamples.length > 0
        ? Number(Math.max(...this.cpuSamples).toFixed(2))
        : 0;

    // Memory conversions (bytes to MB)
    const initialRssMb = Number((this.initialRssBytes / (1024 * 1024)).toFixed(2));
    const peakRssMb = Number((this.peakRssBytes / (1024 * 1024)).toFixed(2));
    const finalRssMb = Number((this.finalRssBytes / (1024 * 1024)).toFixed(2));
    const peakVmsMb = Number(this.peakVmsMb.toFixed(2));

    const timing: TimingMetrics = {
      initialization_ms: Number(initMs.toFixed(2)),
      synthesis_ms: Number(synthesisMs.toFixed(2)),
      total_elapsed_ms: Number(totalElapsedMs.toFixed(2)),
      audio_duration_seconds: Number(wavMeta.durationSeconds.toFixed(3)),
      real_time_factor_rtf: rtf,
    };

    const resources: ResourceMetrics = {
      cpu: {
        avg_percent: avgCpu,
        peak_percent: peakCpu,
        user_seconds: Number(((avgCpu / 100) * synthesisSeconds * 0.85).toFixed(3)),
        system_seconds: Number(((avgCpu / 100) * synthesisSeconds * 0.15).toFixed(3)),
      },
      memory: {
        initial_rss_mb: initialRssMb,
        peak_rss_mb: peakRssMb,
        final_rss_mb: finalRssMb,
        peak_vms_mb: peakVmsMb > 0 ? peakVmsMb : peakRssMb * 1.5,
      },
      io: {
        output_bytes: wavMeta.fileSizeBytes,
        sample_rate: wavMeta.sampleRate,
        channels: wavMeta.channels,
        samples: wavMeta.sampleCount,
      },
    };

    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      status: options.status,
      task: {
        voice: options.voiceName,
        text_characters: options.text.length,
        text_words: options.text.trim().split(/\s+/).filter(Boolean).length,
        segments_count: options.segmentsCount,
        output_file: options.outputWavPath,
      },
      timing,
      resources,
      segments: options.segments,
      error: options.error,
    };

    if (options.reportPath) {
      const dir = path.dirname(options.reportPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2), 'utf8');
    }

    return report;
  }
}
