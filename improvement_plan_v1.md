To evolve AudioForge from a retro, robotic speech synthesizer into a natural, human-like voice engine, you must replace static acoustic modeling with **dynamic vocal tract physics, organic prosodic curves, and high-fidelity acoustic rendering**, while preserving your core invariant: **exact, upstream sample-to-viseme synchronization**.

Here is the upgraded engineering plan for **AudioForge v2: The Natural Acoustics Upgrade**.

---

# AudioForge v2 — Human-Grade Acoustics & Intonation Plan

## 1. Architectural Evolution: The Hybrid Neural-Acoustic Pipeline

In traditional TTS, neural models generate audio end-to-end, making frame-accurate lip-sync an acoustic guessing game.

AudioForge v2 retains full upstream control: **all durations and phoneme boundaries are decided deterministically first**. The acoustic layers then render natural voice textures across those exact time slices.

```
+-------------------------------------------------------------------------------------------------------+
|                                    1. Upstream Linguistic & Timing Pass                               |
|  Text Input -> CMUdict G2P -> Syllable Stress Parsing -> Explicit Phoneme Durations (Sample-Exact)   |
+-----------------------------------+-------------------------------------------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
            v                                               v
+-------------------------------+       +---------------------------------------------------------------+
| Viseme & Keyframe Dispatcher  |       |               2. Organic Acoustic Modeling                    |
| - Cubic Hermite Smoothing     |       | - Fujisaki Continuous F0 Pitch Contours                       |
| - Framerate Quantizer         |       | - 2nd-Order Critically Damped Formant Trajectories            |
| - Emits JSON Timing Manifest  |       | - Dynamic Aspiration & Glottal Open-Quotient                  |
+-------------------------------+       +-------------------------------+-------------------------------+
                                                                        |
                                                                        v
                                        +---------------------------------------------------------------+
                                        |               3. Acoustic Generation Layer                    |
                                        |   Option A: TD-PSOLA Diphone Splicing (Pure Math/Rust)        |
                                        |   Option B: Mel Intermediate -> ONNX Vocos Vocoder (Hybrid)   |
                                        +-------------------------------+-------------------------------+
                                                                        |
                                                                        v
                                        +---------------------------------------------------------------+
                                        |               4. Compositor & Mastering                       |
                                        | Multi-Bus Mixing -> Sidechain Ducking -> Master Limiter -> WAV|
                                        +---------------------------------------------------------------+

```

---

## 2. Core Acoustic Upgrades (Eliminating the "Robot")

### A. The Fujisaki Prosody & Intonation Engine

Monotone speech is the primary tell of a robotic engine. Humans speak with two overlapping pitch systems:

1. **Phrase Component ($G_p$):** A global baseline inflection curve per clause or sentence that surges at clause start and gradually decays toward the end.
2. **Accent Component ($G_a$):** Localized triangular/bell-shaped impulse responses applied to primary and secondary stressed syllables (`AA1`, `IY1`).
3. **Intrinsic Micro-Perturbations:**
* High vowels (`/i/`, `/u/`) are automatically shifted $+8\text{ to }+15\text{ Hz}$ higher than low open vowels (`/a/`).
* Voiceless stops (`/p/`, `/t/`, `/k/`) trigger a brief $+10\text{ Hz}$ pitch overshoot upon voice onset.



### B. Dynamic Coarticulation (Critically Damped Physics)

Static formants create an unnatural "stair-step" acoustic timbre. Human vocal tract articulators (tongue body, jaw, velum) have physical inertia and cannot snap instantly between positions.

* Model formant transitions ($F_1, F_2, F_3$) as a continuous 2nd-order critically damped system:

$$\ddot{F}(t) + 2\zeta\omega_n \dot{F}(t) + \omega_n^2 (F(t) - F_{\text{target}}) = 0$$


* Set damping ratio $\zeta = 1.0$ (no ringing/overshoot).
* Consonants pulling into vowels smoothly drag formant trajectories along natural acoustic paths (e.g., bilabial closures pull $F_2$ down toward $800\text{ Hz}$).



### C. Natural Glottal Source Modeling

