use audioforge_core::engine::SpeechEngine;
use audioforge_core::fujisaki::{AccentCommand, FujisakiModel, PhraseCommand};
use audioforge_core::pink_noise::PinkNoiseGenerator;
use audioforge_core::types::{EngineMode, VoiceConfig};
use rand_pcg::Pcg32;
use rand::SeedableRng;

#[test]
fn test_bit_exact_determinism_formant_v2() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let script = "Hello world! Natural acoustics upgrade with Fujisaki prosody [pause:100ms] ready?";
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
fn test_neural_vits_synthesis() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let script = "Hello world! AudioForge v3 neural alignment test.";

    let (audio, manifest) = engine.synthesize(script, EngineMode::NeuralVits, &voice, 12345, 30);

    assert!(!audio.samples.is_empty(), "Audio buffer must not be empty");
    assert!(manifest.duration_sec > 0.0, "Duration must be greater than zero");
    assert!(!manifest.frames.is_empty(), "Viseme frames must be emitted");
    assert!(!manifest.phonemes.is_empty(), "Phonemes must be extracted");

    let wav = SpeechEngine::export_wav_bytes(&audio).expect("export wav");
    assert!(!wav.is_empty(), "WAV output must be valid bytes");
}

#[test]
fn test_fujisaki_continuous_pitch() {
    let model = FujisakiModel::new(130.0, Default::default());
    let phrases = vec![PhraseCommand { t_start: 0.0, magnitude: 0.5 }];
    let accents = vec![AccentCommand { t_start: 0.1, t_end: 0.3, amplitude: 0.6 }];

    let f0_start = model.calculate_f0(0.01, &phrases, &accents, 0.0);
    let f0_accent = model.calculate_f0(0.2, &phrases, &accents, 0.0);
    let f0_end = model.calculate_f0(1.5, &phrases, &accents, 0.0);

    // Accent peak must be higher than base/end
    assert!(f0_accent > f0_end, "Accent peak should be higher than relaxed tail");
    assert!(f0_start > 50.0 && f0_start < 500.0);
}

#[test]
fn test_pink_noise_generator() {
    let mut pink = PinkNoiseGenerator::new(Pcg32::seed_from_u64(12345));
    let mut sum = 0.0;
    for _ in 0..1000 {
        let s = pink.next_sample();
        assert!(s >= -1.0 && s <= 1.0);
        sum += s;
    }
    let mean = sum / 1000.0;
    assert!(mean.abs() < 0.25, "Mean of pink noise should be close to zero, got {}", mean);
}

#[test]
fn test_psola_mode_synthesis() {
    let engine = SpeechEngine::new();
    let voice = VoiceConfig::default();
    let script = "PSOLA diphone synthesis test";
    let (audio, manifest) = engine.synthesize(script, EngineMode::Psola, &voice, 54321, 30);

    assert!(!audio.samples.is_empty());
    assert!(!manifest.frames.is_empty());
    assert!(manifest.duration_sec > 0.0);
}
