import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig, PerformanceReport } from './types.js';
import { NeonDatabaseService, type GenerationDbRecord } from './db.js';
import { CloudflareR2StorageService } from './storage.js';

export interface CloudSyncResult {
  dbRecordId?: string;
  r2StorageUri?: string;
  r2SecureSignedUrl?: string;
  r2ReportSignedUrl?: string;
  r2StorageKey?: string;
  messages: string[];
  error?: string;
}

export class CloudSyncService {
  private db: NeonDatabaseService;
  private r2: CloudflareR2StorageService;

  constructor(config?: ForgeConfig['cloud']) {
    this.db = new NeonDatabaseService(config?.database_url, config?.table_name);
    this.r2 = new CloudflareR2StorageService(config?.r2_bucket);
  }

  public get isDbConfigured(): boolean {
    return this.db.configured;
  }

  public get isR2Configured(): boolean {
    return this.r2.configured;
  }

  public async sync(params: {
    config: ForgeConfig;
    report: PerformanceReport;
    audioFilePath: string;
    reportFilePath?: string;
  }): Promise<CloudSyncResult> {
    const result: CloudSyncResult = { messages: [] };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(params.audioFilePath, path.extname(params.audioFilePath));
    const storagePrefix = `generations/${timestamp}_${baseName}`;

    let r2StorageKey: string | null = null;
    let r2StorageUri: string | null = null;
    let audioUrl: string | null = null;
    let reportUrl: string | null = null;

    // 1. Upload audio to Cloudflare R2 (Private & Secure)
    if (this.r2.configured && params.config.cloud.upload_audio && fs.existsSync(params.audioFilePath)) {
      try {
        r2StorageKey = `${storagePrefix}.wav`;
        const uploadRes = await this.r2.uploadFile(params.audioFilePath, r2StorageKey, 'audio/wav', 86400); // 24h presigned
        r2StorageUri = uploadRes.storageUri;
        audioUrl = uploadRes.secureSignedUrl;

        result.r2StorageKey = r2StorageKey;
        result.r2StorageUri = r2StorageUri;
        result.r2SecureSignedUrl = audioUrl;
        result.messages.push(`Uploaded audio to private Cloudflare R2: ${r2StorageKey}`);
      } catch (err: any) {
        result.messages.push(`R2 audio upload skipped: ${err.message}`);
      }
    } else if (!this.r2.configured) {
      result.messages.push('Cloudflare R2 credentials not set in .env (R2 upload skipped)');
    }

    // 2. Upload metrics report to Cloudflare R2
    if (
      this.r2.configured &&
      params.config.cloud.upload_report &&
      params.reportFilePath &&
      fs.existsSync(params.reportFilePath)
    ) {
      try {
        const reportKey = `${storagePrefix}_metrics.json`;
        const uploadRes = await this.r2.uploadFile(params.reportFilePath, reportKey, 'application/json', 86400);
        reportUrl = uploadRes.secureSignedUrl;
        result.r2ReportSignedUrl = reportUrl;
        result.messages.push(`Uploaded metrics report to private Cloudflare R2: ${reportKey}`);
      } catch (err: any) {
        result.messages.push(`R2 report upload skipped: ${err.message}`);
      }
    }

    // 3. Save generation record to Neon PostgreSQL Database
    if (this.db.configured) {
      try {
        const fullTextInput =
          params.config.input.text ||
          params.config.input.batch?.map(b => b.text).join(' ') ||
          '';

        const dbRecord: GenerationDbRecord = {
          status: params.report.status,
          voice: params.report.task.voice,
          text_input: fullTextInput,
          text_characters: params.report.task.text_characters,
          text_words: params.report.task.text_words,
          segments_count: params.report.task.segments_count,
          audio_file_name: path.basename(params.audioFilePath),
          storage_key: r2StorageKey,
          storage_uri: r2StorageUri,
          audio_url: audioUrl,
          report_url: reportUrl,
          audio_duration_seconds: params.report.timing.audio_duration_seconds,
          synthesis_ms: params.report.timing.synthesis_ms,
          total_elapsed_ms: params.report.timing.total_elapsed_ms,
          real_time_factor: params.report.timing.real_time_factor_rtf,
          cpu_avg_percent: params.report.resources.cpu.avg_percent,
          cpu_peak_percent: params.report.resources.cpu.peak_percent,
          memory_peak_rss_mb: params.report.resources.memory.peak_rss_mb,
          memory_peak_vms_mb: params.report.resources.memory.peak_vms_mb,
          output_bytes: params.report.resources.io.output_bytes,
          sample_rate: params.report.resources.io.sample_rate,
          config: params.config,
          report: params.report,
          error_message: params.report.error || null,
        };

        const dbRes = await this.db.insertRecord(dbRecord);
        if (dbRes.id) {
          result.dbRecordId = dbRes.id;
          result.messages.push(`Saved record to Neon database: ${dbRes.id}`);
        } else if (dbRes.error) {
          result.error = dbRes.error;
          result.messages.push(`Neon DB insert error: ${dbRes.error}`);
        }
      } catch (err: any) {
        result.error = err.message;
        result.messages.push(`Neon DB error: ${err.message}`);
      }
    } else {
      result.messages.push('DATABASE_URL not set in .env (Neon DB record skipped)');
    }

    // 4. Remove local files after successful cloud upload
    if (params.config.cloud.clean_local_after_upload && result.r2StorageKey) {
      if (fs.existsSync(params.audioFilePath)) {
        try {
          fs.unlinkSync(params.audioFilePath);
          result.messages.push(`Removed local audio file: ${path.basename(params.audioFilePath)}`);
        } catch (e: any) {
          result.messages.push(`Could not delete local audio file: ${e.message}`);
        }
      }
      if (params.reportFilePath && fs.existsSync(params.reportFilePath)) {
        try {
          fs.unlinkSync(params.reportFilePath);
          result.messages.push(`Removed local report file: ${path.basename(params.reportFilePath)}`);
        } catch (e: any) {
          result.messages.push(`Could not delete local report file: ${e.message}`);
        }
      }
    }

    return result;
  }
}
