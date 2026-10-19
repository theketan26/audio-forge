Here is the complete engineering and architecture overhaul for AudioForge. This plan abandons raw, hand-crafted sample oscillators (which produce the muffled, disconnected spell-out artifacts) and implements the **Embedded Neural-Alignment Engine** using **Piper / VITS ONNX** in Rust.

This architecture guarantees natural, fluid human speech while preserving your primary requirement: **deterministic, millisecond-accurate lip-sync timing data**.

---

# AudioForge v3: Embedded Neural-Alignment Overhaul

```
                              [ Dialogue Text / Script ]
                                          |
                                          v
                      +---------------------------------------+
                      |       Piper G2P Phonemizer            |
                      |  - Converts words to eSpeak-NG phones |
                      |  - Identifies punctuation & pauses    |
                      +-------------------+-------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |         ONNX Runtime (VITS)           |
                      |  - Duration Predictor (Exact frames)  |
                      |  - Flow & HiFi-GAN Vocoder (Waveform) |
                      +-------------------+-------------------+
                                          |
                   +----------------------+----------------------+
                   |                                             |
                   v                                             v
+-------------------------------------+       +-------------------------------------+
|       Acoustic Waveform (.wav)      |       |      Phoneme Duration Stream        |
|  - 22,050 Hz / 48,000 Hz Linear PCM |       |  - Exact sample start/end bounds    |
|  - Studio-grade, natural coartic.   |       |  - Explicit per-phone durations     |
+------------------+------------------+       +------------------+------------------+
                   |                                             |
                   v                                             v
+-------------------------------------+       +-------------------------------------+
|        `audioforge-mixer`           |       |   Viseme Mapper & Frame Quantizer   |
|  - SFX & Foley Layering             |       |  - eSpeak -> Standard Viseme map    |
|  - Sidechain BGM Ducking            |       |  - 24 / 30 / 60 FPS Quantization    |
|  - Master Limiter & Peak Normalizer |       |  - Cubic weight interpolation       |
+------------------+------------------+       +------------------+------------------+
                   |                                             |
                   +----------------------+----------------------+
                                          |
                                          v
                         [ Master Audio + JSON Manifest ]
                         [ Loaded to Bento Studio & S3  ]

```

---

## 1. Technical Root-Cause Remediation

| Issue Observed in v1/v2 | Technical Root Cause | Resolution in v3 (Piper / VITS) |
| --- | --- | --- |
| **"Letters sound disconnected"** | Phonemes were synthesized as independent buffers without continuous vocal-tract boundary deformation. | VITS uses continuous latent representation flows where phoneme transitions are conditioned globally across the entire phrase. |
| **"Muffled sound"** | Pure formants lack high-frequency harmonic density and breath noise between 3 kHz and 8 kHz. | Embedded HiFi-GAN neural vocoder reconstructs full 22.05 kHz / 48 kHz acoustic bandwidth with natural sibilance and plosives. |
| **"Jittery & barely audible"** | Instantaneous coefficient recalculations in biquad filters caused phase-cancellation spikes. | Neural wave synthesis operates through continuous, learned inverse short-time Fourier transforms (iSTFT)—no manual filter coefficient steps. |
| **"Robotic cadence"** | Monotone pitch or overly simplistic Fujisaki pitch contours. | The VITS duration and pitch predictor models human cadence, phrase-final lengthening, and natural micro-prosody. |

---

## 2. Core Rust Engine Refactoring (`audioforge-core`)

Replace the custom oscillator and biquad filter bank with an embedded ONNX runtime runner using `ort`.

### Dependencies (`Cargo.toml`)

```toml
[dependencies]
# ONNX Runtime bindings for Rust
ort = { version = "2.0.0-rc.9", features = ["download-binaries"] }
# Fast tokenization and phoneme parsing
espeak-rs = "0.1" 
# Audio serialization
hound = "3.5"
# Deterministic random seed handling
rand_pcg = "0.3"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

```

### The Generation Pipeline

1. **Text to Phonemes:**
* Dialogue lines are parsed through `espeak-ng` to convert standard text into standard IPA phonemes with stress markers (e.g., `"Hello world"` $\to$ `['h', 'ə', 'l', 'ˈoʊ', 'w', 'ˈɜː', 'l', 'd']`).


