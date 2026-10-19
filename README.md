# Audio Forge 🎙️⚡

High-performance Piper TTS Audio Synthesis Engine, CLI, and **HTTP API Gateway** with multi-voice support, fine-grained voice tuning, real-time process resource monitoring, **Neon PostgreSQL** database tracking, and private **Cloudflare R2** storage.

---

## Features

- **Piper TTS Engine**: Ultra-fast local neural speech synthesis.
- **Multi-Voice Architecture**: Built-in voice catalog across languages (English, Spanish, French, German, Hindi) and quality tiers.
- **Voice Tuning Parameters**: Speed (`length_scale`), variability (`noise_scale`), cadence (`noise_w`), and punctuation pause (`sentence_silence`).
- **Resource Monitoring**: Tracks initialization, synthesis time, Real-Time Factor (RTF), CPU load (avg & peak), and memory consumption (RSS/VMS).
- **Cloudflare R2 Storage**: 100% private bucket storage with secure, cryptographically signed access URLs.
- **Neon PostgreSQL**: Complete SQL audit trail of all generation jobs, metrics, and audio links.
- **HTTP API Gateway**:
  - Asynchronous audio generation with immediate acknowledgment (ACK).
  - Status polling returning full generation metrics, duration, and R2 signed URLs.
  - Paginated listing of past audio generations.
  - Protected with API Key header authentication.

---

## Quick Start

### 1. Installation

```bash
cd /home/developer/projects/audio-forge
npm install
npm run build
npm link   # Installs `audio-forge` globally
```

### 2. Environment Configuration (`.env`)

```bash
# Neon PostgreSQL Database
DATABASE_URL=postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
DB_TABLE_NAME=audio_generations

# Cloudflare R2 Storage (100% Private & Secure)
R2_S3_API_URL=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=automation

# API Gateway Configuration
PORT=3000
API_KEY=forge-secret-key
```

---

## Starting the API Gateway

Start the server using the CLI or npm:

```bash
# Using CLI
audio-forge serve --port 3000

# Or using npm
npm run serve
```

Server output:
```text
⚡ Audio Forge API Gateway running on port 3000
🔑 API Key: forge-secret-key
```

---

## API Gateway Documentation

### Authentication

All endpoints under `/api/*` require the `x-api-key` header (or `Authorization: Bearer <API_KEY>`):

```http
x-api-key: forge-secret-key
```

---

### 1. Generate Audio (Async with ACK)

**`POST /api/v1/generate`**

Starts speech synthesis asynchronously and returns an immediate ACK with a job ID.

#### Request Headers
```http
Content-Type: application/json
x-api-key: forge-secret-key
```

#### Request Body
```json
{
  "text": "Welcome to Audio Forge API Gateway. Speech synthesis started successfully.",
  "voice": "en_US-lessac-low",
  "speaker_id": 0,
  "features": {
    "length_scale": 1.0,
    "noise_scale": 0.667,
    "noise_w": 0.8,
    "sentence_silence": 0.2
  }
}
```

#### Response: `202 Accepted`
```json
{
  "status": "processing",
  "message": "Audio generation job successfully started",
  "id": "16c872d6-29c1-4e4e-8464-5533ca4aecbd",
  "task": {
    "voice": "en_US-lessac-low",
    "text_length": 74
  },
  "status_url": "/api/v1/generations/16c872d6-29c1-4e4e-8464-5533ca4aecbd"
}
```

---

### 2. Fetch Generation Status & Details

**`GET /api/v1/generations/:id`**

Fetches the current status and, once finished, returns all monitoring stats and R2 links.

#### Response (While Processing):
```json
{
  "id": "16c872d6-29c1-4e4e-8464-5533ca4aecbd",
  "status": "processing",
  "message": "Audio generation is currently in progress",
  "created_at": "2026-10-19T11:31:50.661Z"
}
```

#### Response (When Completed): `200 OK`
```json
{
  "id": "16c872d6-29c1-4e4e-8464-5533ca4aecbd",
  "status": "success",
  "created_at": "2026-10-19T11:31:50.661Z",
  "task": {
    "voice": "en_US-lessac-low",
    "text_input": "Welcome to Audio Forge API Gateway.",
    "text_characters": 35,
    "text_words": 6,
    "segments_count": 1
  },
  "storage": {
    "file_name": "api_1792409510258_q59ca.wav",
    "storage_key": "generations/2026-10-19_api_1792409510258_q59ca.wav",
    "storage_uri": "r2://automation/generations/2026-10-19_api_1792409510258_q59ca.wav",
    "audio_url": "https://<account-id>.r2.cloudflarestorage.com/automation/generations/...?X-Amz-Signature=..."
  },
  "timing": {
    "synthesis_ms": 361.66,
    "total_elapsed_ms": 362.34,
    "audio_duration_seconds": 3.352,
    "real_time_factor_rtf": 0.1079
  },
  "resources": {
    "cpu_avg_percent": 212.14,
    "cpu_peak_percent": 420,
    "memory_peak_rss_mb": 120.05,
    "memory_peak_vms_mb": 380.21,
    "output_bytes": 107308,
    "sample_rate": 16000
  },
  "report": { ... }
}
```

---

### 3. List Paginated Generations

**`GET /api/v1/generations?page=1&limit=10`**

Retrieves a paginated list of past audio generation jobs from the Neon database.

#### Query Parameters
- `page`: Page number (default: `1`).
- `limit`: Items per page (default: `10`, max: `100`).

#### Response: `200 OK`
```json
{
  "total": 5,
  "page": 1,
  "limit": 10,
  "total_pages": 1,
  "items": [
    {
      "id": "16c872d6-29c1-4e4e-8464-5533ca4aecbd",
      "created_at": "2026-10-19T11:31:50.661Z",
      "status": "success",
      "voice": "en_US-lessac-low",
      "text_snippet": "Welcome to Audio Forge API Gateway.",
      "audio_duration_seconds": 3.352,
      "real_time_factor": 0.1079,
      "storage_uri": "r2://automation/generations/...",
      "audio_url": "https://..."
    }
  ]
}
```

---

## CLI Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `serve` | Start HTTP API gateway server | `audio-forge serve --port 3000` |
| `generate -c <file>` | Synthesize audio from JSON config file | `audio-forge generate -c config.json` |
| `quick "<text>"` | Quickly synthesize text from CLI flags | `audio-forge quick "Hello world"` |
| `voices list` | Show catalog of available voice models | `audio-forge voices list` |
| `voices download <name>` | Pre-cache a voice model | `audio-forge voices download en_US-lessac-medium` |
| `voices info <name>` | View voice metadata & speaker IDs | `audio-forge voices info en_US-libritts-high` |
| `init [filename]` | Create a starter JSON config file | `audio-forge init sample.json` |
