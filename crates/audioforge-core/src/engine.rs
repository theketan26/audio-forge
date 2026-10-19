use crate::animalese::AnimaleseSynth;
use crate::dsp::{BiquadFilter, FormantTarget, LfGlottalPulse, NoiseGenerator};
use crate::g2p::{G2pEngine, ScriptToken};
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
}

impl SpeechEngine {
    pub fn new() -> Self {
        Self::with_sample_rate(DEFAULT_SAMPLE_RATE)
    }

    pub fn with_sample_rate(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            g2p: G2pEngine::new(),
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
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
        let mut rng = Pcg32::seed_from_u64(seed as u64);
        let tokens = self.g2p.parse_script(script, voice.speed);

        let mut audio = AudioBuffer::new(self.sample_rate);
        let mut phoneme_timings: Vec<PhonemeTiming> = Vec::new();
        let mut pitch_contour: Vec<f32> = Vec::new();

        match mode {
            EngineMode::Formant => {
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
        let mut glottal = LfGlottalPulse::new(voice.open_quotient);
        let mut noise_gen = NoiseGenerator::new(Pcg32::seed_from_u64(rng.gen::<u64>()));

        let mut f1_filter = BiquadFilter::new();
        let mut f2_filter = BiquadFilter::new();
        let mut f3_filter = BiquadFilter::new();
        let mut f4_filter = BiquadFilter::new();

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
                    is_voiced,
                } => {
                    let target = FormantTarget::for_phoneme(symbol);
                    let shift = voice.formant_shift.clamp(0.5, 2.5);

                    f1_filter.set_bandpass(sr, target.f1 * shift, target.b1, target.g1_db);
                    f2_filter.set_bandpass(sr, target.f2 * shift, target.b2, target.g2_db);
                    f3_filter.set_bandpass(sr, target.f3 * shift, target.b3, target.g3_db);
                    f4_filter.set_bandpass(sr, target.f4 * shift, target.b4, target.g4_db);

                    let num_samples = ((*duration_ms / 1000.0) * sr).round().max(16.0) as usize;
                    let start_sample = audio.samples.len();
                    let base_pitch = voice.base_pitch_hz * pitch_multiplier;
                    pitch_contour.push(base_pitch);

                    for i in 0..num_samples {
                        // Add deterministic jitter & shimmer
                        let jitter_factor = 1.0 + rng.gen_range(-voice.jitter..voice.jitter);
                        let shimmer_factor = 1.0 + rng.gen_range(-voice.shimmer..voice.shimmer);
                        let current_f0 = (base_pitch * jitter_factor).clamp(40.0, 1000.0);

                        let voiced_src = if *is_voiced {
                            glottal.next_sample(current_f0, sr) * shimmer_factor
                        } else {
                            0.0
                        };

                        let noise_src = noise_gen.next_sample();
                        let breath = voice.breathiness;

                        // Balance excitation mix
                        let excitation = if *is_voiced {
                            (1.0 - target.noise_mix) * voiced_src
                                + (target.noise_mix + breath) * noise_src * 0.4
                        } else {
                            noise_src * 0.8
                        };

                        // Cascaded resonant filter bank
                        let s1 = f1_filter.process(excitation);
                        let s2 = f2_filter.process(excitation);
                        let s3 = f3_filter.process(excitation);
                        let s4 = f4_filter.process(excitation);

                        let combined = (s1 + s2 * 0.8 + s3 * 0.5 + s4 * 0.3) * 0.45;

                        // Gentle ramp up/down at boundaries
                        let ramp = if i < 64 {
                            i as f32 / 64.0
                        } else if i > num_samples - 64 {
                            (num_samples - i) as f32 / 64.0
                        } else {
                            1.0
                        };

                        audio.samples.push(combined * ramp);
                    }

                    let end_sample = audio.samples.len();
                    timings.push(PhonemeTiming {
                        phoneme: symbol.clone(),
                        start_sample,
                        end_sample,
                        start_sec: start_sample as f32 / sr,
                        end_sec: end_sample as f32 / sr,
                        viseme: *viseme,
                        base_f0: base_pitch,
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
                        voice.base_pitch_hz * 2.2, // higher retro frequency for animalese
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
