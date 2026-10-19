use audioforge_core::engine::SpeechEngine;
use audioforge_core::types::{AudioBuffer, EngineMode, SpeechManifest, VisemeId, VoiceConfig};
use audioforge_mixer::compositor::{AudioCompositor, MixConfig};
use axum::{
    extract::{Path, State},
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: String,
    pub name: String,
    pub engine_mode: EngineMode,
    pub base_seed: u32,
    pub voice_config: VoiceConfig,
    pub sample_pack_url: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderRun {
    pub id: String,
    pub script_title: String,
    pub script_raw: String,
    pub character_id: String,
    pub character_name: String,
    pub seed_used: u32,
    pub status: String,
    pub duration_ms: u32,
    pub audio_base64: String,
    pub manifest: SpeechManifest,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct PreviewRequest {
    pub script: String,
    #[serde(default)]
    pub mode: EngineMode,
    #[serde(default = "default_seed")]
    pub seed: u32,
    #[serde(default = "default_fps")]
    pub target_fps: u32,
    #[serde(default)]
    pub voice_config: VoiceConfig,
}

fn default_seed() -> u32 {
    424242
}

fn default_fps() -> u32 {
    30
}

#[derive(Debug, Serialize)]
pub struct PreviewResponse {
    pub audio_base64: String,
    pub manifest: SpeechManifest,
    pub duration_ms: u32,
    pub seed_used: u32,
}

#[derive(Debug, Deserialize)]
pub struct RenderRequest {
    pub title: Option<String>,
    pub script: String,
    pub character_id: Option<String>,
    pub mode: Option<EngineMode>,
    pub seed: Option<u32>,
    pub target_fps: Option<u32>,
    pub voice_config: Option<VoiceConfig>,
    pub bgm_enabled: Option<bool>,
    pub bgm_volume_db: Option<f32>,
}

#[derive(Clone)]
pub struct AppState {
    pub characters: Arc<Mutex<HashMap<String, Character>>>,
    pub render_runs: Arc<Mutex<Vec<RenderRun>>>,
    pub speech_engine: Arc<SpeechEngine>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState {
        characters: Arc::new(Mutex::new(seed_default_characters())),
        render_runs: Arc::new(Mutex::new(Vec::new())),
        speech_engine: Arc::new(SpeechEngine::new()),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/v1/health", get(health_check))
        .route("/api/v1/preview", post(preview_dialogue))
        .route("/api/v1/render", post(render_dialogue))
        .route("/api/v1/characters", get(list_characters).post(create_character))
        .route("/api/v1/renders", get(list_renders))
        .route("/api/v1/renders/:id/wav", get(get_render_wav))
        .layer(cors)
        .with_state(state);

    let port = 3001;
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("🚀 AudioForge API server listening on http://0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "AudioForge API",
        "version": "0.1.0",
        "sample_rate": 48000
    }))
}

async fn preview_dialogue(
    State(state): State<AppState>,
    Json(payload): Json<PreviewRequest>,
) -> Result<Json<PreviewResponse>, StatusCode> {
    let (audio, manifest) = state.speech_engine.synthesize(
        &payload.script,
        payload.mode,
        &payload.voice_config,
        payload.seed,
        payload.target_fps,
    );

    let wav_bytes = SpeechEngine::export_wav_bytes(&audio)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let base64_str = base64::engine::general_purpose::STANDARD.encode(&wav_bytes);

    Ok(Json(PreviewResponse {
        audio_base64: base64_str,
        duration_ms: manifest.duration_ms,
        manifest,
        seed_used: payload.seed,
    }))
}

async fn render_dialogue(
    State(state): State<AppState>,
    Json(payload): Json<RenderRequest>,
) -> Result<Json<RenderRun>, StatusCode> {
    let char_id = payload.character_id.clone().unwrap_or_default();
    let characters = state.characters.lock().unwrap();
    let character = characters.get(&char_id).cloned();
    drop(characters);

    let mode = payload.mode.or_else(|| character.as_ref().map(|c| c.engine_mode)).unwrap_or(EngineMode::Formant);
    let voice_config = payload.voice_config.or_else(|| character.as_ref().map(|c| c.voice_config.clone())).unwrap_or_default();
    let seed = payload.seed.or_else(|| character.as_ref().map(|c| c.base_seed)).unwrap_or_else(|| rand::random());
    let fps = payload.target_fps.unwrap_or(30);

    let (voice_audio, manifest) = state.speech_engine.synthesize(
        &payload.script,
        mode,
        &voice_config,
        seed,
        fps,
    );

    // Optional multi-bus BGM generation with sidechain ducking
    let final_wav_bytes = if payload.bgm_enabled.unwrap_or(false) {
        let mut bgm_buf = AudioBuffer::new(state.speech_engine.sample_rate());
        let total = voice_audio.samples.len();
        // Generate an ambient synth pad for BGM
        for i in 0..total {
            let t = i as f32 / state.speech_engine.sample_rate() as f32;
            let pad = (2.0 * std::f32::consts::PI * 110.0 * t).sin() * 0.15
                + (2.0 * std::f32::consts::PI * 164.81 * t).sin() * 0.1
                + (2.0 * std::f32::consts::PI * 220.0 * t).sin() * 0.08;
            bgm_buf.samples.push(pad);
        }

        let mut mix_cfg = MixConfig::default();
        if let Some(vol) = payload.bgm_volume_db {
            mix_cfg.bgm_volume_db = vol;
        }

        let compositor = AudioCompositor::new(mix_cfg, state.speech_engine.sample_rate());
        let stems = compositor.mix(&voice_audio, Some(&bgm_buf), &[]);
        SpeechEngine::export_wav_bytes(&stems.master).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    } else {
        SpeechEngine::export_wav_bytes(&voice_audio).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    };

    let base64_str = base64::engine::general_purpose::STANDARD.encode(&final_wav_bytes);

    let char_name = character.as_ref().map(|c| c.name.clone()).unwrap_or_else(|| "Custom Voice".to_string());
    let run = RenderRun {
        id: Uuid::new_v4().to_string(),
        script_title: payload.title.unwrap_or_else(|| "Dialogue Clip".to_string()),
        script_raw: payload.script.clone(),
        character_id: char_id,
        character_name: char_name,
        seed_used: seed,
        status: "completed".to_string(),
        duration_ms: manifest.duration_ms,
        audio_base64: base64_str,
        manifest,
        created_at: Utc::now().to_rfc3339(),
    };

    let mut runs = state.render_runs.lock().unwrap();
    runs.insert(0, run.clone());

    Ok(Json(run))
}

async fn list_characters(State(state): State<AppState>) -> Json<Vec<Character>> {
    let chars = state.characters.lock().unwrap();
    let mut list: Vec<Character> = chars.values().cloned().collect();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    Json(list)
}

async fn create_character(
    State(state): State<AppState>,
    Json(mut payload): Json<Character>,
) -> (StatusCode, Json<Character>) {
    if payload.id.is_empty() {
        payload.id = Uuid::new_v4().to_string();
    }
    payload.created_at = Utc::now().to_rfc3339();

    let mut chars = state.characters.lock().unwrap();
    chars.insert(payload.id.clone(), payload.clone());

    (StatusCode::CREATED, Json(payload))
}

async fn list_renders(State(state): State<AppState>) -> Json<Vec<RenderRun>> {
    let runs = state.render_runs.lock().unwrap();
    Json(runs.clone())
}

async fn get_render_wav(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    let runs = state.render_runs.lock().unwrap();
    if let Some(run) = runs.iter().find(|r| r.id == id) {
        if let Ok(wav_bytes) = base64::engine::general_purpose::STANDARD.decode(&run.audio_base64) {
            return (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "audio/wav"), (header::CONTENT_DISPOSITION, "attachment; filename=\"render.wav\"")],
                wav_bytes,
            ).into_response();
        }
    }
    StatusCode::NOT_FOUND.into_response()
}

