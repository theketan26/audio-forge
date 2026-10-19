use audioforge_core::engine::SpeechEngine;
use audioforge_core::types::{AudioBuffer, EngineMode, VoiceConfig};
use audioforge_mixer::compositor::{AudioCompositor, MixConfig};

#[test]
fn test_compositor_sidechain_and_mix() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let (voice_audio, _) = engine.synthesize("Voice testing sidechain ducking", EngineMode::Formant, &voice, 777, 30);

    // Create a mock constant tone BGM
    let mut bgm = AudioBuffer::new(engine.sample_rate());
    let bgm_len = voice_audio.samples.len();
    for i in 0..bgm_len {
        let t = i as f32 / engine.sample_rate() as f32;
        let tone = (2.0 * std::f32::consts::PI * 220.0 * t).sin() * 0.3;
        bgm.samples.push(tone);
    }

    let config = MixConfig::default();
    let compositor = AudioCompositor::new(config, engine.sample_rate());
    let stems = compositor.mix(&voice_audio, Some(&bgm), &[]);

    assert_eq!(stems.master.samples.len(), voice_audio.samples.len());
    assert_eq!(stems.bgm.samples.len(), voice_audio.samples.len());
    assert_eq!(stems.voice.samples.len(), voice_audio.samples.len());

    // Master limiter check: samples should never exceed ~1.0
    for &s in &stems.master.samples {
        assert!(s.abs() <= 1.0001, "Master peak must not exceed limiter ceiling, got {}", s);
    }

    // Verify WAV export produces valid bytes
    let master_wav = SpeechEngine::export_wav_bytes(&stems.master).expect("master wav");
    assert!(!master_wav.is_empty());
}
