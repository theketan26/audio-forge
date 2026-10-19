use audioforge_core::types::AudioBuffer;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BusType {
    Voice,
    Sfx,
    Bgm,
    Master,
}

#[derive(Debug, Clone)]
pub struct AudioBus {
    pub bus_type: BusType,
    pub volume_db: f32,
    pub pan: f32, // -1.0 to +1.0
    pub buffer: AudioBuffer,
}

impl AudioBus {
    pub fn new(bus_type: BusType, sample_rate: u32) -> Self {
        Self {
            bus_type,
            volume_db: 0.0,
            pan: 0.0,
            buffer: AudioBuffer::new(sample_rate),
        }
    }

    pub fn with_capacity(bus_type: BusType, sample_rate: u32, samples_count: usize) -> Self {
        Self {
            bus_type,
            volume_db: 0.0,
            pan: 0.0,
            buffer: AudioBuffer {
                sample_rate,
                samples: vec![0.0; samples_count],
            },
        }
    }

    pub fn linear_gain(&self) -> f32 {
        10.0f32.powf(self.volume_db / 20.0)
    }

    pub fn clear(&mut self) {
        self.buffer.samples.fill(0.0);
    }
}
