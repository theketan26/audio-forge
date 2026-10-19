Here is the comprehensive design and engineering plan translating the **Pulse Dark Bento Console** specification directly into the **AudioForge Studio** management dashboard.

---

# AudioForge Studio: Dark Bento Console Architecture

## 1. Design Language & Design System

The visual identity adopts an authentic **data console aesthetic**: matte graphite surfaces, hairline structural borders, strict monospace typography for technical metrics, and disciplined chroma accents.

```
Ground:         #0e0f14 (Cool Graphite Deep)
Tile Surface:   #16181f (Matte Charcoal)
Hero Surface:   #1b1e27 (Elevated Navy-Tinted Charcoal)
Hairline Edge:  #262a35 (1px solid border)
Brand Accent:   #ec4899 (Fuchsia 500) | #db2777 (Deep Fuchsia)
Telemetry Data: #2dd4bf (Teal) | #f5b544 (Amber) | #8b7cff (Violet) | #fb7185 (Rose)
Typography:     Manrope (UI / Headings) + IBM Plex Mono (Timestamps, Samples, Hz, Frames)

```

### Tile Component Surface Rules

* **Radius:** `rounded-[22px]`
* **Border:** `border border-[#262a35]`
* **Highlight:** `shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`
* **Elevation & Hover:** Two-tier dark shadows with a springy translateY lift:
```css
box-shadow: 0 12px 30px -14px rgba(0,0,0,0.7), 0 22px 50px -20px rgba(0,0,0,0.8);
transition: transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1), border-color 0.2s ease;

```


On hover: `translate-y-[-4px]` and border warms subtly toward `rgba(236,72,153,0.3)`.

---

## 2. Layout Structure & Grid Map

A 4-column CSS grid (`max-width: 1320px`, centered, `18px gap`) with custom span assignments:

```
+---------------------------------------------------------------------------------------------------+
|  [AF Logo]  Studio  (Synthesizer)  Characters  Assets  Renders  |  [Search /]  [30 FPS]  [*] [Avatar] |
+---------------------------------------------------------------------------------------------------+
|  AUDIOFORGE STUDIO  /  ENGINE TELEMETRY - 48 KHZ SAMPLE CLOCK ACTIVE        (24/30/60) [Export] [+New] |
+-------------------------------------------------+-----------------------+-------------------------+
|                                                 | (2) Viseme Sync Rate  | (4) Live Render Stream  |
| (1) Acoustic Waveform & Pitch Hero Tile         |     99.4% (Teal Spark)|     [Live Dot]          |
|     (2 Cols x 2 Rows)                           +-----------------------+     - Cutscene_01 (48k) |
|     Fuchsia F0 pitch curve + area gradient      | (3) Engine Latency    |     - Merchant_idle     |
|     Oct 7 Marker: 142 Hz @ 1,240 ms             |     14.2 ms (7-bar)   |     - Fairy_blip (WASM) |
|                                                 +-----------------------+     - Boss_monologue    |
|                                                 | (6) Buffer Fill Gauge |     - Guard_foley       |
|                                                 |     78% Fuchsia Ring  |     - Spell_cast_sfx    |
+-------------------------------------------------+-----------------------+-------------------------+
| (7) Character Voice Profiles Table (3 Cols x 1 Row)                     | (5) Phoneme Distribution|
|     ID / Base F0 / Engine / Viseme Stream / Trend Sparkline             |     Donut (4 Segments)  |
|     /gorgon_merchant, /forest_fairy, /royal_guard, /narrator            |     Vowels / Fricatives |
+-------------------------------------------------------------------------+-------------------------+

```

---

## 3. Tile-by-Tile Functional Specification

### Top App Bar (Sticky, 85% Ground with Backdrop Blur)

* **Left:** Rounded fuchsia tile with an audio pulse waveform glyph + **AudioForge** wordmark (Manrope 700). Horizontal nav tabs: `Studio` (active fuchsia-tinted pill `#ec48991a` with `#ec4899` text), followed by `Characters`, `Asset Library`, and `Renders` in muted `#a6abb8`.
* **Right:** Sunken search box (`bg-[#121319]`, `#262a35` border) with quick-key hint `[ / ]`, framerate selector pill (`30 FPS` active), notification bell with fuchsia activity indicator, and user avatar.

### Page Header Row

* **Left:** H1 `Studio Console` (Manrope 800, `#f2f3f7`) with a mono eyebrow: `ENGINE TELEMETRY - RUST AUDIOFORGE-CORE 48 KHZ ACTIVE`.
* **Right:** Segmented FPS switch (`24 FPS` / `30 FPS` active / `60 FPS`), ghost `Export JSON & WAV` button, and a primary fuchsia button `+ New Audio Pass` (`bg-[#ec4899]` hover `bg-[#db2777]`).

---

### Tile 1: Acoustic Waveform & Pitch Hero Tile (`2 cols x 2 rows`, `#1b1e27`)

