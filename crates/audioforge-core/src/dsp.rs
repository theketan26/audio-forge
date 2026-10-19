use rand::Rng;
use rand_pcg::Pcg32;
use std::f32::consts::PI;

/// Second-order biquad filter configured as a resonant bandpass
#[derive(Debug, Clone)]
pub struct BiquadFilter {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadFilter {
    pub fn new() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// Configure as resonant bandpass with peak gain (constant skirt gain, peak = Q)
    pub fn set_bandpass(&mut self, sample_rate: f32, center_freq: f32, bandwidth: f32, gain_db: f32) {
        let center_freq = center_freq.clamp(20.0, sample_rate * 0.48);
        let bandwidth = bandwidth.clamp(10.0, sample_rate * 0.4);
        let w0 = 2.0 * PI * center_freq / sample_rate;
        let q = (center_freq / bandwidth).clamp(0.2, 50.0);
        let alpha = (w0.sin() / (2.0 * q)).clamp(0.0001, 10.0);

        let cos_w0 = w0.cos();
        let a0 = 1.0 + alpha;
        let linear_gain = 10.0f32.powf(gain_db / 20.0);

        // Standard peaking bandpass biquad
        self.b0 = (alpha * linear_gain) / a0;
        self.b1 = 0.0;
        self.b2 = (-alpha * linear_gain) / a0;
        self.a1 = (-2.0 * cos_w0) / a0;
        self.a2 = (1.0 - alpha) / a0;
    }

    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;

        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        // Avoid denormals
        self.y1 = if output.abs() < 1e-15 { 0.0 } else { output };

        self.y1
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

/// Liljencrants-Fant (LF) glottal pulse excitation generator
#[derive(Debug, Clone)]
pub struct LfGlottalPulse {
    phase: f32,          // 0.0 to 1.0
    open_quotient: f32,  // typically 0.5 - 0.7
}

impl LfGlottalPulse {
    pub fn new(open_quotient: f32) -> Self {
        Self {
            phase: 0.0,
            open_quotient: open_quotient.clamp(0.3, 0.9),
        }
    }

    /// Advances phase and returns derivative of glottal flow
    pub fn next_sample(&mut self, freq: f32, sample_rate: f32) -> f32 {
        let phase_inc = (freq / sample_rate).clamp(0.0001, 0.45);
        self.phase += phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        let p = self.phase;
        let oq = self.open_quotient;

        if p < oq {
            // Opening and closing phase
            let norm_p = p / oq;
            // Differentiated Liljencrants-Fant shape approximation:
            // sinusoidal rise and steep descent
            (PI * norm_p).sin() * (1.0 - 1.5 * norm_p)
        } else {
            // Closed phase (return phase with slight exponential tail)
            let closed_p = (p - oq) / (1.0 - oq);
            -0.15 * (1.0 - closed_p).powi(2)
        }
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
    }
}

/// Noise generator (white/pinkish) with deterministic PCG RNG
pub struct NoiseGenerator {
    rng: Pcg32,
    b0: f32,
    b1: f32,
}

impl NoiseGenerator {
    pub fn new(rng: Pcg32) -> Self {
        Self {
            rng,
            b0: 0.0,
            b1: 0.0,
        }
    }

