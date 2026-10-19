use std::f32::consts::PI;

/// Time-Domain Pitch-Synchronous Overlap-and-Add (TD-PSOLA) Processor
/// Modifies pitch and duration of speech segments while preserving natural vocal tract formants.
pub struct TdPsolaProcessor {
    sample_rate: u32,
}

impl TdPsolaProcessor {
    pub fn new(sample_rate: u32) -> Self {
        Self { sample_rate }
    }

    /// Performs TD-PSOLA pitch and duration modification on an input grain buffer.
    /// target_f0: desired fundamental frequency (Hz)
    /// target_duration_samples: desired output sample count
    pub fn process_grain(
        &self,
        source: &[f32],
        source_pitch: f32,
        target_f0: f32,
        target_duration_samples: usize,
    ) -> Vec<f32> {
        let sr = self.sample_rate as f32;
        let mut output = vec![0.0f32; target_duration_samples];

        if source.is_empty() || target_duration_samples == 0 {
            return output;
        }

        let src_period = (sr / source_pitch.clamp(50.0, 800.0)).round().max(16.0) as usize;
        let target_period = (sr / target_f0.clamp(50.0, 800.0)).round().max(16.0) as usize;

        // Window size spans 2 pitch periods for smooth overlap
        let win_size = src_period * 2;
        let mut out_pos: usize = 0;
        let mut src_pos: usize = 0;

        while out_pos < target_duration_samples {
            // Extract Hann-windowed segment around src_pos
            for i in 0..win_size {
                let s_idx = src_pos.saturating_add(i).saturating_sub(win_size / 2);
                let sample_val = if s_idx < source.len() { source[s_idx] } else { 0.0 };

                // 2-period Hann window
                let hann = 0.5 * (1.0 - (2.0 * PI * i as f32 / win_size as f32).cos());
                let windowed = sample_val * hann;

                let o_idx = out_pos.saturating_add(i).saturating_sub(win_size / 2);
                if o_idx < target_duration_samples {
                    output[o_idx] += windowed;
                }
            }

            out_pos += target_period;
            src_pos = (src_pos + src_period) % source.len().max(1);
        }

        output
    }
}