fn seed_default_characters() -> HashMap<String, Character> {
    let mut map = HashMap::new();

    let c1 = Character {
        id: "char-retro-hero".to_string(),
        name: "Retro Hero".to_string(),
        engine_mode: EngineMode::Formant,
        base_seed: 424242,
        voice_config: VoiceConfig {
            base_pitch_hz: 135.0,
            formant_shift: 1.05,
            speed: 1.0,
            jitter: 0.012,
            shimmer: 0.015,
            breathiness: 0.05,
            open_quotient: 0.58,
            rest_viseme: VisemeId::Rest,
        },
        sample_pack_url: None,
        created_at: Utc::now().to_rfc3339(),
    };

    let c2 = Character {
        id: "char-cyber-android".to_string(),
        name: "Cyber Android".to_string(),
        engine_mode: EngineMode::Formant,
        base_seed: 888123,
        voice_config: VoiceConfig {
            base_pitch_hz: 95.0,
            formant_shift: 0.88,
            speed: 1.08,
            jitter: 0.002, // very low jitter for mechanical precision
            shimmer: 0.005,
            breathiness: 0.02,
            open_quotient: 0.50,
            rest_viseme: VisemeId::Closed,
        },
        sample_pack_url: None,
        created_at: Utc::now().to_rfc3339(),
    };

    let c3 = Character {
        id: "char-forest-animalese".to_string(),
        name: "Forest Sprite (Animalese)".to_string(),
        engine_mode: EngineMode::Granular,
        base_seed: 555777,
        voice_config: VoiceConfig {
            base_pitch_hz: 220.0,
            formant_shift: 1.35,
            speed: 1.25,
            jitter: 0.035,
            shimmer: 0.03,
            breathiness: 0.08,
            open_quotient: 0.65,
            rest_viseme: VisemeId::Rest,
        },
        sample_pack_url: None,
        created_at: Utc::now().to_rfc3339(),
    };

    let c4 = Character {
        id: "char-ancient-sorcerer".to_string(),
        name: "Ancient Sorcerer".to_string(),
        engine_mode: EngineMode::Formant,
        base_seed: 314159,
        voice_config: VoiceConfig {
            base_pitch_hz: 82.0,
            formant_shift: 0.78,
            speed: 0.88,
            jitter: 0.025,
            shimmer: 0.03,
            breathiness: 0.12,
            open_quotient: 0.68,
            rest_viseme: VisemeId::Rest,
        },
        sample_pack_url: None,
        created_at: Utc::now().to_rfc3339(),
    };

    map.insert(c1.id.clone(), c1);
    map.insert(c2.id.clone(), c2);
    map.insert(c3.id.clone(), c3);
    map.insert(c4.id.clone(), c4);

    map
}
