use audioforge_core::engine::SpeechEngine;
use audioforge_core::types::{AudioBuffer, EngineMode, VisemeId, VoiceConfig};
use audioforge_core::viseme::VisemeTimelineEngine;
use audioforge_mixer::compositor::{AudioCompositor, MixConfig};
use clap::{Parser, ValueEnum};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, ValueEnum)]
enum CliEngineMode {
    Neural,
    Formant,
    Granular,
    Psola,
}

#[derive(Parser, Debug)]
#[command(name = "audioforge-cli")]
#[command(about = "Deterministic speech synthesis and viseme timing engine for games and animation", long_about = None)]
struct Args {
    /// Dialogue text to synthesize (supports inline SSML-lite badges like [pause:200ms] [pitch:+10%])
    #[arg(short, long, default_value = "Hello world! Welcome to AudioForge.")]
    script: String,

    /// Synthesis mode: neural (Piper VITS embedded), formant (vocal tract), granular (animalese), or psola
    #[arg(short, long, value_enum, default_value_t = CliEngineMode::Neural)]
    mode: CliEngineMode,

    /// Deterministic 32-bit random seed
    #[arg(long, default_value_t = 424242)]
    seed: u32,

    /// Target animation framerate (24, 30, or 60 FPS)
    #[arg(long, default_value_t = 30)]
    fps: u32,

    /// Base vocal pitch F0 in Hz
    #[arg(long, default_value_t = 130.0)]
    base_pitch: f32,

    /// Formant frequency shift multiplier (0.5 to 2.0)
    #[arg(long, default_value_t = 1.0)]
    formant_shift: f32,

    /// Playback speed multiplier
    #[arg(long, default_value_t = 1.0)]
    speed: f32,

    /// Jitter coefficient (pitch irregularity)
    #[arg(long, default_value_t = 0.012)]
    jitter: f32,

    /// Shimmer coefficient (amplitude perturbation)
    #[arg(long, default_value_t = 0.015)]
    shimmer: f32,

    /// Output WAV file path
    #[arg(long, default_value = "output.wav")]
    wav_out: PathBuf,

    /// Output JSON manifest file path
    #[arg(long, default_value = "output_manifest.json")]
    manifest_out: PathBuf,

    /// Optional output CSV curve file path for blendshapes
    #[arg(long)]
    csv_out: Option<PathBuf>,

    /// Optional BGM WAV path for multi-bus sidechain ducked mix
    #[arg(long)]
    bgm_wav: Option<PathBuf>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    println!("⚡ AudioForge Engine initializing...");
    println!("  Script: \"{}\"", args.script);
    println!("  Mode: {:?}", args.mode);
    println!("  Seed: {}", args.seed);
    println!("  FPS: {}", args.fps);

    let engine = SpeechEngine::new();
    let voice = VoiceConfig {
        base_pitch_hz: args.base_pitch,
        formant_shift: args.formant_shift,
        speed: args.speed,
        jitter: args.jitter,
        shimmer: args.shimmer,
        breathiness: 0.06,
        open_quotient: 0.6,
        rest_viseme: VisemeId::Rest,
        ..Default::default()
    };

    let engine_mode = match args.mode {
        CliEngineMode::Neural => EngineMode::NeuralVits,
        CliEngineMode::Formant => EngineMode::Formant,
        CliEngineMode::Granular => EngineMode::Granular,
        CliEngineMode::Psola => EngineMode::Psola,
    };

    let (voice_buffer, manifest) = engine.synthesize(
        &args.script,
        engine_mode,
        &voice,
        args.seed,
        args.fps,
    );

    println!("✓ Synthesis complete: {:.2}s duration ({} samples, {} frames)",
        manifest.duration_sec, voice_buffer.samples.len(), manifest.frames.len());

    let final_wav_bytes = if let Some(bgm_path) = args.bgm_wav {
        println!("  Loading BGM from {:?} for sidechain mixing...", bgm_path);
        let mut reader = hound::WavReader::open(bgm_path)?;
        let spec = reader.spec();
        let bgm_samples: Vec<f32> = match spec.sample_format {
            hound::SampleFormat::Int => {
                let max_val = (1i64 << (spec.bits_per_sample - 1)) as f32;
                reader.samples::<i32>().filter_map(|s| s.ok().map(|v| v as f32 / max_val)).collect()
            }
            hound::SampleFormat::Float => {
                reader.samples::<f32>().filter_map(|s| s.ok()).collect()
            }
        };

        let bgm_buf = AudioBuffer {
            sample_rate: spec.sample_rate,
            samples: bgm_samples,
        };

        let compositor = AudioCompositor::new(MixConfig::default(), engine.sample_rate());
        let stems = compositor.mix(&voice_buffer, Some(&bgm_buf), &[]);
        SpeechEngine::export_wav_bytes(&stems.master)?
    } else {
        SpeechEngine::export_wav_bytes(&voice_buffer)?
    };

    fs::write(&args.wav_out, &final_wav_bytes)?;
    println!("✓ Saved WAV audio -> {:?}", args.wav_out);

    let manifest_json = serde_json::to_string_pretty(&manifest)?;
    fs::write(&args.manifest_out, manifest_json)?;
    println!("✓ Saved Viseme Manifest -> {:?}", args.manifest_out);

    if let Some(csv_path) = args.csv_out {
        let csv_data = VisemeTimelineEngine::export_csv(&manifest.frames);
        fs::write(&csv_path, csv_data)?;
        println!("✓ Saved CSV Curves -> {:?}", csv_path);
    }

    println!("✨ Done! All game assets rendered deterministically.");
    Ok(())
}
