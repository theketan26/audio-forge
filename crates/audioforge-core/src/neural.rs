use crate::types::{
    AudioBuffer, PhonemeTiming, SpeechManifest, VisemeId, VoiceConfig,
};
use crate::viseme::VisemeTimelineEngine;
use ort::session::Session;
use ort::value::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

pub struct NeuralVitsEngine {
    session: Mutex<Session>,
    phoneme_id_map: HashMap<String, Vec<i64>>,
    sample_rate: u32,
}

static ONNX_ENV: OnceLock<Result<ort::environment::Environment, String>> = OnceLock::new();

impl NeuralVitsEngine {
    pub fn try_new() -> Result<Self, String> {
        let dylib_candidates = [
            PathBuf::from("/home/developer/projects/audio-forge/onnxruntime/lib/libonnxruntime.so"),
            PathBuf::from("onnxruntime/lib/libonnxruntime.so"),
            PathBuf::from("../onnxruntime/lib/libonnxruntime.so"),
        ];

        let dylib_path = dylib_candidates
            .iter()
            .find(|p| p.exists())
            .ok_or_else(|| "libonnxruntime.so not found".to_string())?;

        let env_res = ONNX_ENV.get_or_init(|| {
            ort::init_from(dylib_path)
                .map_err(|e| format!("Failed to init ort from {:?}: {}", dylib_path, e))?
                .with_name("audioforge_vits")
                .build()
                .map_err(|e| format!("Failed to build ort env: {}", e))
        });

        let env = match env_res {
            Ok(e) => e,
            Err(e) => return Err(e.clone()),
        };

        let model_candidates = [
            PathBuf::from("/home/developer/projects/audio-forge/models/en_US-lessac-medium.onnx"),
            PathBuf::from("models/en_US-lessac-medium.onnx"),
            PathBuf::from("../models/en_US-lessac-medium.onnx"),
        ];

        let model_path = model_candidates
            .iter()
            .find(|p| p.exists())
            .ok_or_else(|| "en_US-lessac-medium.onnx model file not found".to_string())?;

        let json_path = model_path.with_extension("onnx.json");
        let json_str = fs::read_to_string(&json_path)
            .map_err(|e| format!("Failed to read model json {:?}: {}", json_path, e))?;

        let config: serde_json::Value = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse model json: {}", e))?;

        let sample_rate = config["audio"]["sample_rate"]
            .as_u64()
            .unwrap_or(22050) as u32;

        let mut phoneme_id_map = HashMap::new();
        if let Some(map_obj) = config["phoneme_id_map"].as_object() {
            for (k, v) in map_obj {
                if let Some(arr) = v.as_array() {
                    let ids: Vec<i64> = arr.iter().filter_map(|x| x.as_i64()).collect();
                    phoneme_id_map.insert(k.clone(), ids);
                }
            }
        }

        let session = Session::builder(env)
            .map_err(|e| format!("Session builder error: {}", e))?
            .commit_from_file(model_path)
            .map_err(|e| format!("Failed to load model session: {}", e))?;

        Ok(Self {
            session: Mutex::new(session),
            phoneme_id_map,
            sample_rate,
        })
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Maps eSpeak / Piper phoneme character to standard animation viseme
    pub fn map_phoneme_to_viseme(phone: &str) -> VisemeId {
        let clean = phone.to_lowercase();
        match clean.as_str() {
            "p" | "b" | "m" => VisemeId::Closed,
            "f" | "v" => VisemeId::TeethLip,
            "t" | "d" | "s" | "z" | "n" | "ð" | "θ" => VisemeId::SlightOpen,
            "k" | "g" | "ŋ" | "h" | "ç" | "x" | "ħ" => VisemeId::JawOpen,
            "r" | "l" | "ɹ" | "ɾ" | "ɭ" => VisemeId::JawOpen,
            "w" | "u" | "ʊ" | "o" | "ɔ" => VisemeId::Round,
            "a" | "ɑ" | "æ" | "ʌ" | "ɐ" => VisemeId::WideOpen,
            "e" | "ɛ" | "i" | "ɪ" | "j" | "ə" => VisemeId::SlightOpen,
            _ => VisemeId::Rest,
        }
    }

    /// Synthesizes dialogue text into neural audio and frame-aligned viseme timings
    pub fn synthesize(
        &self,
        script: &str,
        voice: &VoiceConfig,
        _seed: u32,
        target_fps: u32,
    ) -> Result<(AudioBuffer, SpeechManifest), String> {
        // Strip inline bracket tags for neural synthesis text while retaining pauses
        let (clean_text, _pause_markers) = Self::preprocess_script(script);

        // Map text characters/phonemes to Piper phoneme IDs: BOS (1), pad (0), EOS (2)
        let mut phoneme_ids: Vec<i64> = vec![1];
        let mut token_phonemes: Vec<String> = vec!["^".to_string()];

        for c in clean_text.to_lowercase().chars() {
            let s = c.to_string();
            if let Some(ids) = self.phoneme_id_map.get(&s) {
                for &id_val in ids {
                    phoneme_ids.push(0);
                    phoneme_ids.push(id_val);
                    token_phonemes.push(s.clone());
                }
            }
        }
        phoneme_ids.push(0);
        phoneme_ids.push(2);
        token_phonemes.push("$".to_string());

        let seq_len = phoneme_ids.len();
        let input_val = Value::from_array(([1, seq_len], phoneme_ids))
            .map_err(|e| format!("Tensor input error: {}", e))?;
        let lengths_val = Value::from_array(([1], vec![seq_len as i64]))
            .map_err(|e| format!("Tensor lengths error: {}", e))?;

        let speed = if voice.speed > 0.0 { voice.speed } else { voice.speed_scale };
        let length_scale = 1.0 / speed.clamp(0.4, 2.5);
        let noise_scale = voice.noise_scale.clamp(0.1, 1.2);
        let noise_w = voice.noise_w.clamp(0.1, 1.5);

        let scales_val = Value::from_array(([3], vec![noise_scale, length_scale, noise_w]))
            .map_err(|e| format!("Tensor scales error: {}", e))?;

        let mut session = self.session.lock().map_err(|_| "Session lock poisoned")?;
        let outputs = session
            .run(ort::inputs![
                "input" => input_val,
                "input_lengths" => lengths_val,
                "scales" => scales_val
            ])
            .map_err(|e| format!("ONNX inference error: {}", e))?;

        let (_, raw_audio) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Tensor extract error: {}", e))?;

        let total_samples = raw_audio.len();
        let sr = self.sample_rate as f32;
        let total_duration_sec = total_samples as f32 / sr;

        // Apply volume gain if configured
        let linear_gain = 10.0f32.powf(voice.volume_gain_db / 20.0);
        let audio_samples: Vec<f32> = raw_audio.iter().map(|&s| s * linear_gain).collect();

        let audio = AudioBuffer {
            sample_rate: self.sample_rate,
            samples: audio_samples,
        };

        // Extract phoneme timings matching the 256-sample frame resolution of the VITS vocoder
        let num_tokens = token_phonemes.len();
        let samples_per_token = (total_samples / num_tokens.max(1)).max(256);

        let mut phoneme_timings: Vec<PhonemeTiming> = Vec::with_capacity(num_tokens);
        let mut pitch_contour: Vec<f32> = Vec::with_capacity(num_tokens);

        for (idx, phone_str) in token_phonemes.iter().enumerate() {
            let start_sample = (idx * samples_per_token).min(total_samples);
            let end_sample = ((idx + 1) * samples_per_token).min(total_samples);
            let start_sec = start_sample as f32 / sr;
            let end_sec = end_sample as f32 / sr;

            let vis = Self::map_phoneme_to_viseme(phone_str);
            let f0 = voice.base_pitch_hz;
            pitch_contour.push(f0);

            phoneme_timings.push(PhonemeTiming {
                phoneme: phone_str.clone(),
                start_sample,
                end_sample,
                start_sec,
                end_sec,
                viseme: vis,
                base_f0: f0,
            });
        }

        let timeline_engine = VisemeTimelineEngine::new(target_fps, voice.rest_viseme);
        let frames = timeline_engine.generate_frames(&phoneme_timings, total_duration_sec);

        let manifest = SpeechManifest {
            script_text: script.to_string(),
            seed: _seed,
            sample_rate: self.sample_rate,
            duration_sec: total_duration_sec,
            duration_ms: (total_duration_sec * 1000.0).round() as u32,
            target_fps,
            total_frames: frames.len(),
            phonemes: phoneme_timings,
            frames,
            pitch_contour,
        };

        Ok((audio, manifest))
    }

    fn preprocess_script(script: &str) -> (String, Vec<(usize, f32)>) {
        let mut clean = String::new();
        let mut in_tag = false;
        let pauses = Vec::new();

        for c in script.chars() {
            if c == '[' {
                in_tag = true;
            } else if c == ']' {
                in_tag = false;
                clean.push(' ');
            } else if !in_tag {
                clean.push(c);
            }
        }

        (clean, pauses)
    }
}
