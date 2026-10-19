Here is the comprehensive production blueprint for **AudioForge**, covering the entire feature matrix, system architecture, tech stack, data schemas, and implementation roadmap.

---

# AudioForge — Master Project Blueprint

## 1. System Vision & Architecture

AudioForge is a deterministic speech synthesis and lip-sync synchronization platform designed for game developers, animators, and digital artists. It converts dialogue scripts into retro/stylized audio tracks while computing sample-accurate, frame-snapped viseme timing data for direct integration with animation runtimes (Spine2D, Godot, Unity, Unreal, and Web).

```
                                  +-----------------------------------------------+
                                  |         Next.js 15 Frontend Studio            |
                                  |  - Script Editor with SSML-lite Badges        |
                                  |  - Real-time Canvas Lip-sync Inspector       |
                                  |  - AudioWorklet (WASM Core) Instant Preview   |
                                  +-----------------------+-----------------------+
                                                          | HTTP / tRPC / WS
                                                          v
                                  +-----------------------------------------------+
                                  |              Rust API (Axum)                  |
                                  |  - Task Scheduler & Seed Manager              |
                                  |  - Project & Asset Route Handlers             |
                                  +-----------------------+-----------------------+
                                                          |
                                +-------------------------+-------------------------+
                                |                                                   |
                                v                                                   v
+-----------------------------------------------+   +-----------------------------------------------+
|             `audioforge-core` (DSP)           |   |            `audioforge-mixer`                 |
|  - G2P Trie Dictionary (ARPAbet/IPA)          |   |  - Multi-track Virtual Bus                    |
|  - Prosody Envelope (F0 Curves)               |   |  - Sidechain Ducking Engine                   |
|  - Dual Engine: Formant & Granular Animalese  |   |  - Deterministic Sample-Accurate Timeline     |
|  - Viseme Coarticulation & Weight Smoother    |   |  - Master Limiter & Hound WAV Exporter        |
+-----------------------+-----------------------+   +-----------------------+-----------------------+
                        |                                                   |
                        +-------------------------+-------------------------+
                                                  |
                                                  v
                               +-------------------------------------+
                               |           Supabase Backend          |
                               |  - PostgreSQL (Metadata & Manifests)|
                               |  - Storage (WAV Stems & Assets)     |
                               +-------------------------------------+

```

---

## 2. Complete Technology Stack

| Layer | Technology | Justification |
| --- | --- | --- |
| **DSP Core & Engine** | **Rust** (`audioforge-core`) | Zero-cost abstractions, zero garbage collection pauses, SIMD auto-vectorization, bit-exact deterministic math across architectures. Compilable to WASM. |
| **Backend API** | **Rust** (`axum` + `tokio`) | Non-blocking asynchronous I/O, modular routing, minimal memory footprint, native integration with the core DSP crate. |
| **Database & Storage** | **Supabase** (PostgreSQL + S3 Storage) | Relational integrity for presets/scripts/runs, row-level security (RLS), and S3-compatible asset storage for WAVs and manifests. |
| **DB Client (Rust)** | `sqlx` | Compile-time checked queries, asynchronous connection pooling, zero runtime ORM overhead. |
| **Object Storage SDK** | `aws-sdk-s3` | High-throughput, battle-tested client connecting to Supabase’s S3-compatible storage endpoint. |
| **Frontend Studio** | **Next.js 15 (React 19, TypeScript, Tailwind CSS)** | Server-side rendering for project dashboards, client-side reactivity for timeline controls and canvas animations. |
| **Audio & Canvas Client** | **Web Audio API + HTML5 Canvas / WebGL** | Sub-millisecond audio playback synchronization, frame-accurate playhead tracking via `requestAnimationFrame`. |
| **WASM Bridge** | `wasm-bindgen` + `web-sys` | Compiles `audioforge-core` to WebAssembly so parameter adjustments preview instantly in the browser without server round-trips. |

---

## 3. Feature Breakdown by Subsystem

### A. Speech & Audio Generation Engine (`audioforge-core`)

1. **Rule-Based Formant Synthesis:**
* Cascaded digital vocal tract filter based on the Klatt acoustic model.
* Voiced excitation: Rosenberg/Liljencrants-Fant glottal pulse oscillator with controllable open-quotient.
* Unvoiced excitation: White/pink noise generator for fricatives and plosives.
* Resonant biquad bandpass filter bank modeling $F_1$, $F_2$, $F_3$, and $F_4$ formant centers and bandwidths.


2. **Animalese / Granular Synthesis Mode:**
* Micro-grain playback engine slicing syllable source audio (15–40 ms).
* Seed-deterministic pitch modulation per character letter/syllable.
* Windowed Hann crossfading to eliminate click/pop boundary artifacts.


3. **Phonetic Pipeline & Intonation:**
* Grapheme-to-Phoneme (G2P) engine parsing text into ARPAbet tokens using an embedded CMUdict Trie with rule-based fallback.
* Dynamic pitch contours: punctuation-driven intonation slope (drop on periods, +25% sweep on questions, punchy attack on exclamations).


4. **Deterministic Randomness:**
* Driven by `rand_pcg` with explicit 32-bit seeds (`seed: uint32`) controlling pitch jitter, shimmer, and vocal tract noise.



### B. Timing, Lip-Sync & Coarticulation Engine

1. **Upstream Timestamp Extraction:**
* Emits visemes at the exact moment the synthesis scheduler plans phoneme durations—no downstream acoustic analysis or FFT guessing.


