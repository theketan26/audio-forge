use audioforge_core::engine::SpeechEngine;
use audioforge_core::types::{EngineMode, VoiceConfig};

#[test]
fn test_bit_exact_determinism_formant() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let script = "Hello world! This is AudioForge speech synthesis [pause:100ms] ready?";
    let seed = 424242;

    let (audio1, manifest1) = engine.synthesize(script, EngineMode::Formant, &voice, seed, 30);
    let (audio2, manifest2) = engine.synthesize(script, EngineMode::Formant, &voice, seed, 30);

    let wav1 = SpeechEngine::export_wav_bytes(&audio1).expect("wav1 export");
    let wav2 = SpeechEngine::export_wav_bytes(&audio2).expect("wav2 export");

    assert_eq!(wav1.len(), wav2.len(), "WAV byte lengths must match");
    assert_eq!(wav1, wav2, "WAV bytes must be 100% bit-exact identical for identical seeds");
    assert_eq!(audio1.samples, audio2.samples, "Sample arrays must be identical");
    assert_eq!(manifest1.frames.len(), manifest2.frames.len(), "Frame counts must match");
    assert_eq!(manifest1.phonemes.len(), manifest2.phonemes.len(), "Phoneme counts must match");
}

#[test]
fn test_bit_exact_determinism_granular() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let script = "Animalese retro blip synthesis test!";
    let seed = 999123;

    let (audio1, _) = engine.synthesize(script, EngineMode::Granular, &voice, seed, 60);
    let (audio2, _) = engine.synthesize(script, EngineMode::Granular, &voice, seed, 60);

    let wav1 = SpeechEngine::export_wav_bytes(&audio1).expect("wav1");
    let wav2 = SpeechEngine::export_wav_bytes(&audio2).expect("wav2");

    assert_eq!(wav1, wav2, "Granular mode must also be 100% bit-exact deterministic");
}

#[test]
fn test_viseme_timing_coverage() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let script = "Testing lip sync and frame snapping";
    let (_, manifest) = engine.synthesize(script, EngineMode::Formant, &voice, 1234, 30);

    assert!(!manifest.phonemes.is_empty(), "Phonemes must be scheduled");
    assert!(!manifest.frames.is_empty(), "Frames must be generated");
    assert!(manifest.duration_sec > 0.0, "Duration must be positive");

    for frame in &manifest.frames {
        assert!(frame.primary_weight >= 0.0 && frame.primary_weight <= 1.0);
        assert!(frame.blendshapes.contains_key("wide_open"));
        assert!(frame.blendshapes.contains_key("closed"));
    }
}
