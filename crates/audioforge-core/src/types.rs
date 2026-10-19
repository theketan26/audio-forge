use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EngineMode {
    NeuralVits,
    Formant,
    Granular,
    Psola,
}

impl Default for EngineMode {
    fn default() -> Self {
        EngineMode::NeuralVits
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
pub struct GlottalDynamics {
    pub open_quotient: f32,      // 0.35 to 0.85
    pub breathiness_ratio: f32,  // 0.0 to 0.25
    pub jitter_pct: f32,         // 0.2 to 2.5%
    pub shimmer_pct: f32,        // 1.0 to 5.0%
}

impl Default for GlottalDynamics {
    fn default() -> Self {
        Self {
            open_quotient: 0.65,
            breathiness_ratio: 0.08,
            jitter_pct: 0.8,
            shimmer_pct: 2.5,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceConfig {
    #[serde(default = "default_model_checkpoint")]
    pub model_checkpoint: String,
    #[serde(default)]
    pub speaker_id: i64,
    #[serde(default = "default_speed_scale")]
    pub speed_scale: f32,
    #[serde(default = "default_noise_scale")]
    pub noise_scale: f32,
    #[serde(default = "default_noise_w")]
    pub noise_w: f32,
    #[serde(default)]
    pub volume_gain_db: f32,

    pub base_pitch_hz: f32,
    pub formant_shift: f32,
    pub speed: f32,
    #[serde(default)]
    pub articulation_speed: f32,
    #[serde(default)]
    pub pitch_range_st: f32,
    pub jitter: f32,
    pub shimmer: f32,
    pub breathiness: f32,
    pub open_quotient: f32,
    #[serde(default)]
    pub glottal_dynamics: GlottalDynamics,
    #[serde(default)]
    pub fujisaki_params: crate::fujisaki::FujisakiParams,
    pub rest_viseme: VisemeId,
}

fn default_model_checkpoint() -> String {
    "en_US-lessac-medium.onnx".to_string()
}
fn default_speed_scale() -> f32 {
    1.0
}
fn default_noise_scale() -> f32 {
    0.667
}
fn default_noise_w() -> f32 {
    0.8
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            model_checkpoint: default_model_checkpoint(),
            speaker_id: 0,
            speed_scale: 1.0,
            noise_scale: 0.667,
            noise_w: 0.8,
            volume_gain_db: 0.0,
            base_pitch_hz: 130.0,
            formant_shift: 1.0,
            speed: 1.0,
            articulation_speed: 1.1,
            pitch_range_st: 12.0,
            jitter: 0.012,
            shimmer: 0.015,
            breathiness: 0.06,
            open_quotient: 0.65,
            glottal_dynamics: GlottalDynamics::default(),
            fujisaki_params: crate::fujisaki::FujisakiParams::default(),
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
