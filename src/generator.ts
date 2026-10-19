import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ForgeConfig, PerformanceReport, SegmentMetrics, VoiceFeatures } from './types.js';
import { resolvePiperBinary } from './piper-resolver.js';
import { VoiceManager, type ResolvedVoice } from './voice-manager.js';
import { ProcessMonitor, inspectWavFile } from './monitor.js';

/**
 * Concatenate multiple WAV files with identical formats into a single output WAV
 */
export function concatenateWavFiles(inputPaths: string[], outputPath: string): void {
  if (inputPaths.length === 0) return;
  if (inputPaths.length === 1) {
    fs.copyFileSync(inputPaths[0], outputPath);
    return;
  }

  const pcmBuffers: Buffer[] = [];
  let headerBuffer: Buffer | null = null;
  let totalDataLength = 0;

  for (const file of inputPaths) {
    const buf = fs.readFileSync(file);
    if (!headerBuffer) {
      headerBuffer = Buffer.from(buf.subarray(0, 44));
    }
    // Extract raw audio data after standard 44-byte WAV header
    const dataChunk = buf.subarray(44);
    pcmBuffers.push(dataChunk);
    totalDataLength += dataChunk.length;
  }

  if (!headerBuffer) {
    throw new Error('Failed to parse WAV headers for concatenation');
  }

  // Update header lengths
  const outputHeader = Buffer.from(headerBuffer);
  // RIFF ChunkSize = 36 + totalDataLength
  outputHeader.writeUInt32LE(36 + totalDataLength, 4);
  // subchunk2Size = totalDataLength
  outputHeader.writeUInt32LE(totalDataLength, 40);

  const finalDir = path.dirname(outputPath);
  fs.mkdirSync(finalDir, { recursive: true });

  const finalBuffer = Buffer.concat([outputHeader, ...pcmBuffers]);
  fs.writeFileSync(outputPath, finalBuffer);
}

export class AudioForgeGenerator {
  private voiceManager: VoiceManager;

  constructor() {
    this.voiceManager = new VoiceManager();
  }

