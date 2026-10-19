import React, { useRef, useEffect } from 'react';
import { SpeechManifest, PhonemeTiming } from '../types';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface TimelineInspectorProps {
  manifest: SpeechManifest | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  onSeek: (time: number) => void;
  currentFps: number;
  onFpsChange: (fps: number) => void;
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

  // Render waveform / contour on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (manifest && manifest.phonemes.length > 0) {
      // Waveform / phoneme energy simulated background bars
      const numBars = 120;
      const barWidth = width / numBars;

      for (let i = 0; i < numBars; i++) {
        const t = (i / numBars) * totalDuration;
        const phone = manifest.phonemes.find((p) => t >= p.start_sec && t <= p.end_sec);
        const hasEnergy = phone && phone.phoneme !== 'PAUSE';
        const h = hasEnergy ? (Math.sin(i * 0.4) * 0.4 + 0.6) * (height * 0.65) : 4;

        const isPast = t <= currentTime;
        ctx.fillStyle = isPast ? 'rgba(0, 240, 255, 0.5)' : 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(i * barWidth, (height - h) / 2, barWidth - 1, h);
      }

      // Pitch contour line
      if (manifest.pitch_contour && manifest.pitch_contour.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        const pts = manifest.pitch_contour;
        for (let j = 0; j < pts.length; j++) {
          const x = (j / (pts.length - 1)) * width;
          const pitch = pts[j];
          const y = pitch > 0 ? height - (pitch / 300) * height * 0.8 : height - 6;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Playhead line
    const playheadX = (currentTime / totalDuration) * width;
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [manifest, currentTime, totalDuration]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(fraction * totalDuration);
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

        {/* FPS Quantization Snapping */}
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
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-dim)', marginLeft: '6px' }}>
            [{currentFrameIdx} / {totalFrames} f]
          </span>
        </div>
      </div>

      {/* Waveform / Scrub canvas */}
      <div style={{ position: 'relative', width: '100%', height: '80px', borderRadius: '8px', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={80}
          onClick={handleCanvasClick}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: 'crosshair',
            background: 'rgba(6, 8, 12, 0.8)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
          }}
        />
      </div>

      {/* Phoneme Ribbon Track */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
          <span>Phonetic Alignment (ARPAbet & Visemes)</span>
          <span style={{ color: '#c084fc' }}>● Intonation Pitch Curve (F0)</span>
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
                title={`${p.phoneme} (${p.viseme}) [${p.start_sec.toFixed(2)}s - ${p.end_sec.toFixed(2)}s]`}
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
