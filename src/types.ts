import { z } from 'zod';

// Voice Features Schema
export const VoiceFeaturesSchema = z.object({
  length_scale: z.number().positive().default(1.0).describe('Phoneme length multiplier: <1.0 is faster, >1.0 is slower'),
  noise_scale: z.number().nonnegative().default(0.667).describe('Phoneme generator noise scale (variability/expressiveness)'),
  noise_w: z.number().nonnegative().default(0.8).describe('Phoneme duration noise scale'),
  sentence_silence: z.number().nonnegative().default(0.2).describe('Seconds of silence inserted after punctuation'),
  volume: z.number().positive().default(1.0).optional().describe('Output audio volume gain multiplier'),
});
export type VoiceFeatures = z.infer<typeof VoiceFeaturesSchema>;

// Voice Model Configuration Schema
export const VoiceConfigSchema = z.object({
  name: z.string().optional().describe('Voice model name/identifier (e.g. en_US-lessac-medium)'),
  model_path: z.string().optional().describe('Direct file path to .onnx model'),
  config_path: z.string().optional().describe('Direct file path to .onnx.json model configuration'),
  speaker_id: z.number().int().nonnegative().default(0).describe('Speaker ID for multi-speaker models'),
  features: VoiceFeaturesSchema.default({}),
});
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

// Piper Engine System Options Schema
export const PiperConfigSchema = z.object({
  piper_bin: z.string().optional().describe('Path to piper executable binary'),
  use_cuda: z.boolean().default(false).describe('Enable CUDA GPU acceleration if supported'),
  threads: z.number().int().positive().optional().describe('Number of CPU inference threads'),
  auto_download_voice: z.boolean().default(true).describe('Automatically download missing voice models'),
  espeak_data_dir: z.string().optional().describe('Custom directory containing espeak-ng-data'),
});
export type PiperConfig = z.infer<typeof PiperConfigSchema>;

// Batch Input Segment Schema
export const BatchSegmentSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, 'Segment text cannot be empty'),
  speaker_id: z.number().int().nonnegative().optional(),
  voice_name: z.string().optional(),
  features: VoiceFeaturesSchema.partial().optional(),
  output_filename: z.string().optional().describe('Optional separate output wav file for this segment'),
});
export type BatchSegment = z.infer<typeof BatchSegmentSchema>;

// Input Specification Schema
export const InputConfigSchema = z.object({
  text: z.string().optional().describe('Main text to synthesize'),
  batch: z.array(BatchSegmentSchema).optional().describe('Batch segments of sentences/speakers to generate'),
}).refine(data => !!data.text || (data.batch && data.batch.length > 0), {
  message: 'Either "text" or "batch" must be provided in the input configuration.',
});
export type InputConfig = z.infer<typeof InputConfigSchema>;

// Output Specification Schema
export const OutputConfigSchema = z.object({
  path: z.string().default('./output/audio.wav').describe('Output WAV audio destination file path'),
  format: z.enum(['wav', 'raw']).default('wav'),
  sample_rate: z.number().int().positive().optional().describe('Expected sample rate (defaults to model native rate)'),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

// Monitor Configuration Schema
export const MonitorConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable process and timing resource monitoring'),
  report_path: z.string().default('./output/metrics.json').describe('Destination path for JSON performance report'),
  sample_interval_ms: z.number().int().positive().default(50).describe('Interval in milliseconds for sampling process usage'),
});
export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;

// Cloud Sync Schema (Neon PostgreSQL & Cloudflare R2)
export const CloudConfigSchema = z.object({
  enabled: z.boolean().default(true).describe('Enable syncing records to Neon DB and audio to Cloudflare R2'),
  database_url: z.string().optional().describe('Neon database connection string (defaults to DATABASE_URL)'),
  table_name: z.string().default('audio_generations').describe('SQL table name in Neon DB'),
  r2_bucket: z.string().optional().describe('Cloudflare R2 bucket name (defaults to R2_BUCKET_NAME)'),
  upload_audio: z.boolean().default(true).describe('Upload synthesized audio to Cloudflare R2'),
  upload_report: z.boolean().default(true).describe('Upload metrics report JSON to Cloudflare R2'),
});
export type CloudConfig = z.infer<typeof CloudConfigSchema>;

// Root Application Configuration Schema
export const ForgeConfigSchema = z.object({
  version: z.string().default('1.0'),
  input: InputConfigSchema,
  voice: VoiceConfigSchema.default({}),
  piper_config: PiperConfigSchema.default({}),
  output: OutputConfigSchema.default({}),
  monitor: MonitorConfigSchema.default({}),
  cloud: CloudConfigSchema.default({}),
});
export type ForgeConfig = z.infer<typeof ForgeConfigSchema>;

// Metrics & Performance Report Schema
export interface SegmentMetrics {
  id: string;
  text: string;
  speaker_id: number;
  duration_seconds: number;
  synthesis_ms: number;
  rtf: number;
}

export interface ResourceMetrics {
  cpu: {
    avg_percent: number;
    peak_percent: number;
    user_seconds: number;
    system_seconds: number;
  };
  memory: {
    initial_rss_mb: number;
    peak_rss_mb: number;
    final_rss_mb: number;
    peak_vms_mb: number;
  };
  io: {
    output_bytes: number;
    sample_rate: number;
    channels: number;
    samples: number;
  };
}

export interface TimingMetrics {
  initialization_ms: number;
  synthesis_ms: number;
  total_elapsed_ms: number;
  audio_duration_seconds: number;
  real_time_factor_rtf: number;
}

export interface PerformanceReport {
  timestamp: string;
  status: 'success' | 'failed';
  task: {
    voice: string;
    text_characters: number;
    text_words: number;
    segments_count: number;
    output_file: string;
  };
  timing: TimingMetrics;
  resources: ResourceMetrics;
  segments?: SegmentMetrics[];
  error?: string;
}
