import React, { useRef, useEffect, useState } from 'react';
import { SpeechManifest, PhonemeTiming } from '../types';
import { Play, Pause, RotateCcw, Activity } from 'lucide-react';

interface TimelineInspectorProps {
  manifest: SpeechManifest | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  currentFps: number;
  onFpsChange: (fps: number) => void;
  onPitchTweak?: (nodeIndex: number, newPitchHz: number) => void;
}

export const TimelineInspector: React.FC<TimelineInspectorProps> = ({
  manifest,
  currentTime,
  duration,
  isPlaying,
  onPlayToggle,
  onSeek,
  currentFps,
  onFpsChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const totalDuration = duration > 0 ? duration : (manifest?.duration_sec || 1.0);
  const currentFrameIdx = Math.floor(currentTime * currentFps);
  const totalFrames = Math.floor(totalDuration * currentFps);

  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [pitchOffsets, setPitchOffsets] = useState<Record<number, number>>({});
  const [isDraggingNode, setIsDraggingNode] = useState<number | null>(null);

  // Derive current F0 at playhead
  const currentF0 = React.useMemo(() => {
    if (!manifest || manifest.phonemes.length === 0) return 130;
    const phone = manifest.phonemes.find((p) => currentTime >= p.start_sec && currentTime <= p.end_sec);
    return phone && phone.base_f0 > 0 ? phone.base_f0 : 130;
  }, [manifest, currentTime]);

  // Render waveform, energy envelope & Fujisaki pitch contour on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    // Horizontal pitch grid lines (100Hz, 200Hz, 300Hz)
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.12)';
    for (let pitchRef of [100, 200, 300]) {
      const y = height - (pitchRef / 360) * height * 0.85;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(192, 132, 252, 0.35)';
      ctx.font = '9px monospace';
      ctx.fillText(`${pitchRef}Hz`, 6, y - 3);
    }

    if (manifest && manifest.phonemes.length > 0) {
      // 1. Energy Envelope Fill & Waveform Bars
      const numBars = 140;
      const barWidth = width / numBars;

      for (let i = 0; i < numBars; i++) {
        const t = (i / numBars) * totalDuration;
        const phone = manifest.phonemes.find((p) => t >= p.start_sec && t <= p.end_sec);
        const hasEnergy = phone && phone.phoneme !== 'PAUSE';
        const h = hasEnergy ? (Math.sin(i * 0.35) * 0.35 + 0.65) * (height * 0.6) : 3;

        const isPast = t <= currentTime;
        ctx.fillStyle = isPast ? 'rgba(0, 240, 255, 0.45)' : 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(i * barWidth, (height - h) / 2, barWidth - 1, h);
      }

      // 2. Fujisaki Continuous Pitch Contour (F0)
      if (manifest.pitch_contour && manifest.pitch_contour.length > 1) {
        ctx.beginPath();
        const pts = manifest.pitch_contour;
        for (let j = 0; j < pts.length; j++) {
          const x = (j / (pts.length - 1)) * width;
          const basePitch = pts[j];
          const offset = pitchOffsets[j] || 0;
          const pitch = basePitch + offset;
          const y = pitch > 0 ? height - (pitch / 360) * height * 0.85 : height - 8;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#c084fc';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 3. Interactive Inflection Nodes on Stressed Vowels & Words
        manifest.phonemes.forEach((p, pIdx) => {
          if (p.base_f0 > 0 && p.phoneme !== 'PAUSE') {
            const midT = (p.start_sec + p.end_sec) / 2;
            const nodeX = (midT / totalDuration) * width;
            const offset = pitchOffsets[pIdx] || 0;
            const pitch = p.base_f0 + offset;
            const nodeY = height - (pitch / 360) * height * 0.85;

            const isHovered = hoveredNode === pIdx;
            ctx.beginPath();
            ctx.arc(nodeX, nodeY, isHovered ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? '#00f0ff' : '#ffffff';
            ctx.shadowColor = isHovered ? '#00f0ff' : '#c084fc';
            ctx.shadowBlur = isHovered ? 12 : 5;
            ctx.fill();
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        });
      }
    }

    // 4. Playhead Line with Cyan Glow
    const playheadX = (currentTime / totalDuration) * width;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [manifest, currentTime, totalDuration, pitchOffsets, hoveredNode]);

  // Handle canvas clicks & pitch dragging
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !manifest) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const width = rect.width;

    // Check if clicked near an inflection node
    let clickedNodeIdx: number | null = null;
    manifest.phonemes.forEach((p, idx) => {
      if (p.base_f0 > 0) {
        const midT = (p.start_sec + p.end_sec) / 2;
        const nodeX = (midT / totalDuration) * width;
        const offset = pitchOffsets[idx] || 0;
        const pitch = p.base_f0 + offset;
        const nodeY = rect.height - (pitch / 360) * rect.height * 0.85;

        if (Math.hypot(clickX - nodeX, clickY - nodeY) < 14) {
          clickedNodeIdx = idx;
        }
      }
    });

    if (clickedNodeIdx !== null) {
      setIsDraggingNode(clickedNodeIdx);
    } else {
      const fraction = Math.max(0, Math.min(1, clickX / width));
      onSeek(fraction * totalDuration);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !manifest) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isDraggingNode !== null) {
      // Adjust pitch offset based on vertical drag
      const deltaY = (rect.height / 2) - mouseY;
      const pitchDelta = deltaY * 0.8;
      setPitchOffsets((prev) => ({
        ...prev,
        [isDraggingNode]: pitchDelta,
      }));
    } else {
      // Hover detection
      let found: number | null = null;
      manifest.phonemes.forEach((p, idx) => {
        if (p.base_f0 > 0) {
          const midT = (p.start_sec + p.end_sec) / 2;
          const nodeX = (midT / totalDuration) * rect.width;
          const offset = pitchOffsets[idx] || 0;
          const pitch = p.base_f0 + offset;
          const nodeY = rect.height - (pitch / 360) * rect.height * 0.85;

          if (Math.hypot(mouseX - nodeX, mouseY - nodeY) < 12) {
            found = idx;
          }
        }
      });
      setHoveredNode(found);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingNode(null);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Top Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => onSeek(0)}
            title="Reset to Start"
            style={{ padding: '8px 12px' }}
          >
            <RotateCcw size={15} />
          </button>

          <button
            className={`btn ${isPlaying ? 'btn-secondary' : 'btn-primary'}`}
            onClick={onPlayToggle}
            style={{ minWidth: '100px' }}
          >
            {isPlaying ? (
              <>
                <Pause size={16} /> Pause
              </>
            ) : (
              <>
                <Play size={16} /> Play
              </>
            )}
          </button>

          <div
            className="mono"
            style={{
              fontSize: '13px',
              padding: '6px 12px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              color: 'var(--accent-cyan)',
            }}
          >
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>

        {/* Live Pitch F0 Readout & FPS Snapping */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: 'rgba(155, 81, 224, 0.15)',
              border: '1px solid rgba(155, 81, 224, 0.35)',
              borderRadius: '6px',
              fontSize: '11.5px',
              color: '#c084fc',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Activity size={13} />
            <span>F₀ Pitch: <strong>{currentF0.toFixed(1)} Hz</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Target FPS:</span>
            {[24, 30, 60].map((fps) => (
              <button
                key={fps}
                onClick={() => onFpsChange(fps)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: currentFps === fps ? '700' : '500',
                  background: currentFps === fps ? 'rgba(0, 240, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: currentFps === fps ? 'var(--accent-cyan)' : 'var(--text-dim)',
                  border: currentFps === fps ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {fps} FPS
              </button>
            ))}
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '4px' }}>
              [{currentFrameIdx} / {totalFrames} f]
            </span>
          </div>
        </div>
      </div>

      {/* Visual Pitch (F0) & Energy Curve Editor Canvas */}
      <div style={{ position: 'relative', width: '100%', height: '100px', borderRadius: '8px', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={900}
          height={100}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: hoveredNode !== null ? 'ns-resize' : 'crosshair',
            background: 'rgba(6, 8, 12, 0.9)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
          }}
        />
      </div>

      {/* Phoneme Alignment Ribbon Track */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          <span>Phonetic Alignment & Sample-Exact Viseme Markers</span>
          <span style={{ color: '#c084fc' }}>● Click & drag nodes on pitch line to sculpt intonation</span>
        </div>

        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '38px',
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          {manifest?.phonemes.map((p: PhonemeTiming, idx: number) => {
            const leftPct = (p.start_sec / totalDuration) * 100;
            const widthPct = ((p.end_sec - p.start_sec) / totalDuration) * 100;
            const isActive = currentTime >= p.start_sec && currentTime <= p.end_sec;

            const isPause = p.phoneme === 'PAUSE';
            return (
              <div
                key={idx}
                onClick={() => onSeek(p.start_sec)}
                title={`${p.phoneme} (${p.viseme}) [${p.start_sec.toFixed(2)}s - ${p.end_sec.toFixed(2)}s] F0: ${p.base_f0.toFixed(0)}Hz`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isActive
                    ? 'rgba(0, 240, 255, 0.35)'
                    : isPause
                    ? 'rgba(255, 255, 255, 0.03)'
                    : 'rgba(255, 255, 255, 0.08)',
                  borderRight: '1px solid rgba(255, 255, 255, 0.07)',
                  borderTop: isActive ? '2px solid var(--accent-cyan)' : 'none',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background 0.1s ease',
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: '700',
                    color: isActive ? '#ffffff' : isPause ? 'var(--text-dim)' : 'var(--text-main)',
                  }}
                >
                  {p.phoneme}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    color: isActive ? 'var(--accent-cyan)' : 'var(--text-dim)',
                    textTransform: 'lowercase',
                  }}
                >
                  {p.viseme}
                </span>
              </div>
            );
          })}

          {/* Current playhead indicator in ribbon */}
          <div
            style={{
              position: 'absolute',
              left: `${(currentTime / totalDuration) * 100}%`,
              top: 0,
              bottom: 0,
              width: '2px',
              background: '#00f0ff',
              boxShadow: '0 0 8px #00f0ff',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </div>
  );
};
