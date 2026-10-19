use crate::types::{PhonemeTiming, VisemeFrame, VisemeId};
use std::collections::HashMap;

/// Cubic Hermite interpolation between two values
#[inline]
pub fn hermite_interp(p0: f32, p1: f32, t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    // Smoothstep: 3*t^2 - 2*t^3
    let s = t * t * (3.0 - 2.0 * t);
    p0 + (p1 - p0) * s
}

pub struct VisemeTimelineEngine {
    target_fps: u32,
    rest_viseme: VisemeId,
}

impl VisemeTimelineEngine {
    pub fn new(target_fps: u32, rest_viseme: VisemeId) -> Self {
        Self {
            target_fps: if target_fps == 0 { 30 } else { target_fps },
            rest_viseme,
        }
    }

    /// Computes frame-accurate viseme snapshots with cubic Hermite coarticulation
    pub fn generate_frames(
        &self,
        phonemes: &[PhonemeTiming],
        total_duration_sec: f32,
    ) -> Vec<VisemeFrame> {
        let fps = self.target_fps as f32;
        let frame_duration = 1.0 / fps;
        let total_frames = ((total_duration_sec * fps).ceil() as usize).max(1);

        let mut frames = Vec::with_capacity(total_frames);

        for frame_idx in 0..total_frames {
            let t = frame_idx as f32 * frame_duration;

            let primary_viseme: VisemeId;
            let mut secondary_viseme: Option<VisemeId> = None;
            let mut primary_weight: f32 = 1.0;
            let mut secondary_weight: f32 = 0.0;

            if let Some(pos) = phonemes.iter().position(|p| t >= p.start_sec && t <= p.end_sec) {
                let curr = &phonemes[pos];
                primary_viseme = curr.viseme;

                let dur = curr.end_sec - curr.start_sec;
                let rel_t = if dur > 0.001 {
                    (t - curr.start_sec) / dur
                } else {
                    0.5
                };

                // Coarticulation with previous phoneme if near start
                if rel_t < 0.25 {
                    if pos > 0 {
                        let prev = &phonemes[pos - 1];
                        secondary_viseme = Some(prev.viseme);
                        // Hermite blend from previous to current
                        let factor = rel_t / 0.25; // 0 to 1
                        primary_weight = hermite_interp(0.5, 1.0, factor);
                        secondary_weight = (1.0 - primary_weight).clamp(0.0, 1.0);
                    }
                }
                // Coarticulation with next phoneme if near end
                else if rel_t > 0.75 {
                    if pos + 1 < phonemes.len() {
                        let next = &phonemes[pos + 1];
                        secondary_viseme = Some(next.viseme);
                        let factor = (rel_t - 0.75) / 0.25; // 0 to 1
                        secondary_weight = hermite_interp(0.0, 0.5, factor);
                        primary_weight = (1.0 - secondary_weight).clamp(0.0, 1.0);
                    }
                }
            } else {
                // In pause or past end
                primary_viseme = self.rest_viseme;
                primary_weight = 1.0;
            }

            // Build blendshapes map (0.0 to 1.0 for each recognized viseme)
            let mut blendshapes = HashMap::new();
            for v in VisemeId::all() {
                blendshapes.insert(v.as_str().to_string(), 0.0f32);
            }

            blendshapes.insert(primary_viseme.as_str().to_string(), primary_weight);
            if let Some(sec) = secondary_viseme {
                if sec != primary_viseme {
                    blendshapes.insert(sec.as_str().to_string(), secondary_weight);
                }
            }

            frames.push(VisemeFrame {
                frame_index: frame_idx,
                timestamp_sec: t,
                primary: primary_viseme.as_str().to_string(),
                primary_weight: (primary_weight * 1000.0).round() / 1000.0,
                secondary: secondary_viseme.map(|s| s.as_str().to_string()),
                secondary_weight: (secondary_weight * 1000.0).round() / 1000.0,
                sprite_frame_id: primary_viseme.to_sprite_id(),
                blendshapes,
            });
        }

        frames
    }

    /// Formats frames as standard CSV curve data
    pub fn export_csv(frames: &[VisemeFrame]) -> String {
        let mut out = String::from("frame,timestamp_sec,primary_viseme,weight,sprite_frame_id,rest,closed,slight_open,wide_open,round,pucker,teeth_lip,jaw_open\n");
        for f in frames {
            let bs = &f.blendshapes;
            out.push_str(&format!(
                "{},{:.4},{},{:.3},{},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3}\n",
                f.frame_index,
                f.timestamp_sec,
                f.primary,
                f.primary_weight,
                f.sprite_frame_id,
                bs.get("rest").unwrap_or(&0.0),
                bs.get("closed").unwrap_or(&0.0),
                bs.get("slight_open").unwrap_or(&0.0),
                bs.get("wide_open").unwrap_or(&0.0),
                bs.get("round").unwrap_or(&0.0),
                bs.get("pucker").unwrap_or(&0.0),
                bs.get("teeth_lip").unwrap_or(&0.0),
                bs.get("jaw_open").unwrap_or(&0.0),
            ));
        }
        out
    }
}
