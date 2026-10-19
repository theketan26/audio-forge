import dotenv from 'dotenv';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

dotenv.config();

export interface GenerationDbRecord {
  id?: string;
  created_at?: string;
  status: 'success' | 'failed';
  voice: string;
  text_input: string;
  text_characters: number;
  text_words: number;
  segments_count: number;
  audio_file_name?: string | null;
  storage_key?: string | null;
  storage_uri?: string | null;
  audio_url?: string | null;
  report_url?: string | null;
  audio_duration_seconds?: number;
  synthesis_ms?: number;
  total_elapsed_ms?: number;
  real_time_factor?: number;
  cpu_avg_percent?: number;
  cpu_peak_percent?: number;
  memory_peak_rss_mb?: number;
  memory_peak_vms_mb?: number;
  output_bytes?: number;
  sample_rate?: number;
  config?: any;
  report?: any;
  error_message?: string | null;
}

export class NeonDatabaseService {
  private sql: NeonQueryFunction<false, false> | null = null;
  private tableName: string;
  private isConfigured = false;

  constructor(customDbUrl?: string, customTableName?: string) {
    const dbUrl = customDbUrl || process.env.DATABASE_URL;
    this.tableName = customTableName || process.env.DB_TABLE_NAME || 'audio_generations';

    if (dbUrl && dbUrl.startsWith('postgres')) {
      try {
        this.sql = neon(dbUrl);
        this.isConfigured = true;
      } catch (err) {
        console.warn('Warning: Could not initialize Neon database client:', err);
      }
    }
  }

  public get configured(): boolean {
    return this.isConfigured;
  }

  /**
   * Ensure audio_generations table exists in Neon database
   */
  public async ensureTableExists(): Promise<void> {
    if (!this.sql) return;

    await this.sql`
      CREATE TABLE IF NOT EXISTS public.audio_generations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
        status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
        voice TEXT NOT NULL,
        text_input TEXT NOT NULL,
        text_characters INTEGER,
        text_words INTEGER,
        segments_count INTEGER DEFAULT 1,
        audio_file_name TEXT,
        storage_key TEXT,
        storage_uri TEXT,
        audio_url TEXT,
        report_url TEXT,
        audio_duration_seconds NUMERIC(10, 3),
        synthesis_ms NUMERIC(10, 2),
        total_elapsed_ms NUMERIC(10, 2),
        real_time_factor NUMERIC(8, 4),
        cpu_avg_percent NUMERIC(6, 2),
        cpu_peak_percent NUMERIC(6, 2),
        memory_peak_rss_mb NUMERIC(8, 2),
        memory_peak_vms_mb NUMERIC(8, 2),
        output_bytes BIGINT,
        sample_rate INTEGER,
        config JSONB,
        report JSONB,
        error_message TEXT
      );
    `;
  }

  /**
   * Insert a generation execution and resource record into Neon DB
   */
  public async insertRecord(record: GenerationDbRecord): Promise<{ id?: string; error?: string }> {
    if (!this.sql || !this.isConfigured) {
      return { error: 'Neon database URL not configured. Set DATABASE_URL in .env.' };
    }

    try {
      await this.ensureTableExists();

      const result = await this.sql`
        INSERT INTO public.audio_generations (
          status,
          voice,
          text_input,
          text_characters,
          text_words,
          segments_count,
          audio_file_name,
          storage_key,
          storage_uri,
          audio_url,
          report_url,
          audio_duration_seconds,
          synthesis_ms,
          total_elapsed_ms,
          real_time_factor,
          cpu_avg_percent,
          cpu_peak_percent,
          memory_peak_rss_mb,
          memory_peak_vms_mb,
          output_bytes,
          sample_rate,
          config,
          report,
          error_message
        ) VALUES (
          ${record.status},
          ${record.voice},
          ${record.text_input},
          ${record.text_characters},
          ${record.text_words},
          ${record.segments_count},
          ${record.audio_file_name || null},
          ${record.storage_key || null},
          ${record.storage_uri || null},
          ${record.audio_url || null},
          ${record.report_url || null},
          ${record.audio_duration_seconds || 0},
          ${record.synthesis_ms || 0},
          ${record.total_elapsed_ms || 0},
          ${record.real_time_factor || 0},
          ${record.cpu_avg_percent || 0},
          ${record.cpu_peak_percent || 0},
          ${record.memory_peak_rss_mb || 0},
          ${record.memory_peak_vms_mb || 0},
          ${record.output_bytes || 0},
          ${record.sample_rate || 0},
          ${JSON.stringify(record.config || {})},
          ${JSON.stringify(record.report || {})},
          ${record.error_message || null}
        )
        RETURNING id;
      `;

      const id = result[0]?.id as string | undefined;
      return { id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: msg };
    }
  }
}