* **Header:** Tracked-caps mono eyebrow `PITCH CONTOUR (F0) & RMS AMPLITUDE`, headline metric `142.8 Hz` with an amber delta pill `+4.2 Hz Accent`, and timeline range mini-toggle (`All / Stressed / Active Line`).
* **Main Visual Area:**
* Real-time SVG continuous pitch curve: a crisp 2px line in fuchsia `#ec4899` with a soft vertical gradient (`#ec4899` fading to transparent `rgba(236,72,153,0.0)`).
* Left Y-axis in IBM Plex Mono: `50 Hz / 100 Hz / 150 Hz / 200 Hz`.
* X-axis markers: `00:00:000`, `00:01:200`, `00:02:400`, `00:03:600`.
* **Anchored Tooltip with Connector:** A 1px vertical hairline connector stem anchored to a ringed fuchsia point on the curve at `00:01:240`, showing a mono tooltip: `[AA1] 168.4 Hz - 82ms duration`.



---

### Tile 2: Viseme Frame Accuracy KPI (`1 col x 1 row`, `#16181f`)

* **Header:** Mono eyebrow `FRAME-SNAP ACCURACY`, bold metric `99.4%`, and a green delta pill `+0.2% vs target`.
* **Micro-Viz:** Pinned along the lower edge is a teal `#2dd4bf` polyline sparkline visualizing frame-drift variance across 30 rendered segments.

---

### Tile 3: Core DSP Render Latency KPI (`1 col x 1 row`, `#16181f`)

* **Header:** Mono eyebrow `SYNTHESIS SPEED`, bold metric `14.2 ms`, and a green delta pill `-3.1ms faster`.
* **Micro-Viz:** A 7-bar amber `#f5b544` micro bar chart tracking per-clause render latency, with the rightmost active clause bar lit brightest.

---

### Tile 4: Live Render Stream Feed (`1 col x 2 rows tall`, `#16181f`)

* **Header:** `Live Pipeline Events` + animated pulsing green `live` indicator.
* **Content:** Scrollable feed displaying the last ~6 jobs:
* Each item features a circular initials avatar (`MC` for Merchant, `FF` for Fairy), task label, mono timestamp (`Just now`, `14s ago`), and status color dot:
* Green: `WAV committed to Supabase`
* Fuchsia: `Viseme JSON snapped`
* Teal: `Sidechain ducking applied`
* Amber: `G2P Trie fallback used`
* Rose: `Sample clipping detected`





---

### Tile 5: Phoneme Distribution Donut (`1 col x 2 rows tall`, `#16181f`)

* **Header:** `Phoneme Breakdown`.
* **Visual:** Thick SVG donut ring partitioned into 4 category segments:
* **Vowels (AA, IY, UW):** Fuchsia `#ec4899` (42%)
* **Fricatives & Sibilants (S, Z, F):** Teal `#2dd4bf` (26%)
* **Stops & Plosives (B, P, T):** Amber `#f5b544` (19%)
* **Glides & Nasals (M, N, L):** Violet `#8b7cff` (13%)


* **Center Label:** `3,412 / PHONES` in IBM Plex Mono.
* **Legend:** 4-row structured list with right-aligned mono percentages and category tags.

---

### Tile 6: Buffer & Ducking Headroom Gauge (`1 col x 1 row`, `#16181f`)

* **Header:** Tracked-caps mono label `MASTER BUS HEADROOM`.
* **Visual:** SVG radial progress ring in fuchsia `#ec4899` running over a dark track `#262a35`, filled to **78%**.
* **Metrics:** Centered `78%` readout, with lower label `BGM DUCK: -12.0 dB` and current mono ceiling `-3.2 dBFS`.

---

### Tile 7: Character Voice Presets Table (`3 cols x 1 row wide`, `#16181f`)

* **Header:** `Active Character Profiles` with a fuchsia ghost action link `Manage Presets ->`.
* **Layout:** Horizontally scrollable container with minimum 520px width to avoid crushing on smaller displays:
* Columns: `Character / Engine Mode / Base F0 / Active Viseme / Stability Trend`.
* Rows:
* `/gorgon_merchant` | `Formant (Klatt)` | `112 Hz` | `wide_open` | Rising green trend
* `/forest_fairy` | `Granular (Blip)` | `340 Hz` | `slightly_open` | Stable teal trend
* `/royal_guard` | `Formant + LF` | `98 Hz` | `closed` | Rising green trend
* `/shadow_monk` | `Vocos Hybrid` | `128 Hz` | `round` | Rose dip trend





---

## 4. Frontend Component Implementation Pattern

```tsx
// Example Tailwind primitives for the Bento Tile standard
export function BentoTile({ 
  children, 
  className = "", 
  isHero = false 
}: { 
  children: React.ReactNode; 
  className?: string; 
  isHero?: boolean;
}) {
  return (
    <div 
      className={`
        rounded-[22px] border border-[#262a35] 
        ${isHero ? 'bg-[#1b1e27]' : 'bg-[#16181f]'}
        shadow-[0_12px_30px_-14px_rgba(0,0,0,0.7),0_22px_50px_-20px_rgba(0,0,0,0.8)]
        shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]
        transition-all duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)]
        hover:-translate-y-1 hover:border-[#ec4899]/30
        p-5 relative overflow-hidden flex flex-col justify-between
        ${className}
      `}
    >
      {children}
    </div>
  );
}

```