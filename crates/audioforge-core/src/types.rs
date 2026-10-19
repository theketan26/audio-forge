use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EngineMode {
    Formant,
    Granular,
}

impl Default for EngineMode {
    fn default() -> Self {
        EngineMode::Formant
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VisemeId {
    Rest,
    Closed,
    SlightOpen,
    WideOpen,
    Round,
    Pucker,
    TeethLip,
    JawOpen,
}

impl VisemeId {
    pub fn as_str(&self) -> &'static str {
        match self {
            VisemeId::Rest => "rest",
            VisemeId::Closed => "closed",
            VisemeId::SlightOpen => "slight_open",
            VisemeId::WideOpen => "wide_open",
            VisemeId::Round => "round",
            VisemeId::Pucker => "pucker",
            VisemeId::TeethLip => "teeth_lip",
            VisemeId::JawOpen => "jaw_open",
        }
    }

    pub fn to_sprite_id(&self) -> u32 {
        match self {
            VisemeId::Rest => 0,
            VisemeId::Closed => 1,
            VisemeId::SlightOpen => 2,
            VisemeId::WideOpen => 3,
            VisemeId::Round => 4,
            VisemeId::Pucker => 5,
            VisemeId::TeethLip => 6,
            VisemeId::JawOpen => 7,
        }
    }

    pub fn all() -> &'static [VisemeId] {
        &[
            VisemeId::Rest,
            VisemeId::Closed,
            VisemeId::SlightOpen,
            VisemeId::WideOpen,
            VisemeId::Round,
            VisemeId::Pucker,
            VisemeId::TeethLip,
            VisemeId::JawOpen,
        ]
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceConfig {
    pub base_pitch_hz: f32,
    pub formant_shift: f32,
    pub speed: f32,
    pub jitter: f32,
    pub shimmer: f32,
    pub breathiness: f32,
    pub open_quotient: f32,
    pub rest_viseme: VisemeId,
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            base_pitch_hz: 130.0,
            formant_shift: 1.0,
            speed: 1.0,
            jitter: 0.012,
            shimmer: 0.015,
            breathiness: 0.06,
            open_quotient: 0.6,
            rest_viseme: VisemeId::Rest,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisemeFrame {
    pub frame_index: usize,
    pub timestamp_sec: f32,
    pub primary: String,
    pub primary_weight: f32,
    pub secondary: Option<String>,
    pub secondary_weight: f32,
    pub sprite_frame_id: u32,
    pub blendshapes: HashMap<String, f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhonemeTiming {
    pub phoneme: String,
    pub start_sample: usize,
    pub end_sample: usize,
    pub start_sec: f32,
    pub end_sec: f32,
    pub viseme: VisemeId,
    pub base_f0: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpeechManifest {
    pub script_text: String,
    pub seed: u32,
    pub sample_rate: u32,
    pub duration_sec: f32,
    pub duration_ms: u32,
    pub target_fps: u32,
    pub total_frames: usize,
    pub phonemes: Vec<PhonemeTiming>,
    pub frames: Vec<VisemeFrame>,
    pub pitch_contour: Vec<f32>,
}

#[derive(Debug, Clone)]
pub struct AudioBuffer {
    pub sample_rate: u32,
    pub samples: Vec<f32>,
}

impl AudioBuffer {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            sample_rate,
            samples: Vec::new(),
        }
    }

    pub fn with_capacity(sample_rate: u32, capacity: usize) -> Self {
        Self {
            sample_rate,
            samples: Vec::with_capacity(capacity),
        }
    }

    pub fn duration_sec(&self) -> f32 {
        if self.sample_rate == 0 {
            0.0
        } else {
            self.samples.len() as f32 / self.sample_rate as f32
        }
    }

    pub fn duration_ms(&self) -> u32 {
        (self.duration_sec() * 1000.0).round() as u32
    }
}
