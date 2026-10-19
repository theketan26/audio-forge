use crate::animalese::AnimaleseSynth;
use crate::articulator::ArticulatorDampedFilter;
use crate::dsp::{BiquadFilter, FormantTarget, LfGlottalPulse, NoiseGenerator};
use crate::fujisaki::{AccentCommand, FujisakiModel, PhraseCommand};
use crate::g2p::{G2pEngine, ScriptToken};
use crate::pink_noise::PinkNoiseGenerator;
use crate::psola::TdPsolaProcessor;
use crate::types::{
    AudioBuffer, EngineMode, PhonemeTiming, SpeechManifest, VisemeId, VoiceConfig,
};
use crate::viseme::VisemeTimelineEngine;
use rand::Rng;
use rand_pcg::Pcg32;
use rand::SeedableRng;

pub const DEFAULT_SAMPLE_RATE: u32 = 48000;

pub struct SpeechEngine {
    sample_rate: u32,
    g2p: G2pEngine,
    neural_engine: Option<std::sync::Arc<crate::neural::NeuralVitsEngine>>,
}

impl SpeechEngine {
    pub fn new() -> Self {
        Self::with_sample_rate(DEFAULT_SAMPLE_RATE)
    }

    pub fn with_sample_rate(sample_rate: u32) -> Self {
        let neural = crate::neural::NeuralVitsEngine::try_new().ok().map(std::sync::Arc::new);
        Self {
            sample_rate,
            g2p: G2pEngine::new(),
            neural_engine: neural,
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn has_neural_engine(&self) -> bool {
        self.neural_engine.is_some()
    }

    /// Primary synthesis entrypoint
    pub fn synthesize(
        &self,
        script: &str,
        mode: EngineMode,
        voice: &VoiceConfig,
        seed: u32,
        target_fps: u32,
    ) -> (AudioBuffer, SpeechManifest) {
        if mode == EngineMode::NeuralVits {
            if let Some(ref neural) = self.neural_engine {
                if let Ok(res) = neural.synthesize(script, voice, seed, target_fps) {
                    return res;
                }
            }
        }

        let mut rng = Pcg32::seed_from_u64(seed as u64);
        let tokens = self.g2p.parse_script(script, voice.speed);

        let mut audio = AudioBuffer::new(self.sample_rate);
        let mut phoneme_timings: Vec<PhonemeTiming> = Vec::new();
        let mut pitch_contour: Vec<f32> = Vec::new();

        match mode {
            EngineMode::NeuralVits | EngineMode::Formant => {
                self.synthesize_formant(
                    &tokens,
                    voice,
                    &mut rng,
                    &mut audio,
                    &mut phoneme_timings,
                    &mut pitch_contour,
                );
            }
            EngineMode::Granular => {
                self.synthesize_granular(
                    &tokens,
                    voice,
                    &mut rng,
                    &mut audio,
                    &mut phoneme_timings,
                    &mut pitch_contour,
                );
            }
            EngineMode::Psola => {
                self.synthesize_psola(
                    &tokens,
                    voice,
                    &mut rng,
                    &mut audio,
                    &mut phoneme_timings,
                    &mut pitch_contour,
                );
            }
        }

        let total_duration = audio.duration_sec();
        let timeline_engine = VisemeTimelineEngine::new(target_fps, voice.rest_viseme);
        let frames = timeline_engine.generate_frames(&phoneme_timings, total_duration);

        let manifest = SpeechManifest {
            script_text: script.to_string(),
            seed,
            sample_rate: self.sample_rate,
            duration_sec: total_duration,
            duration_ms: audio.duration_ms(),
            target_fps,
            total_frames: frames.len(),
            phonemes: phoneme_timings,
            frames,
            pitch_contour,
        };

        (audio, manifest)
    }

    fn synthesize_formant(
        &self,
        tokens: &[ScriptToken],
        voice: &VoiceConfig,
        rng: &mut Pcg32,
        audio: &mut AudioBuffer,
        timings: &mut Vec<PhonemeTiming>,
        pitch_contour: &mut Vec<f32>,
    ) {
        let sr = self.sample_rate as f32;
        let oq = if voice.glottal_dynamics.open_quotient > 0.0 {
            voice.glottal_dynamics.open_quotient
        } else {
            voice.open_quotient
        };
        let mut glottal = LfGlottalPulse::new(oq);

        let mut white_noise = NoiseGenerator::new(Pcg32::seed_from_u64(rng.gen::<u64>()));
        let mut pink_noise = PinkNoiseGenerator::new(Pcg32::seed_from_u64(rng.gen::<u64>()));

        // 2nd-order critically damped articulatory solver
        let mut articulator = ArticulatorDampedFilter::new(sr, voice.articulation_speed);

        let mut f1_filter = BiquadFilter::new();
        let mut f2_filter = BiquadFilter::new();
        let mut f3_filter = BiquadFilter::new();
        let mut f4_filter = BiquadFilter::new();

        // High-frequency aspiration bandpass filter (2 kHz - 5 kHz)
        let mut asp_filter = BiquadFilter::new();
        asp_filter.set_bandpass(sr, 3500.0, 2000.0, 0.0);

        // Pre-compute Fujisaki commands across the token timeline
        let mut phrase_commands = Vec::new();
        let mut accent_commands = Vec::new();

        let mut timeline_cursor_sec = 0.0f32;
        let mut in_new_clause = true;

        for token in tokens {
            match token {
                ScriptToken::Pause { duration_ms } => {
                    timeline_cursor_sec += duration_ms * 0.001;
                    if *duration_ms > 120.0 {
                        in_new_clause = true;
                    }
                }
                ScriptToken::Phoneme {
                    symbol,
                    duration_ms,
                    pitch_multiplier,
                    ..
                } => {
                    let dur_sec = duration_ms * 0.001;
                    if in_new_clause {
                        phrase_commands.push(PhraseCommand {
                            t_start: timeline_cursor_sec,
                            magnitude: 0.42 * pitch_multiplier,
                        });
                        in_new_clause = false;
                    }

                    // Stressed syllables or vowels receive accent command
                    let is_vowel = matches!(
                        symbol.as_str(),
                        "AA" | "AE" | "AH" | "AO" | "AW" | "AY" | "EH" | "ER" | "EY" | "IH" | "IY" | "OW" | "OY" | "UH" | "UW"
                    );
                    if is_vowel {
                        accent_commands.push(AccentCommand {
                            t_start: timeline_cursor_sec,
                            t_end: timeline_cursor_sec + dur_sec * 0.8,
                            amplitude: 0.55 * pitch_multiplier,
                        });
                    }

                    timeline_cursor_sec += dur_sec;
                }
            }
        }

        let fujisaki = FujisakiModel::new(voice.base_pitch_hz, voice.fujisaki_params.clone());
        let mut current_sec = 0.0f32;

        let jitter_pct = if voice.glottal_dynamics.jitter_pct > 0.0 {
            voice.glottal_dynamics.jitter_pct * 0.01
        } else {
            voice.jitter
        };

        let shimmer_pct = if voice.glottal_dynamics.shimmer_pct > 0.0 {
            voice.glottal_dynamics.shimmer_pct * 0.01
        } else {
            voice.shimmer
        };

        let breathiness = if voice.glottal_dynamics.breathiness_ratio > 0.0 {
            voice.glottal_dynamics.breathiness_ratio
        } else {
            voice.breathiness
        };

        for token in tokens {
            match token {
                ScriptToken::Pause { duration_ms } => {
                    let num_samples = ((*duration_ms / 1000.0) * sr).round() as usize;
                    let start_sample = audio.samples.len();
                    audio.samples.resize(start_sample + num_samples, 0.0);
                    let end_sample = audio.samples.len();

                    current_sec += *duration_ms * 0.001;

                    timings.push(PhonemeTiming {
                        phoneme: "PAUSE".to_string(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: VisemeId::Rest,
                        base_f0: 0.0,
                    });

                    pitch_contour.push(0.0);
                }
                ScriptToken::Phoneme {
                    symbol,
                    duration_ms,
                    pitch_multiplier,
                    viseme,
                    is_voiced,
                } => {
                    let target = FormantTarget::for_phoneme(symbol);
                    let shift = voice.formant_shift.clamp(0.5, 2.5);

                    let num_samples = ((*duration_ms / 1000.0) * sr).round().max(16.0) as usize;
                    let start_sample = audio.samples.len();

                    // Sample F0 at midpoint for phoneme timing record
                    let mid_t = current_sec + (*duration_ms * 0.0005);
                    let mid_f0 = fujisaki.calculate_f0(
                        mid_t,
                        &phrase_commands,
                        &accent_commands,
                        FujisakiModel::micro_perturbation(symbol, 0.5),
                    ) * pitch_multiplier;
                    pitch_contour.push(mid_f0);

                    for i in 0..num_samples {
                        let sample_t = current_sec + (i as f32 / sr);
                        let rel_t = i as f32 / num_samples as f32;

                        // 1. Continuous Fujisaki F0 with micro-perturbations
                        let micro = FujisakiModel::micro_perturbation(symbol, rel_t);
                        let smooth_f0 = fujisaki.calculate_f0(
                            sample_t,
                            &phrase_commands,
                            &accent_commands,
                            micro,
                        ) * pitch_multiplier;

                        // 2. 1/f Pink Noise Jitter & Shimmer
                        let pink_val = pink_noise.next_sample();
                        let jitter_factor = 1.0 + (pink_val * jitter_pct);
                        let shimmer_factor = 1.0 + (pink_val * shimmer_pct);

                        let current_f0 = (smooth_f0 * jitter_factor).clamp(40.0, 1000.0);

                        // 3. Critically Damped Formant Trajectory Step
                        articulator.step(&target, shift);

                        // Update biquad filters with smooth critically damped trajectories
                        // Update coefficients every 16 samples for performance
                        if i % 16 == 0 {
                            f1_filter.set_bandpass(sr, articulator.f1, articulator.b1, articulator.g1_db);
                            f2_filter.set_bandpass(sr, articulator.f2, articulator.b2, articulator.g2_db);
                            f3_filter.set_bandpass(sr, articulator.f3, articulator.b3, articulator.g3_db);
                            f4_filter.set_bandpass(sr, articulator.f4, articulator.b4, articulator.g4_db);
                        }

                        // 4. Glottal LF Pulse + Glottal-Synchronous Aspiration Turbulency
                        let glottal_val = if *is_voiced {
                            glottal.next_sample(current_f0, sr) * shimmer_factor
                        } else {
                            0.0
                        };

                        let white_val = white_noise.next_sample();
                        let asp_val = asp_filter.process(white_val);

                        // Modulate aspiration noise with glottal open phase
                        let glottal_asp = asp_val * (0.5 + 0.5 * glottal_val.max(0.0)) * breathiness;

                        let excitation = if *is_voiced {
                            (1.0 - articulator.noise_mix) * glottal_val
                                + articulator.noise_mix * white_val * 0.4
                                + glottal_asp
                        } else {
                            white_val * 0.8
                        };

                        // 5. Cascaded Vocal Tract Filtering
                        let s1 = f1_filter.process(excitation);
                        let s2 = f2_filter.process(excitation);
                        let s3 = f3_filter.process(excitation);
                        let s4 = f4_filter.process(excitation);

                        let combined = (s1 + s2 * 0.8 + s3 * 0.5 + s4 * 0.3) * 0.45;

                        // Smooth boundary windowing
                        let ramp = if i < 48 {
                            i as f32 / 48.0
                        } else if i > num_samples - 48 {
                            (num_samples - i) as f32 / 48.0
                        } else {
                            1.0
                        };

                        audio.samples.push(combined * ramp);
                    }

                    current_sec += *duration_ms * 0.001;
                    let end_sample = audio.samples.len();

                    timings.push(PhonemeTiming {
                        phoneme: symbol.clone(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: *viseme,
                        base_f0: mid_f0,
                    });
                }
            }
        }
    }

    fn synthesize_granular(
        &self,
        tokens: &[ScriptToken],
        voice: &VoiceConfig,
        rng: &mut Pcg32,
        audio: &mut AudioBuffer,
        timings: &mut Vec<PhonemeTiming>,
        pitch_contour: &mut Vec<f32>,
    ) {
        let sr = self.sample_rate as f32;
        let synth = AnimaleseSynth::new(self.sample_rate);

        for token in tokens {
            match token {
                ScriptToken::Pause { duration_ms } => {
                    let num_samples = ((*duration_ms / 1000.0) * sr).round() as usize;
                    let start_sample = audio.samples.len();
                    audio.samples.resize(start_sample + num_samples, 0.0);
                    let end_sample = audio.samples.len();

                    timings.push(PhonemeTiming {
                        phoneme: "PAUSE".to_string(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: VisemeId::Rest,
                        base_f0: 0.0,
                    });
                    pitch_contour.push(0.0);
                }
                ScriptToken::Phoneme {
                    symbol,
                    duration_ms,
                    pitch_multiplier,
                    viseme,
                    ..
                } => {
                    let char_code = symbol.chars().next().unwrap_or('A') as u32;
                    let grain = synth.render_grain(
                        char_code,
                        voice.base_pitch_hz * 2.2,
                        *pitch_multiplier,
                        (*duration_ms * 0.7).clamp(25.0, 70.0),
                        rng,
                    );

                    let start_sample = audio.samples.len();
                    audio.samples.extend_from_slice(&grain);
                    let end_sample = audio.samples.len();

                    pitch_contour.push(voice.base_pitch_hz * *pitch_multiplier * 2.2);

                    timings.push(PhonemeTiming {
                        phoneme: symbol.clone(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: *viseme,
                        base_f0: voice.base_pitch_hz * *pitch_multiplier * 2.2,
                    });
                }
            }
        }
    }

    fn synthesize_psola(
        &self,
        tokens: &[ScriptToken],
        voice: &VoiceConfig,
        _rng: &mut Pcg32,
        audio: &mut AudioBuffer,
        timings: &mut Vec<PhonemeTiming>,
        pitch_contour: &mut Vec<f32>,
    ) {
        let sr = self.sample_rate as f32;
        let psola = TdPsolaProcessor::new(self.sample_rate);
        let fujisaki = FujisakiModel::new(voice.base_pitch_hz, voice.fujisaki_params.clone());

        let mut timeline_cursor_sec = 0.0f32;

        for token in tokens {
            match token {
                ScriptToken::Pause { duration_ms } => {
                    let num_samples = ((*duration_ms / 1000.0) * sr).round() as usize;
                    let start_sample = audio.samples.len();
                    audio.samples.resize(start_sample + num_samples, 0.0);
                    let end_sample = audio.samples.len();

                    timeline_cursor_sec += *duration_ms * 0.001;

                    timings.push(PhonemeTiming {
                        phoneme: "PAUSE".to_string(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: VisemeId::Rest,
                        base_f0: 0.0,
                    });
                    pitch_contour.push(0.0);
                }
                ScriptToken::Phoneme {
                    symbol,
                    duration_ms,
                    pitch_multiplier,
                    viseme,
                    is_voiced,
                } => {
                    let num_samples = ((*duration_ms / 1000.0) * sr).round().max(16.0) as usize;
                    let target_f0 = fujisaki.calculate_f0(timeline_cursor_sec, &[], &[], 0.0) * pitch_multiplier;
                    pitch_contour.push(target_f0);

                    // Generate resonant prototype diphone grain
                    let target = FormantTarget::for_phoneme(symbol);
                    let mut proto = vec![0.0f32; (sr * 0.04) as usize];
                    let mut glottal = LfGlottalPulse::new(voice.glottal_dynamics.open_quotient);
                    let mut f1 = BiquadFilter::new();
                    let mut f2 = BiquadFilter::new();
                    f1.set_bandpass(sr, target.f1 * voice.formant_shift, target.b1, target.g1_db);
                    f2.set_bandpass(sr, target.f2 * voice.formant_shift, target.b2, target.g2_db);

                    for s in proto.iter_mut() {
                        let src = if *is_voiced { glottal.next_sample(voice.base_pitch_hz, sr) } else { 0.1 };
                        *s = f1.process(src) + f2.process(src) * 0.7;
                    }

                    let processed = psola.process_grain(&proto, voice.base_pitch_hz, target_f0, num_samples);

                    let start_sample = audio.samples.len();
                    audio.samples.extend_from_slice(&processed);
                    let end_sample = audio.samples.len();

                    timeline_cursor_sec += *duration_ms * 0.001;

                    timings.push(PhonemeTiming {
                        phoneme: symbol.clone(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: *viseme,
                        base_f0: target_f0,
                    });
                }
            }
        }
    }

    /// Exports audio buffer as standard 16-bit PCM WAV bytes
    pub fn export_wav_bytes(audio: &AudioBuffer) -> Result<Vec<u8>, hound::Error> {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: audio.sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };

        let mut cursor = std::io::Cursor::new(Vec::new());
        {
            let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
            for &s in &audio.samples {
                let clamped = s.clamp(-1.0, 1.0);
                let sample_i16 = (clamped * 32767.0).round() as i16;
                writer.write_sample(sample_i16)?;
            }
            writer.finalize()?;
        }

        Ok(cursor.into_inner())
    }
}
