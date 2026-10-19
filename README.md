# Audio Forge CLI 🎙️⚡

A high-performance Command-Line Interface (CLI) tool for generating speech audio using **Piper TTS**, featuring multi-voice options, declarative JSON configuration with fine-grained voice features, real-time resource & latency monitoring, **Neon PostgreSQL** database tracking, and private, secure **Cloudflare R2** file storage (with zero AWS SDK dependency).

---

## Features

- **Piper TTS Powered**: Native integration with Piper standalone inference engine.
- **Multi-Voice Architecture**: Built-in voice catalog across English (US, UK), Spanish, French, German, and Hindi with automatic model caching and download.
- **Voice Tuning Features**:
  - `length_scale`: Phoneme length multiplier (speed / tempo control).
  - `noise_scale`: Generator variability (expressiveness).
  - `noise_w`: Pronunciation and cadence variance.
  - `sentence_silence`: Punctuation pause durations.
  - Multi-speaker IDs: Support for multi-speaker checkpoints (e.g. LibriTTS with 900+ speakers).
- **Declarative JSON Configuration**: Single-string or multi-segment batch synthesis with per-segment speaker/speed overrides and seamless WAV concatenation.
- **Real-Time Resource & Performance Monitor**:
  - Timing: Initialization time, synthesis duration, total wall time, audio duration, Real-Time Factor (RTF).
  - Resources: Peak & average CPU utilization, physical RAM (RSS), virtual memory (VMS), and disk I/O metrics.
  - Generates machine-readable `metrics.json` reports alongside the audio output.
- **Neon PostgreSQL Integration**: Records every generation event, audio metadata, timing, and full resource consumption stats into your SQL database.
- **Secure Cloudflare R2 Storage**:
  - 100% private bucket storage (no public access needed).
  - Generates secure, cryptographically signed, expiring URLs for authorized access.
  - Uses lightweight `aws4fetch` (zero heavy AWS SDK).

---

## Quick Start

### 1. Installation

```bash
cd /home/developer/projects/audio-forge
npm install
npm run build
npm link   # Installs `audio-forge` globally in your environment
```

### 2. Environment Configuration (`.env`)

Open `.env` and fill in your values (reference [`.env.example`](file:///home/developer/projects/audio-forge/.env.example)):

```bash
# 1. Neon PostgreSQL Database
DATABASE_URL=postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
DB_TABLE_NAME=audio_generations

# 2. Cloudflare R2 File Storage (Private & Secure)
R2_S3_API_URL=https://<your-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
```

### 3. Initialize Neon Database Table

Run the SQL script in [`db/schema.sql`](file:///home/developer/projects/audio-forge/db/schema.sql) in your **Neon Console -> SQL Editor** (or let the CLI auto-create it on first run):

```sql
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
```

### 4. Generate Speech

```bash
# Generate from JSON configuration file (auto-uploads to R2 & logs to Neon)
audio-forge generate -c example_config.json

# Disable cloud sync on the fly if running locally only:
audio-forge generate -c example_config.json --no-cloud
```
