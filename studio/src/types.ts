export type EngineMode = 'formant' | 'granular';

export type VisemeId =
  | 'rest'
  | 'closed'
  | 'slight_open'
  | 'wide_open'
  | 'round'
  | 'pucker'
  | 'teeth_lip'
  | 'jaw_open';

export interface VoiceConfig {
  base_pitch_hz: number;
  formant_shift: number;
  speed: number;
  jitter: number;
  shimmer: number;
  breathiness: number;
  open_quotient: number;
  rest_viseme: VisemeId;
}

export interface VisemeFrame {
  frame_index: number;
  timestamp_sec: number;
  primary: VisemeId;
  primary_weight: number;
  secondary: VisemeId | null;
  secondary_weight: number;
  sprite_frame_id: number;
  blendshapes: Record<string, number>;
}

export interface PhonemeTiming {
  phoneme: string;
  start_sample: number;
  end_sample: number;
  start_sec: number;
  end_sec: number;
  viseme: VisemeId;
  base_f0: number;
}

export interface SpeechManifest {
  script_text: string;
  seed: number;
  sample_rate: number;
  duration_sec: number;
  duration_ms: number;
  target_fps: number;
  total_frames: number;
  phonemes: PhonemeTiming[];
  frames: VisemeFrame[];
  pitch_contour: number[];
}

export interface Character {
  id: string;
  name: string;
  engine_mode: EngineMode;
  base_seed: number;
  voice_config: VoiceConfig;
  sample_pack_url?: string;
  created_at?: string;
}

export interface RenderRun {
  id: string;
  script_title: string;
  script_raw: string;
  character_id: string;
  character_name: string;
  seed_used: number;
  status: string;
  duration_ms: number;
  audio_base64: string;
  manifest: SpeechManifest;
  created_at: string;
}