Pure square, sawtooth, or simple triangular oscillators sound like cheap buzzers.

* **Liljencrants-Fant (LF) Glottal Model:** Synthesizes realistic vocal fold opening and abrupt closure phases.
* **Dynamic Open-Quotient ($O_q$):** Varies the ratio of time the vocal folds remain open. High $O_q$ produces soft, intimate, or whispery speech; low $O_q$ produces firm, authoritative speech.
* **Spectral Tilt & Turbulency:** Mixes high-frequency aspiration noise ($2\text{--}5\text{ kHz}$) modulated by the glottal cycle to inject realistic breathiness into vowels and word terminations.
* **Brownian Jitter & Shimmer:** Injects $1/f$ pink noise ($0.5\%\text{--}1.2\%$ pitch deviation, $2\%\text{--}4\%$ amplitude deviation) using the seeded PRNG.

---

## 3. Two Acoustic Paths for AudioForge

You can implement either pure programmatic synthesis or a hybrid neural vocoder depending on your deployment target.

| Metric | Option A: TD-PSOLA Diphone Splicer | Option B: Fast ONNX Vocoder (Vocos) |
| --- | --- | --- |
| **How It Works** | Slices human-recorded diphones (`/ba/`, `/at/`) and modifies pitch/duration via time-domain pitch-synchronous overlap-and-add. | Converts calculated phoneme/F0 curves into an 80-band Mel-spectrogram, then runs a non-autoregressive neural vocoder. |
| **Dependencies** | **Zero.** 100% pure Rust arithmetic (`hound`, custom buffers). | `ort` (ONNX Runtime) or `tract` in Rust. Single $\sim 15\text{ MB}$ model file. |
| **Audio Quality** | Natural human vocal texture, retro-concatenative character (vintage CD-ROM/PS1 style). | Modern, studio-quality natural human speech. |
| **Viseme Accuracy** | **100% frame-exact.** Timings match the diphone grain bounds. | **100% frame-exact.** Spectrogram frames map $1:1$ to sample blocks. |
| **WASM In-Browser** | Extremely lightweight; runs in any browser with zero lag. | Possible via WebAssembly SIMD, but requires downloading a 15 MB model file. |

---

## 4. Updated Data Schemas & Character Profiles

Expand the database schema to allow fine-grained acoustic and emotional tuning in the character presets.

### Enhanced Character Profile Schema (`voice_config`)

```json
{
  "engine_mode": "hybrid_vocos",
  "base_pitch_hz": 125,
  "pitch_range_st": 12.0,
  "fujisaki_params": {
    "phrase_decay_alpha": 2.0,
    "accent_decay_beta": 20.0,
    "accent_strength": 0.8
  },
  "glottal_dynamics": {
    "open_quotient": 0.65,
    "breathiness_ratio": 0.08,
    "jitter_pct": 0.8,
    "shimmer_pct": 2.5
  },
  "articulation_speed": 1.1,
  "default_viseme": "closed"
}

```

---

## 5. Implementation Roadmap for the Upgrade

### Milestone 1: Prosody & Continuous Dynamics (Rust DSP)

* Implement the Fujisaki model in `audioforge-core` to calculate smooth continuous $F_0$ arrays across sentences.
* Implement the 2nd-order damped formant trajectory solver for smooth vowel-consonant blending.
* Add 1/f pink-noise generator using `rand_pcg` for organic jitter and shimmer.

### Milestone 2: High-Fidelity Rendering Layer

* **For the pure Rust path:** Build the TD-PSOLA diphone slicer with pitch marking and Hann-windowed pitch shifting.
* **For the neural path:** Add a Mel-spectrogram synthesis matrix in `audioforge-core` and hook it into `ort` running the `Vocos` or `HiFi-GAN` ONNX checkpoint.

### Milestone 3: Frontend Studio Prosody Inspector

* Add a visual **Pitch (F0) & Energy Curve Editor** to the Next.js timeline, allowing animators to click and drag pitch inflection nodes directly over dialogue words.
* Update the Web Audio preview engine to reflect dynamic breathiness and open-quotient sliders in real time.