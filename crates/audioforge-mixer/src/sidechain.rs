use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidechainConfig {
    pub threshold_db: f32,      // e.g. -32.0 dB
    pub ducking_amount_db: f32, // e.g. -12.0 dB
    pub attack_ms: f32,         // e.g. 15.0 ms
    pub release_ms: f32,        // e.g. 250.0 ms
}

impl Default for SidechainConfig {
    fn default() -> Self {
        Self {
            threshold_db: -32.0,
            ducking_amount_db: -12.0,
            attack_ms: 15.0,
            release_ms: 250.0,
        }
    }
}

pub struct SidechainDucker {
    config: SidechainConfig,
    sample_rate: u32,
}

impl SidechainDucker {
    pub fn new(config: SidechainConfig, sample_rate: u32) -> Self {
        Self {
            config,
            sample_rate,
        }
    }

    /// Applies sidechain ducking to bgm_samples based on voice_samples
    pub fn process(&self, voice_samples: &[f32], bgm_samples: &mut [f32]) {
        let sr = self.sample_rate as f32;
        let attack_coeff = (-1.0 / (self.config.attack_ms * 0.001 * sr)).exp();
        let release_coeff = (-1.0 / (self.config.release_ms * 0.001 * sr)).exp();

        let threshold_linear = 10.0f32.powf(self.config.threshold_db / 20.0);
        let ducking_gain = 10.0f32.powf(self.config.ducking_amount_db / 20.0);

        let mut voice_env = 0.0f32;
        let mut gain_reduction = 1.0f32;

        let total_samples = bgm_samples.len();

        for i in 0..total_samples {
            let v_abs = if i < voice_samples.len() {
                voice_samples[i].abs()
            } else {
                0.0
            };

            // Envelope follower for voice
            if v_abs > voice_env {
                voice_env = attack_coeff * voice_env + (1.0 - attack_coeff) * v_abs;
            } else {
                voice_env = release_coeff * voice_env + (1.0 - release_coeff) * v_abs;
            }

            // Determine target attenuation
            let target_gain = if voice_env > threshold_linear {
                ducking_gain
            } else {
                1.0
            };

            // Smooth the gain change
            let gain_coeff = if target_gain < gain_reduction {
                attack_coeff
            } else {
                release_coeff
            };
            gain_reduction = gain_coeff * gain_reduction + (1.0 - gain_coeff) * target_gain;

            bgm_samples[i] *= gain_reduction;
        }
    }
}