2. **Coarticulation & Blending:**
* Continuous cubic Hermite weight interpolation between adjacent mouth positions (e.g., easing from bilabial `closed` to open vowel `wide_open`).
* Output manifest provides both primary and secondary visemes with proportional weights (e.g., `wide_open: 0.82`, `round: 0.18`).


3. **Framerate Snapping:**
* Quantizes continuous sample timestamps into discrete frames matching target project framerates (24, 30, or 60 FPS).


4. **Multi-Format Export:**
* Structured JSON manifest.
* Discrete frame index sequence for 2D sprite rigs (Spine2D / Godot).
* Normalized scalar curves (0.0 to 1.0) compatible with 3D blendshapes (Unreal Live Link / Blender).



### C. Audio Compositor (`audioforge-mixer`)

1. **Multi-Bus Layering:**
* `Voice Bus`, `SFX Bus`, and `BGM Bus` operating at an internal 48 kHz / 32-bit float pipeline.


2. **Deterministic Sidechain Ducking:**
* Automatic volume compression on the `BGM Bus` whenever voice audio crosses the activity threshold (configurable ducking depth, attack, and release curves).


3. **WAV File Generation:**
* Linear 16-bit or 24-bit PCM WAV rendering via `hound`, producing master mixed tracks and isolated stem tracks.



### D. Frontend Studio (UI / UX)

1. **Interactive Script Editor:**
* Syntax highlighting for SSML-lite inline tags (`[pause:200ms]`, `[pitch:+10%]`, `[viseme:override]`, `[sfx:clink]`).
* Click-and-drag duration handles for pauses and pacing adjustments.


2. **Real-Time Lip-Sync Puppet & Inspector:**
* Live 2D vector preview of the character face animating dynamically with the playhead.
* Frame-by-frame scrubbing with visual indicators of active phonemes, viseme weights, and pitch curves.


3. **Voice Preset Designer:**
* Interactive acoustic sliders: Base Pitch ($F_0$), Formant Shift, Speed, Jitter, Shimmer, and Breathiness.
* One-click "Test Syllable" powered by WASM for immediate feedback.


4. **Render Run & Seed Manager:**
* Snapshot history of every render with instant playback, asset download links (.wav, .json), and "Restore Seed" capabilities.



---

## 4. Supabase Database Schema

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Character Profiles
create table public.characters (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade not null,
    name text not null,
    engine_mode text check (engine_mode in ('formant', 'granular')) not null,
    base_seed integer default 424242 not null,
    voice_config jsonb not null default '{
        "base_pitch_hz": 130,
        "formant_shift": 1.0,
        "speed": 1.0,
        "jitter": 0.01,
        "shimmer": 0.01,
        "rest_viseme": "closed"
    }'::jsonb,
    sample_pack_url text, -- Supabase storage path for animalese blip source
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Projects & Dialogue Scripts
create table public.scripts (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade not null,
    title text not null,
    raw_text text not null,
    target_fps integer default 30 check (target_fps in (24, 30, 60)) not null,
    bgm_config jsonb default '{
        "asset_url": null,
        "volume_db": -6.0,
        "ducking_amount_db": -12.0
    }'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Render Runs & Artifact Tracking
create table public.render_runs (
    id uuid primary key default uuid_generate_v4(),
    script_id uuid references public.scripts(id) on delete cascade not null,
    character_id uuid references public.characters(id) on delete restrict not null,
    seed_used integer not null,
    status text check (status in ('queued', 'processing', 'completed', 'failed')) default 'queued' not null,
    master_audio_url text,      -- Supabase storage link to .wav
    manifest_url text,          -- Supabase storage link to .json
    stems_zip_url text,
    duration_ms integer,
    error_message text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Supabase Storage Buckets:
-- 1. 'audioforge-assets' (Public/Auth: source blips, sfx, bgm)
-- 2. 'audioforge-renders' (Private/Signed: master .wav files, manifests)

```

---

## 5. Phased Implementation Roadmap

### Phase 1: Core DSP & Determinism (Rust)

* Implement basic Liljencrants-Fant glottal pulse and biquad resonant filter in Rust.
* Build the CMUdict Trie reader and basic G2P mapper.
* Implement the synthesis scheduler that records sample-index viseme markers during synthesis.
* Write unit tests verifying that running the engine with the same seed outputs bit-exact identical WAV byte arrays.

### Phase 2: Compositor & Supabase Backend Pipeline

* Build `audioforge-mixer` with multi-bus gain and sidechain compression math.
* Setup Axum API server with routes: `POST /api/v1/render`, `POST /api/v1/preview`.
* Integrate `sqlx` for Supabase Postgres and `aws-sdk-s3` for uploading generated WAVs and JSON manifests.

### Phase 3: Frontend Studio & WASM Integration

* Compile `audioforge-core` to WebAssembly target.
* Build Next.js 15 studio interface: SSML-lite text editor, timeline playhead, and character voice sliders.
* Implement Web Audio API Worklet consuming the WASM module for local syllable previews.
* Implement HTML5 Canvas / SVG puppet visualizing viseme transitions during playback.

### Phase 4: Production Export & Polish

* Add framerate quantization (24/30/60 FPS snapping) and 2D sprite frame ID output.
* Implement FBX blendshape / CSV curve export formats.
* Add batch processing CLI tool for headless game asset builds.