use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FujisakiParams {
    pub phrase_decay_alpha: f32, // typically 1.5 - 2.5
    pub accent_decay_beta: f32,  // typically 15.0 - 25.0
    pub accent_strength: f32,    // typically 0.5 - 1.2
}

impl Default for FujisakiParams {
    fn default() -> Self {
        Self {
            phrase_decay_alpha: 2.0,
            accent_decay_beta: 20.0,
            accent_strength: 0.8,
        }
    }
}

#[derive(Debug, Clone)]
pub struct PhraseCommand {
    pub t_start: f32,
    pub magnitude: f32,
}

#[derive(Debug, Clone)]
pub struct AccentCommand {
    pub t_start: f32,
    pub t_end: f32,
    pub amplitude: f32,
}

pub struct FujisakiModel {
    params: FujisakiParams,
    base_f0: f32,
}

impl FujisakiModel {
    pub fn new(base_f0: f32, params: FujisakiParams) -> Self {
        Self { base_f0, params }
    }

    /// Evaluates phrase impulse response: G_p(t) = alpha^2 * t * exp(-alpha * t) for t >= 0
    #[inline]
    pub fn phrase_response(alpha: f32, t: f32) -> f32 {
        if t < 0.0 {
            0.0
        } else {
            alpha * alpha * t * (-alpha * t).exp()
        }
    }

    /// Evaluates accent step response: G_a(t) = 1 - (1 + beta * t) * exp(-beta * t) for t >= 0
    #[inline]
    pub fn accent_response(beta: f32, t: f32) -> f32 {
        if t < 0.0 {
            0.0
        } else {
            1.0 - (1.0 + beta * t) * (-beta * t).exp()
        }
    }

    /// Computes continuous F0 in Hz at timestamp t
    pub fn calculate_f0(
        &self,
        t: f32,
        phrase_commands: &[PhraseCommand],
        accent_commands: &[AccentCommand],
        micro_perturbation_hz: f32,
    ) -> f32 {
        let ln_fb = self.base_f0.ln();
        let alpha = self.params.phrase_decay_alpha;
        let beta = self.params.accent_decay_beta;

        // Sum of phrase components
        let mut phrase_sum = 0.0f32;
        for cmd in phrase_commands {
            let dt = t - cmd.t_start;
            if dt >= 0.0 {
                phrase_sum += cmd.magnitude * Self::phrase_response(alpha, dt);
            }
        }

        // Sum of accent components
        let mut accent_sum = 0.0f32;
        for cmd in accent_commands {
            let dt1 = t - cmd.t_start;
            let dt2 = t - cmd.t_end;
            if dt1 >= 0.0 {
                let g1 = Self::accent_response(beta, dt1);
                let g2 = if dt2 >= 0.0 {
                    Self::accent_response(beta, dt2)
                } else {
                    0.0
                };
                accent_sum += cmd.amplitude * self.params.accent_strength * (g1 - g2);
            }
        }

        let ln_f0 = ln_fb + phrase_sum + accent_sum;
        let continuous_f0 = ln_f0.exp() + micro_perturbation_hz;

        continuous_f0.clamp(45.0, 950.0)
    }

    /// Calculates intrinsic vowel and consonant micro-perturbations
    pub fn micro_perturbation(phoneme: &str, rel_t: f32) -> f32 {
        match phoneme {
            // High vowels have higher intrinsic pitch (+8 to +15 Hz)
            "IY" | "UW" => 12.0,
            "IH" | "UH" => 8.0,
            // Low open vowels have lower intrinsic pitch
            "AA" | "AE" => -4.0,
            // Voiceless stop release overshoot (+10 Hz at onset)
            "P" | "T" | "K" => {
                if rel_t < 0.25 {
                    10.0 * (1.0 - rel_t / 0.25)
                } else {
                    0.0
                }
            }
            _ => 0.0,
        }
    }
}