2. **Deterministic ONNX Inference:**
* Pass the phoneme IDs, a target speaker ID, and a deterministic noise seed (`noise_scale`, `length_scale`) to the VITS model.
* **Extract Phoneme Durations:** The model's duration predictor generates an array of integer frame counts per phoneme. Since each frame represents exactly $256$ samples (at 22.05 kHz, $\sim 11.6\text{ ms}$ per frame), start and end timestamps are calculated directly:

$$\text{timestamp\_ms} = \frac{\text{frame\_index} \times 256}{\text{sample\_rate}} \times 1000$$




3. **Waveform Synthesis:**
* The vocoder stage generates natural, high-fidelity 32-bit float audio matching the predicted durations bit-for-bit.



---

## 3. Viseme Extraction & Coarticulation Engine

Map the explicit phoneme duration array directly into animation-ready viseme weights.

### Phoneme-to-Viseme Mapping Matrix

```rust
pub fn map_phoneme_to_viseme(phone: &str) -> &'static str {
    match phone {
        "p" | "b" | "m" => "closed",
        "f" | "v" => "teeth_on_lip",
        "t" | "d" | "s" | "z" | "n" => "slightly_open",
        "k" | "g" | "ng" | "h" => "neutral",
        "r" | "l" => "tongue_up",
        "w" | "u" | "oo" => "round",
        "a" | "aa" | "ae" | "ah" => "wide_open",
        "e" | "eh" | "i" | "ih" => "smile_open",
        _ => "rest",
    }
}

```

### Frame-Accurate Quantization & Interpolation

Raw phonemes snap violently if rendered as single discrete states. AudioForge v3 computes smooth transition curves:

* **Quantization:** Sample time offsets are snapped to the project's target framerate (e.g., 24, 30, or 60 FPS).
* **Weight Blending:** If a phoneme transition occurs midway through a video frame, compute fractional weights:

$$\text{weight}_{\text{current}} = \frac{t_{\text{end}} - t_{\text{frame}}}{\Delta t}, \quad \text{weight}_{\text{next}} = 1.0 - \text{weight}_{\text{current}}$$


* **Output Format:** Writes out both primary and secondary visemes for smooth blendshape animation.

---

## 4. Supabase Storage & Character Profile Schema Update

Update the character definitions in Supabase PostgreSQL to point to voice model checkpoints and stylistic parameters rather than broken formant numbers.

```sql
-- Updated Character Profile Schema for Neural Engine
alter table public.characters drop column if exists voice_config;

alter table public.characters add column voice_config jsonb not null default '{
    "model_checkpoint": "en_US-lessac-medium.onnx",
    "speaker_id": 0,
    "speed_scale": 1.0,
    "noise_scale": 0.667,       -- Organic variation (0.0 = monotone, 1.0 = expressive)
    "noise_w": 0.8,             -- Phoneme duration variance
    "rest_viseme": "closed",
    "volume_gain_db": 0.0
}'::jsonb;

```

---

## 5. Phased Implementation Roadmap

### Phase 1: Core Engine Swap (Rust + ONNX)

* [ ] Initialize `audioforge-core` with the `ort` crate.
* [ ] Download a compact, high-quality open-source Piper voice model (`en_US-lessac-medium.onnx` ~35MB).
* [ ] Implement inference pass returning the raw audio vector alongside the frame duration tensor.
* [ ] Write unit test: verify that audio sounds natural and contains clear consonants.

### Phase 2: Timing Extractor & Framerate Snapper

* [ ] Implement the `espeak` phoneme to viseme mapping table.
* [ ] Build the frame quantization loop to generate 30 FPS / 60 FPS JSON timing manifests.
* [ ] Verify that viseme timestamps align with the rendered `.wav` file in an external DAW/editor.

### Phase 3: Studio Dashboard Integration

* [ ] Update the Bento Studio's **Acoustic Waveform Hero Tile** to render real RMS energy directly from the neural output.
* [ ] Connect the **Live Puppet Inspector** in the frontend to drive the mouth shapes in real-time from the new JSON timing manifest.
* [ ] Hook character sliders (`Speed`, `Expressiveness / Noise Scale`, `Speaker ID`) to the new ONNX inference payload.