use rand::Rng;
use rand_pcg::Pcg32;
use std::f32::consts::PI;

/// Granular syllable blip synthesizer for Animalese / retro speech
pub struct AnimaleseSynth {
    sample_rate: u32,
}

impl AnimaleseSynth {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate }
    }

    /// Renders a single micro-grain syllable blip with windowed Hann crossfading
    pub fn render_grain(
        &self,
        char_code: u32,
        base_pitch: f32,
        pitch_mult: f32,
        duration_ms: f32,
        rng: &mut Pcg32,
    ) -> Vec<f32> {
        let sr = self.sample_rate as f32;
        let num_samples = ((duration_ms / 1000.0) * sr).round().max(64.0) as usize;
        let mut buffer = vec![0.0f32; num_samples];

        // Seed-deterministic pitch variation based on character letter + jitter
        let letter_pitch_bias = ((char_code % 26) as f32 / 26.0) * 0.4 - 0.2; // -20% to +20%
        let jitter = rng.gen_range(-0.03f32..0.03f32);
        let freq = (base_pitch * pitch_mult * (1.0 + letter_pitch_bias + jitter)).clamp(50.0, 1800.0);

        // Blip waveform: mix of harmonic sine + square/pulse wave for retro game timbre
        let harmonic2_gain = 0.45;
        let harmonic3_gain = 0.25;

        for i in 0..num_samples {
            let t = i as f32 / sr;
            let phase = 2.0 * PI * freq * t;

            // Synthesis core: rich retro wave
            let fundamental = phase.sin();
            let h2 = (phase * 2.0).sin() * harmonic2_gain;
            let h3 = (phase * 3.0).sin() * harmonic3_gain;
            let pulse = if (phase % (2.0 * PI)) < PI { 0.2 } else { -0.2 };

            let raw = 0.5 * fundamental + h2 + h3 + pulse;

            // Hann windowing envelope to eliminate clicks at grain boundaries
            let hann = 0.5 * (1.0 - (2.0 * PI * (i as f32 / (num_samples - 1) as f32)).cos());
            buffer[i] = raw * hann * 0.7;
        }

        buffer
    }
}
