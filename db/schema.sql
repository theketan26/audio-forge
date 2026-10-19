-- ==============================================================================
-- Neon Database SQL Schema for Audio Forge
-- Run this in your Neon SQL Editor (Neon Console -> SQL Editor)
-- ==============================================================================

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

CREATE INDEX IF NOT EXISTS idx_audio_generations_created_at ON public.audio_generations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audio_generations_status ON public.audio_generations (status);
CREATE INDEX IF NOT EXISTS idx_audio_generations_voice ON public.audio_generations (voice);
