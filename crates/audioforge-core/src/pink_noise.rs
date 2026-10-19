use rand::Rng;
use rand_pcg::Pcg32;

/// 1/f Pink Noise generator using the Voss-McCartney algorithm with deterministic Pcg32 RNG.
/// Produces organic Brownian-like 1/f noise for natural vocal jitter and shimmer.
#[derive(Debug, Clone)]
pub struct PinkNoiseGenerator {
    rng: Pcg32,
    rows: [f32; 12],
    running_sum: f32,
    counter: usize,
}

impl PinkNoiseGenerator {
    pub fn new(rng: Pcg32) -> Self {
        Self {
            rng,
            rows: [0.0; 12],
            running_sum: 0.0,
            counter: 0,
        }
    }

    /// Generates next 1/f pink noise sample normalized roughly between -1.0 and 1.0
    #[inline]
    pub fn next_sample(&mut self) -> f32 {
        self.counter = self.counter.wrapping_add(1);
        let mut c = self.counter;
        let mut bit = 0;

        while (c & 1) == 0 && bit < 12 {
            c >>= 1;
            bit += 1;
        }

        if bit < 12 {
            let new_val = self.rng.gen_range(-0.1f32..0.1f32);
            self.running_sum -= self.rows[bit];
            self.rows[bit] = new_val;
            self.running_sum += new_val;
        }

        // Add a small amount of white noise
        let white = self.rng.gen_range(-0.08f32..0.08f32);
        (self.running_sum + white).clamp(-1.0, 1.0)
    }
}