    /// Returns white noise filtered to soft pink-like spectrum
    pub fn next_sample(&mut self) -> f32 {
        let white = self.rng.gen_range(-1.0f32..1.0f32);
        // 1-pole lowpass filter for gentle roll-off
        self.b0 = 0.8 * self.b0 + 0.2 * white;
        self.b1 = 0.6 * self.b1 + 0.4 * self.b0;
        self.b1
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FormantTarget {
    pub f1: f32,
    pub b1: f32,
    pub g1_db: f32,
    pub f2: f32,
    pub b2: f32,
    pub g2_db: f32,
    pub f3: f32,
    pub b3: f32,
    pub g3_db: f32,
    pub f4: f32,
    pub b4: f32,
    pub g4_db: f32,
    pub noise_mix: f32, // 0.0 for pure vowel, 1.0 for voiceless fricative
}

impl FormantTarget {
    pub fn for_phoneme(phone: &str) -> Self {
        match phone {
            "AA" => Self { f1: 730.0, b1: 90.0, g1_db: 0.0, f2: 1090.0, b2: 110.0, g2_db: -4.0, f3: 2440.0, b3: 170.0, g3_db: -12.0, f4: 3500.0, b4: 250.0, g4_db: -20.0, noise_mix: 0.02 },
            "AE" => Self { f1: 660.0, b1: 80.0, g1_db: 0.0, f2: 1720.0, b2: 100.0, g2_db: -3.0, f3: 2410.0, b3: 140.0, g3_db: -10.0, f4: 3500.0, b4: 250.0, g4_db: -22.0, noise_mix: 0.02 },
            "AH" => Self { f1: 520.0, b1: 70.0, g1_db: 0.0, f2: 1190.0, b2: 100.0, g2_db: -5.0, f3: 2390.0, b3: 160.0, g3_db: -14.0, f4: 3500.0, b4: 250.0, g4_db: -24.0, noise_mix: 0.02 },
            "AO" => Self { f1: 570.0, b1: 80.0, g1_db: 0.0, f2: 840.0,  b2: 90.0,  g2_db: -5.0, f3: 2410.0, b3: 160.0, g3_db: -16.0, f4: 3500.0, b4: 250.0, g4_db: -26.0, noise_mix: 0.02 },
            "AW" => Self { f1: 700.0, b1: 90.0, g1_db: 0.0, f2: 1200.0, b2: 120.0, g2_db: -4.0, f3: 2350.0, b3: 150.0, g3_db: -14.0, f4: 3500.0, b4: 250.0, g4_db: -24.0, noise_mix: 0.02 },
            "AY" => Self { f1: 700.0, b1: 90.0, g1_db: 0.0, f2: 1600.0, b2: 120.0, g2_db: -4.0, f3: 2600.0, b3: 170.0, g3_db: -12.0, f4: 3500.0, b4: 250.0, g4_db: -22.0, noise_mix: 0.02 },
            "EH" => Self { f1: 530.0, b1: 70.0, g1_db: 0.0, f2: 1840.0, b2: 100.0, g2_db: -4.0, f3: 2480.0, b3: 150.0, g3_db: -11.0, f4: 3500.0, b4: 250.0, g4_db: -22.0, noise_mix: 0.02 },
            "ER" => Self { f1: 490.0, b1: 80.0, g1_db: 0.0, f2: 1350.0, b2: 100.0, g2_db: -6.0, f3: 1690.0, b3: 120.0, g3_db: -10.0, f4: 3300.0, b4: 250.0, g4_db: -24.0, noise_mix: 0.03 },
            "EY" => Self { f1: 450.0, b1: 70.0, g1_db: 0.0, f2: 2000.0, b2: 110.0, g2_db: -3.0, f3: 2600.0, b3: 160.0, g3_db: -10.0, f4: 3500.0, b4: 250.0, g4_db: -20.0, noise_mix: 0.02 },
            "IH" => Self { f1: 390.0, b1: 60.0, g1_db: 0.0, f2: 1990.0, b2: 100.0, g2_db: -4.0, f3: 2550.0, b3: 150.0, g3_db: -12.0, f4: 3500.0, b4: 250.0, g4_db: -22.0, noise_mix: 0.02 },
            "IY" => Self { f1: 270.0, b1: 50.0, g1_db: 0.0, f2: 2290.0, b2: 100.0, g2_db: -3.0, f3: 3010.0, b3: 160.0, g3_db: -10.0, f4: 3600.0, b4: 250.0, g4_db: -20.0, noise_mix: 0.01 },
            "OW" => Self { f1: 500.0, b1: 80.0, g1_db: 0.0, f2: 950.0,  b2: 100.0, g2_db: -5.0, f3: 2500.0, b3: 160.0, g3_db: -15.0, f4: 3500.0, b4: 250.0, g4_db: -25.0, noise_mix: 0.02 },
            "OY" => Self { f1: 520.0, b1: 80.0, g1_db: 0.0, f2: 1100.0, b2: 110.0, g2_db: -5.0, f3: 2600.0, b3: 160.0, g3_db: -12.0, f4: 3500.0, b4: 250.0, g4_db: -22.0, noise_mix: 0.02 },
            "UH" => Self { f1: 440.0, b1: 70.0, g1_db: 0.0, f2: 1020.0, b2: 100.0, g2_db: -5.0, f3: 2240.0, b3: 150.0, g3_db: -16.0, f4: 3500.0, b4: 250.0, g4_db: -26.0, noise_mix: 0.02 },
            "UW" => Self { f1: 300.0, b1: 60.0, g1_db: 0.0, f2: 870.0,  b2: 90.0,  g2_db: -5.0, f3: 2240.0, b3: 150.0, g3_db: -18.0, f4: 3500.0, b4: 250.0, g4_db: -28.0, noise_mix: 0.01 },
            // Fricatives & sibilants
            "S"  => Self { f1: 300.0, b1: 200.0, g1_db: -25.0, f2: 2500.0, b2: 400.0, g2_db: -15.0, f3: 4500.0, b3: 600.0, g3_db: 4.0, f4: 6500.0, b4: 800.0, g4_db: 8.0, noise_mix: 0.95 },
            "SH" => Self { f1: 350.0, b1: 200.0, g1_db: -20.0, f2: 2000.0, b2: 400.0, g2_db: -8.0,  f3: 3200.0, b3: 500.0, g3_db: 6.0, f4: 5000.0, b4: 700.0, g4_db: 4.0, noise_mix: 0.92 },
            "Z"  => Self { f1: 250.0, b1: 150.0, g1_db: -5.0,  f2: 2500.0, b2: 400.0, g2_db: -14.0, f3: 4500.0, b3: 600.0, g3_db: 2.0, f4: 6500.0, b4: 800.0, g4_db: 6.0, noise_mix: 0.70 },
            "ZH" => Self { f1: 250.0, b1: 150.0, g1_db: -5.0,  f2: 2000.0, b2: 400.0, g2_db: -8.0,  f3: 3200.0, b3: 500.0, g3_db: 4.0, f4: 5000.0, b4: 700.0, g4_db: 2.0, noise_mix: 0.65 },
            "F"  => Self { f1: 300.0, b1: 200.0, g1_db: -20.0, f2: 1400.0, b2: 300.0, g2_db: -12.0, f3: 3000.0, b3: 500.0, g3_db: -4.0, f4: 5000.0, b4: 800.0, g4_db: -6.0, noise_mix: 0.88 },
            "V"  => Self { f1: 250.0, b1: 150.0, g1_db: -6.0,  f2: 1400.0, b2: 300.0, g2_db: -12.0, f3: 3000.0, b3: 500.0, g3_db: -6.0, f4: 5000.0, b4: 800.0, g4_db: -8.0, noise_mix: 0.55 },
            "TH" => Self { f1: 300.0, b1: 200.0, g1_db: -22.0, f2: 1600.0, b2: 400.0, g2_db: -12.0, f3: 3500.0, b3: 600.0, g3_db: -2.0, f4: 5500.0, b4: 800.0, g4_db: 0.0, noise_mix: 0.90 },
            "DH" => Self { f1: 250.0, b1: 150.0, g1_db: -6.0,  f2: 1600.0, b2: 400.0, g2_db: -12.0, f3: 3500.0, b3: 600.0, g3_db: -4.0, f4: 5500.0, b4: 800.0, g4_db: -2.0, noise_mix: 0.55 },
            "HH" => Self { f1: 500.0, b1: 200.0, g1_db: -10.0, f2: 1700.0, b2: 300.0, g2_db: -10.0, f3: 2500.0, b3: 400.0, g3_db: -12.0, f4: 3500.0, b4: 500.0, g4_db: -15.0, noise_mix: 0.95 },
            // Plosives & Stops
            "P"  => Self { f1: 300.0, b1: 200.0, g1_db: -25.0, f2: 1000.0, b2: 300.0, g2_db: -16.0, f3: 2200.0, b3: 400.0, g3_db: -18.0, f4: 3500.0, b4: 500.0, g4_db: -20.0, noise_mix: 0.85 },
            "B"  => Self { f1: 200.0, b1: 100.0, g1_db: -6.0,  f2: 1000.0, b2: 250.0, g2_db: -14.0, f3: 2200.0, b3: 350.0, g3_db: -18.0, f4: 3500.0, b4: 500.0, g4_db: -22.0, noise_mix: 0.25 },
            "T"  => Self { f1: 350.0, b1: 200.0, g1_db: -25.0, f2: 1800.0, b2: 300.0, g2_db: -14.0, f3: 2800.0, b3: 400.0, g3_db: -10.0, f4: 4000.0, b4: 600.0, g4_db: -8.0,  noise_mix: 0.85 },
            "D"  => Self { f1: 200.0, b1: 100.0, g1_db: -6.0,  f2: 1800.0, b2: 250.0, g2_db: -12.0, f3: 2800.0, b3: 350.0, g3_db: -12.0, f4: 3800.0, b4: 500.0, g4_db: -16.0, noise_mix: 0.30 },
            "K"  => Self { f1: 350.0, b1: 200.0, g1_db: -25.0, f2: 2000.0, b2: 300.0, g2_db: -12.0, f3: 2800.0, b3: 400.0, g3_db: -12.0, f4: 3800.0, b4: 600.0, g4_db: -14.0, noise_mix: 0.85 },
            "G"  => Self { f1: 200.0, b1: 100.0, g1_db: -6.0,  f2: 2000.0, b2: 250.0, g2_db: -10.0, f3: 2600.0, b3: 350.0, g3_db: -14.0, f4: 3600.0, b4: 500.0, g4_db: -18.0, noise_mix: 0.30 },
            // Affricates
            "CH" => Self { f1: 350.0, b1: 200.0, g1_db: -20.0, f2: 2000.0, b2: 350.0, g2_db: -10.0, f3: 3200.0, b3: 450.0, g3_db: 4.0,  f4: 5000.0, b4: 700.0, g4_db: 2.0,  noise_mix: 0.90 },
            "JH" => Self { f1: 220.0, b1: 120.0, g1_db: -6.0,  f2: 2000.0, b2: 350.0, g2_db: -8.0,  f3: 3200.0, b3: 450.0, g3_db: 2.0,  f4: 5000.0, b4: 700.0, g4_db: 0.0,  noise_mix: 0.60 },
            // Nasals & Semivowels
            "M"  => Self { f1: 250.0, b1: 80.0,  g1_db: 0.0,   f2: 1000.0, b2: 150.0, g2_db: -12.0, f3: 2200.0, b3: 200.0, g3_db: -20.0, f4: 3500.0, b4: 300.0, g4_db: -28.0, noise_mix: 0.03 },
            "N"  => Self { f1: 250.0, b1: 80.0,  g1_db: 0.0,   f2: 1600.0, b2: 150.0, g2_db: -10.0, f3: 2500.0, b3: 200.0, g3_db: -18.0, f4: 3500.0, b4: 300.0, g4_db: -26.0, noise_mix: 0.03 },
            "NG" => Self { f1: 250.0, b1: 80.0,  g1_db: 0.0,   f2: 2000.0, b2: 150.0, g2_db: -12.0, f3: 2600.0, b3: 200.0, g3_db: -20.0, f4: 3500.0, b4: 300.0, g4_db: -28.0, noise_mix: 0.03 },
            "L"  => Self { f1: 350.0, b1: 80.0,  g1_db: 0.0,   f2: 1100.0, b2: 120.0, g2_db: -6.0,  f3: 2700.0, b3: 180.0, g3_db: -14.0, f4: 3500.0, b4: 250.0, g4_db: -24.0, noise_mix: 0.02 },
            "R"  => Self { f1: 350.0, b1: 80.0,  g1_db: 0.0,   f2: 1250.0, b2: 120.0, g2_db: -6.0,  f3: 1650.0, b3: 140.0, g3_db: -10.0, f4: 3300.0, b4: 250.0, g4_db: -24.0, noise_mix: 0.02 },
            "W"  => Self { f1: 300.0, b1: 70.0,  g1_db: 0.0,   f2: 750.0,  b2: 100.0, g2_db: -8.0,  f3: 2200.0, b3: 180.0, g3_db: -18.0, f4: 3500.0, b4: 250.0, g4_db: -28.0, noise_mix: 0.02 },
            "Y"  => Self { f1: 280.0, b1: 60.0,  g1_db: 0.0,   f2: 2100.0, b2: 110.0, g2_db: -4.0,  f3: 2900.0, b3: 180.0, g3_db: -12.0, f4: 3600.0, b4: 250.0, g4_db: -22.0, noise_mix: 0.02 },
            _    => Self { f1: 500.0, b1: 80.0,  g1_db: 0.0,   f2: 1500.0, b2: 120.0, g2_db: -6.0,  f3: 2500.0, b3: 160.0, g3_db: -14.0, f4: 3500.0, b4: 250.0, g4_db: -24.0, noise_mix: 0.02 },
        }
    }
}