  public async generate(config: ForgeConfig): Promise<{
    report: PerformanceReport;
    outputPath: string;
  }> {
    const monitor = new ProcessMonitor(config.monitor.sample_interval_ms);
    monitor.startTimer();

    // 1. Resolve Piper binary
    const piperBin = await resolvePiperBinary(config.piper_config.piper_bin);

    // 2. Resolve default voice
    const defaultVoice = await this.voiceManager.resolveVoice(
      config.voice.name,
      config.voice.model_path,
      config.voice.config_path,
      config.piper_config.auto_download_voice
    );

    monitor.markInitialized();

    const outputPath = path.resolve(config.output.path);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    let fullText = '';
    const segmentMetricsList: SegmentMetrics[] = [];

    try {
      // Branch A: Batch input mode
      if (config.input.batch && config.input.batch.length > 0) {
        const tempSegmentFiles: string[] = [];
        const tempDir = path.join(path.dirname(outputPath), '.tmp_segments');
        fs.mkdirSync(tempDir, { recursive: true });

        for (let i = 0; i < config.input.batch.length; i++) {
          const seg = config.input.batch[i];
          const segId = seg.id || `seg_${i + 1}`;
          fullText += (fullText ? ' ' : '') + seg.text;

          // Resolve segment voice if custom, otherwise use default
          const segVoice = seg.voice_name
            ? await this.voiceManager.resolveVoice(seg.voice_name)
            : defaultVoice;

          const mergedFeatures: VoiceFeatures = {
            ...config.voice.features,
            ...(seg.features || {}),
          };

          const speakerId =
            seg.speaker_id !== undefined ? seg.speaker_id : config.voice.speaker_id;

          const segOutputFile = seg.output_filename
            ? path.resolve(path.dirname(outputPath), seg.output_filename)
            : path.join(tempDir, `part_${i}_${Date.now()}.wav`);

          const segStartTime = performance.now();

          await this.synthesizeSingleUtterance({
            piperBin,
            voice: segVoice,
            text: seg.text,
            outputPath: segOutputFile,
            speakerId,
            features: mergedFeatures,
            piperConfig: config.piper_config,
            monitor,
          });

          const segDurationMs = performance.now() - segStartTime;
          const segWav = inspectWavFile(segOutputFile);
          const segRtf =
            segWav.durationSeconds > 0
              ? Number(((segDurationMs / 1000) / segWav.durationSeconds).toFixed(4))
              : 0;

          segmentMetricsList.push({
            id: segId,
            text: seg.text,
            speaker_id: speakerId,
            duration_seconds: Number(segWav.durationSeconds.toFixed(3)),
            synthesis_ms: Number(segDurationMs.toFixed(2)),
            rtf: segRtf,
          });

          tempSegmentFiles.push(segOutputFile);
        }

        // Concatenate all batch audio segments into final output WAV
        concatenateWavFiles(tempSegmentFiles, outputPath);

        // Clean up temporary segment files that were not explicitly named by user
        for (let i = 0; i < config.input.batch.length; i++) {
          if (!config.input.batch[i].output_filename && fs.existsSync(tempSegmentFiles[i])) {
            fs.unlinkSync(tempSegmentFiles[i]);
          }
        }
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } else {
        // Branch B: Single text mode
        fullText = config.input.text || '';
        await this.synthesizeSingleUtterance({
          piperBin,
          voice: defaultVoice,
          text: fullText,
          outputPath,
          speakerId: config.voice.speaker_id,
          features: config.voice.features,
          piperConfig: config.piper_config,
          monitor,
        });
      }

      await monitor.stopMonitoring();

      const report = monitor.generateReport({
        status: 'success',
        voiceName: defaultVoice.name,
        text: fullText,
        segmentsCount: config.input.batch?.length || 1,
        outputWavPath: outputPath,
        reportPath: config.monitor.enabled ? path.resolve(config.monitor.report_path) : undefined,
        segments: segmentMetricsList.length > 0 ? segmentMetricsList : undefined,
      });

      return { report, outputPath };
    } catch (error) {
      await monitor.stopMonitoring();
      const errMsg = error instanceof Error ? error.message : String(error);

      const failedReport = monitor.generateReport({
        status: 'failed',
        voiceName: defaultVoice.name,
        text: fullText,
        segmentsCount: config.input.batch?.length || 1,
        outputWavPath: outputPath,
        reportPath: config.monitor.enabled ? path.resolve(config.monitor.report_path) : undefined,
        error: errMsg,
      });

      throw Object.assign(new Error(errMsg), { report: failedReport });
    }
  }

  private synthesizeSingleUtterance(options: {
    piperBin: string;
    voice: ResolvedVoice;
    text: string;
    outputPath: string;
    speakerId: number;
    features: VoiceFeatures;
    piperConfig: ForgeConfig['piper_config'];
    monitor: ProcessMonitor;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '--model',
        options.voice.modelPath,
        '--config',
        options.voice.configPath,
        '--output_file',
        options.outputPath,
        '--speaker',
        String(options.speakerId),
        '--length_scale',
        String(options.features.length_scale),
        '--noise_scale',
        String(options.features.noise_scale),
        '--noise_w',
        String(options.features.noise_w),
        '--sentence_silence',
        String(options.features.sentence_silence),
      ];

      if (options.piperConfig.use_cuda) {
        args.push('--cuda');
      }
      if (options.piperConfig.espeak_data_dir) {
        args.push('--espeak_data', options.piperConfig.espeak_data_dir);
      }

      const child = spawn(options.piperBin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (child.pid) {
        options.monitor.monitorPid(child.pid);
      }

      let stderrOutput = '';
      child.stderr.on('data', chunk => {
        stderrOutput += chunk.toString();
      });

      child.on('error', err => {
        reject(new Error(`Failed to start Piper process: ${err.message}`));
      });

      child.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Piper process failed with exit code ${code}. Stderr: ${stderrOutput.trim()}`
            )
          );
        }
      });

      // Write text to piper stdin and close stdin
      child.stdin.write(options.text);
      child.stdin.end();
    });
  }
}
