use crate::bus::{AudioBus, BusType};
use crate::limiter::MasterLimiter;
use crate::sidechain::{SidechainConfig, SidechainDucker};
use audioforge_core::engine::SpeechEngine;
use audioforge_core::types::AudioBuffer;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MixConfig {
    pub voice_volume_db: f32,
    pub bgm_volume_db: f32,
    pub sfx_volume_db: f32,
    pub master_volume_db: f32,
    pub sidechain: SidechainConfig,
    pub limiter_ceiling_db: f32,
}

impl Default for MixConfig {
    fn default() -> Self {
        Self {
            voice_volume_db: 0.0,
            bgm_volume_db: -6.0,
            sfx_volume_db: -3.0,
            master_volume_db: -0.5,
            sidechain: SidechainConfig::default(),
            limiter_ceiling_db: -0.2,
        }
    }
}

pub struct MixedStems {
    pub master: AudioBuffer,
    pub voice: AudioBuffer,
    pub bgm: AudioBuffer,
    pub sfx: AudioBuffer,
}

pub struct AudioCompositor {
    config: MixConfig,
    sample_rate: u32,
}

impl AudioCompositor {
    pub fn new(config: MixConfig, sample_rate: u32) -> Self {
        Self { config, sample_rate }
    }

    pub fn mix(
        &self,
        voice: &AudioBuffer,
        bgm: Option<&AudioBuffer>,
        sfx_events: &[(usize, &AudioBuffer)], // (start_sample, buffer)
    ) -> MixedStems {
        let mut total_samples = voice.samples.len();

        if let Some(b) = bgm {
            total_samples = total_samples.max(b.samples.len());
        }

        for (start, sfx) in sfx_events {
            total_samples = total_samples.max(*start + sfx.samples.len());
        }

        // Voice bus
        let mut voice_bus = AudioBus::with_capacity(BusType::Voice, self.sample_rate, total_samples);
        voice_bus.volume_db = self.config.voice_volume_db;
        let voice_gain = voice_bus.linear_gain();
        for (i, &s) in voice.samples.iter().enumerate() {
            voice_bus.buffer.samples[i] = s * voice_gain;
        }

        // BGM bus
        let mut bgm_bus = AudioBus::with_capacity(BusType::Bgm, self.sample_rate, total_samples);
        bgm_bus.volume_db = self.config.bgm_volume_db;
        let bgm_gain = bgm_bus.linear_gain();
        if let Some(b) = bgm {
            let b_len = b.samples.len();
            for i in 0..total_samples {
                // Loop or play BGM
                let src_sample = if b_len > 0 { b.samples[i % b_len] } else { 0.0 };
                bgm_bus.buffer.samples[i] = src_sample * bgm_gain;
            }
        }

        // SFX bus
        let mut sfx_bus = AudioBus::with_capacity(BusType::Sfx, self.sample_rate, total_samples);
        sfx_bus.volume_db = self.config.sfx_volume_db;
        let sfx_gain = sfx_bus.linear_gain();
        for (start, sfx) in sfx_events {
            for (idx, &s) in sfx.samples.iter().enumerate() {
                let target_idx = *start + idx;
                if target_idx < total_samples {
                    sfx_bus.buffer.samples[target_idx] += s * sfx_gain;
                }
            }
        }

        // Sidechain ducking of BGM by Voice
        let ducker = SidechainDucker::new(self.config.sidechain.clone(), self.sample_rate);
        ducker.process(&voice_bus.buffer.samples, &mut bgm_bus.buffer.samples);

        // Master sum
        let master_gain = 10.0f32.powf(self.config.master_volume_db / 20.0);
        let mut master_buffer = AudioBuffer::with_capacity(self.sample_rate, total_samples);

        for i in 0..total_samples {
            let sum = (voice_bus.buffer.samples[i] + bgm_bus.buffer.samples[i] + sfx_bus.buffer.samples[i]) * master_gain;
            master_buffer.samples.push(sum);
        }

        // Apply Master Limiter
        let limiter = MasterLimiter::new(self.config.limiter_ceiling_db);
        limiter.process_buffer(&mut master_buffer.samples);

        MixedStems {
            master: master_buffer,
            voice: voice_bus.buffer,
            bgm: bgm_bus.buffer,
            sfx: sfx_bus.buffer,
        }
    }

    /// Renders mixed master to WAV byte array
    pub fn render_to_wav(
        &self,
        voice: &AudioBuffer,
        bgm: Option<&AudioBuffer>,
        sfx: &[(usize, &AudioBuffer)],
    ) -> Result<Vec<u8>, hound::Error> {
        let stems = self.mix(voice, bgm, sfx);
        SpeechEngine::export_wav_bytes(&stems.master)
    }
}
