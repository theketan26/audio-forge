# Audio Forge CLI 🎙️⚡

A high-performance Command-Line Interface (CLI) tool for generating speech audio using **Piper TTS**, featuring multi-voice options, declarative JSON configuration with voice features, and real-time process resource monitoring (CPU, RAM, RTF latency) with JSON reporting.

---

## Features

- **Piper TTS Powered**: Native integration with Piper standalone inference engine.
- **Multi-Voice Architecture**: Built-in voice catalog across English (US, UK), Spanish, French, German, and Hindi with automatic model caching and download.
- **Voice Tuning Features**: Full control over speech parameters:
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

---

## Quick Start

### 1. Installation

```bash
cd /home/developer/projects/audio-forge
npm install
npm run build
npm link   # Installs `audio-forge` globally in your environment
```

### 2. Generate Starter Configuration

```bash
audio-forge init my_config.json
```

### 3. Generate Audio from JSON Config

```bash
audio-forge generate -c my_config.json
```

---

## CLI Commands

| Command | Description | Example |
| :--- | :--- | :--- |
| `generate -c <file>` | Synthesize audio from JSON configuration file | `audio-forge generate -c config.json` |
| `quick "<text>"` | Quickly synthesize text directly from CLI flags | `audio-forge quick "Hello world" -v en_US-lessac-low` |
| `voices list` | Show catalog of available and downloaded voice models | `audio-forge voices list` |
| `voices download <name>` | Pre-download and cache a voice model | `audio-forge voices download en_US-lessac-medium` |
| `voices info <name>` | View sample rate, file paths, and speaker IDs | `audio-forge voices info en_US-libritts-high` |
| `validate -c <file>` | Validate JSON configuration against schema | `audio-forge validate -c config.json` |
| `init [filename]` | Create a fully annotated starter JSON config file | `audio-forge init sample.json` |

---

## JSON Configuration Schema

```json
{
  "version": "1.0",
  "input": {
    "text": "Hello world from Audio Forge!",
    "batch": [
      {
        "id": "segment_1",
        "text": "Welcome to Audio Forge CLI.",
        "speaker_id": 0,
        "features": {
          "length_scale": 1.0
        }
      },
      {
        "id": "segment_2",
        "text": "This segment is spoken slightly faster.",
        "speaker_id": 0,
        "features": {
          "length_scale": 0.85
        }
      }
    ]
  },
  "voice": {
    "name": "en_US-lessac-low",
    "speaker_id": 0,
    "features": {
      "length_scale": 1.0,
      "noise_scale": 0.667,
      "noise_w": 0.8,
      "sentence_silence": 0.2,
      "volume": 1.0
    }
  },
  "piper_config": {
    "use_cuda": false,
    "threads": 4,
    "auto_download_voice": true
  },
  "output": {
    "path": "./output/synthesized_speech.wav",
    "format": "wav"
  },
  "monitor": {
    "enabled": true,
    "report_path": "./output/performance_metrics.json",
    "sample_interval_ms": 50
  }
}
```

---

## Sample Performance & Resource Report (`metrics.json`)

```json
{
  "timestamp": "2026-10-19T09:20:11.243Z",
  "status": "success",
  "task": {
    "voice": "en_US-lessac-low",
    "text_characters": 67,
    "text_words": 11,
    "segments_count": 2,
    "output_file": "/home/developer/projects/audio-forge/output/synthesized_speech.wav"
  },
  "timing": {
    "initialization_ms": 0.37,
    "synthesis_ms": 636.9,
    "total_elapsed_ms": 637.6,
    "audio_duration_seconds": 4.864,
    "real_time_factor_rtf": 0.1309
  },
  "resources": {
    "cpu": {
      "avg_percent": 182.08,
      "peak_percent": 400.0,
      "user_seconds": 0.986,
      "system_seconds": 0.174
    },
    "memory": {
      "initial_rss_mb": 82.28,
      "peak_rss_mb": 114.67,
      "final_rss_mb": 111.46,
      "peak_vms_mb": 362.68
    },
    "io": {
      "output_bytes": 155692,
      "sample_rate": 16000,
      "channels": 1,
      "samples": 77824
    }
  },
  "segments": [
    {
      "id": "seg_1",
      "text": "Welcome to Audio Forge CLI.",
      "speaker_id": 0,
      "duration_seconds": 2.424,
      "synthesis_ms": 324.43,
      "rtf": 0.1338
    },
    {
      "id": "seg_2",
      "text": "This segment is spoken slightly faster.",
      "speaker_id": 0,
      "duration_seconds": 2.44,
      "synthesis_ms": 311.18,
      "rtf": 0.1275
    }
  ]
}
```
