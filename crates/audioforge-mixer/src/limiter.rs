pub struct MasterLimiter {
    ceiling: f32,
}

impl MasterLimiter {
    pub fn new(ceiling_db: f32) -> Self {
        let ceiling = 10.0f32.powf(ceiling_db / 20.0).min(1.0);
        Self { ceiling }
    }

    #[inline]
    pub fn process_sample(&self, sample: f32) -> f32 {
        let norm = sample / self.ceiling;
        // Soft-knee cubic saturation
        let limited = if norm.abs() <= 0.6 {
            norm
        } else if norm > 0.6 {
            let excess = norm - 0.6;
            0.6 + excess / (1.0 + excess * 1.5)
        } else {
            let excess = -norm - 0.6;
            -(0.6 + excess / (1.0 + excess * 1.5))
        };

        (limited * self.ceiling).clamp(-self.ceiling, self.ceiling)
    }

    pub fn process_buffer(&self, samples: &mut [f32]) {
        for s in samples.iter_mut() {
            *s = self.process_sample(*s);
        }
    }
}
