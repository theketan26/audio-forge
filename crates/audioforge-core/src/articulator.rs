use crate::dsp::FormantTarget;

/// 2nd-order critically damped formant trajectory solver modeling human vocal tract physical inertia.
/// Governed by: d^2 F / dt^2 + 2*zeta*omega_n * (dF/dt) + omega_n^2 * (F - F_target) = 0
/// with damping ratio zeta = 1.0 (critically damped, zero overshoot or ringing).
#[derive(Debug, Clone)]
pub struct ArticulatorDampedFilter {
    // Current positions (Hz)
    pub f1: f32,
    pub f2: f32,
    pub f3: f32,
    pub f4: f32,

    // Current velocities (Hz/sec)
    v1: f32,
    v2: f32,
    v3: f32,
    v4: f32,

    // Bandwidths & gains
    pub b1: f32,
    pub b2: f32,
    pub b3: f32,
    pub b4: f32,
    pub g1_db: f32,
    pub g2_db: f32,
    pub g3_db: f32,
    pub g4_db: f32,
    pub noise_mix: f32,

    omega_n: f32, // natural frequency in rad/sec (e.g. 2 * PI * 30.0)
    sample_rate: f32,
}

impl ArticulatorDampedFilter {
    pub fn new(sample_rate: f32, articulation_speed: f32) -> Self {
        // Natural frequency corresponds to vocal tract muscle stiffness and response rate (~25 to 45 Hz)
        let base_freq = 32.0 * articulation_speed.clamp(0.5, 2.5);
        let omega_n = 2.0 * std::f32::consts::PI * base_freq;

        Self {
            f1: 500.0,
            f2: 1500.0,
            f3: 2500.0,
            f4: 3500.0,
            v1: 0.0,
            v2: 0.0,
            v3: 0.0,
            v4: 0.0,
            b1: 80.0,
            b2: 110.0,
            b3: 160.0,
            b4: 250.0,
            g1_db: 0.0,
            g2_db: -6.0,
            g3_db: -14.0,
            g4_db: -24.0,
            noise_mix: 0.02,
            omega_n,
            sample_rate,
        }
    }

    /// Advances 2nd-order critically damped solver by one sample step
    #[inline]
    pub fn step(&mut self, target: &FormantTarget, formant_shift: f32) {
        let dt = 1.0 / self.sample_rate;
        let w2 = self.omega_n * self.omega_n;
        let two_zeta_w = 2.0 * 1.0 * self.omega_n; // zeta = 1.0 for critical damping

        let target_f1 = target.f1 * formant_shift;
        let target_f2 = target.f2 * formant_shift;
        let target_f3 = target.f3 * formant_shift;
        let target_f4 = target.f4 * formant_shift;

        // F1
        let a1 = w2 * (target_f1 - self.f1) - two_zeta_w * self.v1;
        self.v1 += a1 * dt;
        self.f1 += self.v1 * dt;

        // F2
        let a2 = w2 * (target_f2 - self.f2) - two_zeta_w * self.v2;
        self.v2 += a2 * dt;
        self.f2 += self.v2 * dt;

        // F3
        let a3 = w2 * (target_f3 - self.f3) - two_zeta_w * self.v3;
        self.v3 += a3 * dt;
        self.f3 += self.v3 * dt;

        // F4
        let a4 = w2 * (target_f4 - self.f4) - two_zeta_w * self.v4;
        self.v4 += a4 * dt;
        self.f4 += self.v4 * dt;

        // Bandwidths and gains smoothly follow
        let smooth_coeff = (-dt * self.omega_n).exp();
        self.b1 = smooth_coeff * self.b1 + (1.0 - smooth_coeff) * target.b1;
        self.b2 = smooth_coeff * self.b2 + (1.0 - smooth_coeff) * target.b2;
        self.b3 = smooth_coeff * self.b3 + (1.0 - smooth_coeff) * target.b3;
        self.b4 = smooth_coeff * self.b4 + (1.0 - smooth_coeff) * target.b4;

        self.g1_db = smooth_coeff * self.g1_db + (1.0 - smooth_coeff) * target.g1_db;
        self.g2_db = smooth_coeff * self.g2_db + (1.0 - smooth_coeff) * target.g2_db;
        self.g3_db = smooth_coeff * self.g3_db + (1.0 - smooth_coeff) * target.g3_db;
        self.g4_db = smooth_coeff * self.g4_db + (1.0 - smooth_coeff) * target.g4_db;

        self.noise_mix = smooth_coeff * self.noise_mix + (1.0 - smooth_coeff) * target.noise_mix;
    }
}
