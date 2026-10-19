import React, { useState, useEffect, useRef } from 'react';
import { Character, EngineMode, RenderRun, SpeechManifest, VoiceConfig } from './types';
import { ScriptEditor } from './components/ScriptEditor';
import { TimelineInspector } from './components/TimelineInspector';
import { VoiceDesigner } from './components/VoiceDesigner';
import { RenderHistory } from './components/RenderHistory';
import { AudioWaveform, Zap, Disc3, ShieldCheck } from 'lucide-react';

const DEFAULT_SCRIPT = "Hello adventurer! Welcome to AudioForge. [pause:200ms] Are you ready for quest?";

export const App: React.FC = () => {
  const [script, setScript] = useState<string>(DEFAULT_SCRIPT);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  const [engineMode, setEngineMode] = useState<EngineMode>('formant');
  const [seed, setSeed] = useState<number>(424242);
  const [targetFps, setTargetFps] = useState<number>(30);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    base_pitch_hz: 135.0,
    formant_shift: 1.05,
    speed: 1.0,
    jitter: 0.012,
    shimmer: 0.015,
    breathiness: 0.05,
    open_quotient: 0.58,
    rest_viseme: 'rest',
  });

  const [bgmEnabled, setBgmEnabled] = useState<boolean>(false);
  const [bgmVolumeDb, setBgmVolumeDb] = useState<number>(-8.0);

  const [manifest, setManifest] = useState<SpeechManifest | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [renderRuns, setRenderRuns] = useState<RenderRun[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Audio Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Fetch initial characters and renders from API
  useEffect(() => {
    fetch('/api/v1/characters')
      .then((res) => res.json())
      .then((data: Character[]) => {
        if (data && data.length > 0) {
          setCharacters(data);
          setSelectedCharacter(data[0]);
          setVoiceConfig(data[0].voice_config);
          setEngineMode(data[0].engine_mode);
          setSeed(data[0].base_seed);
        }
      })
      .catch((err) => console.error('Failed to load characters:', err));

    fetch('/api/v1/renders')
      .then((res) => res.json())
      .then((data: RenderRun[]) => {
        if (data) setRenderRuns(data);
      })
      .catch((err) => console.error('Failed to load renders:', err));
  }, []);

  // Sync playhead smoothly via requestAnimationFrame
  const updatePlayhead = () => {
    if (audioRef.current && isPlaying) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.ended) {
        setIsPlaying(false);
        setCurrentTime(0);
      } else {
        animFrameRef.current = requestAnimationFrame(updatePlayhead);
      }
    }
  };

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlayhead);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  // Handle character switch
  const handleSelectCharacter = (char: Character) => {
    setSelectedCharacter(char);
    setVoiceConfig(char.voice_config);
    setEngineMode(char.engine_mode);
    setSeed(char.base_seed);
  };

  // Preview endpoint trigger
  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          mode: engineMode,
          seed,
          target_fps: targetFps,
          voice_config: voiceConfig,
        }),
      });

      if (!res.ok) throw new Error('Preview failed');
      const data = await res.json();
      setManifest(data.manifest);
      setAudioBase64(data.audio_base64);
      setDuration(data.manifest.duration_sec);

      // Setup audio element
      if (audioRef.current) {
        audioRef.current.src = `data:audio/wav;base64,${data.audio_base64}`;
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Full Render endpoint trigger
  const handleRender = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: script.slice(0, 30) + '...',
          script,
          character_id: selectedCharacter?.id,
          mode: engineMode,
          seed,
          target_fps: targetFps,
          voice_config: voiceConfig,
          bgm_enabled: bgmEnabled,
          bgm_volume_db: bgmVolumeDb,
        }),
      });

      if (!res.ok) throw new Error('Render failed');
      const run: RenderRun = await res.json();

      setManifest(run.manifest);
      setAudioBase64(run.audio_base64);
      setDuration(run.manifest.duration_sec);
      setRenderRuns((prev) => [run, ...prev]);

      if (audioRef.current) {
        audioRef.current.src = `data:audio/wav;base64,${run.audio_base64}`;
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    } catch (err) {
      console.error('Render error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Play/pause toggle
  const handlePlayToggle = () => {
    if (!audioRef.current || !audioBase64) {
      // If no audio loaded yet, trigger preview
      handlePreview();
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Seek playhead
  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  // Restore past run
  const handleLoadRun = (run: RenderRun) => {
    setScript(run.script_raw);
    setSeed(run.seed_used);
    setManifest(run.manifest);
    setAudioBase64(run.audio_base64);
    setDuration(run.manifest.duration_sec);
    setTargetFps(run.manifest.target_fps);

    if (audioRef.current) {
      audioRef.current.src = `data:audio/wav;base64,${run.audio_base64}`;
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };


  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Hidden audio element for synchronous playback */}
      <audio
        ref={audioRef}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />

      {/* Header bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #00f0ff 0%, #9b51e0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(0, 240, 255, 0.4)',
            }}
          >
            <AudioWaveform size={24} color="#040914" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #ffffff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              AudioForge Studio
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Deterministic Speech Synthesis & Lip-Sync Animation Engine
            </p>
          </div>
        </div>

        {/* Engine Pipeline Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              fontSize: '11.5px',
              color: '#34d399',
            }}
          >
            <ShieldCheck size={14} /> Bit-Exact DSP Core
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'rgba(0, 240, 255, 0.1)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '8px',
              fontSize: '11.5px',
              color: 'var(--accent-cyan)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <Zap size={14} /> 48 kHz / 32-bit Float
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'rgba(155, 81, 224, 0.1)',
              border: '1px solid rgba(155, 81, 224, 0.3)',
              borderRadius: '8px',
              fontSize: '11.5px',
              color: '#c084fc',
            }}
          >
            <Disc3 size={14} /> Multi-Bus Mixer
          </div>
        </div>
      </header>

      {/* Script Editor */}
      <ScriptEditor
        script={script}
        onScriptChange={setScript}
        onPreview={handlePreview}
        onRender={handleRender}
        isLoading={isLoading}
      />


      {/* Full-Width Timeline Inspector */}
      <TimelineInspector
        manifest={manifest}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        onPlayToggle={handlePlayToggle}
        onSeek={handleSeek}
        currentFps={targetFps}
        onFpsChange={setTargetFps}
      />

      {/* Lower Grid: Voice Designer & Render History */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr', gap: '22px' }}>
        <VoiceDesigner
          characters={characters}
          selectedCharacter={selectedCharacter}
          onSelectCharacter={handleSelectCharacter}
          voiceConfig={voiceConfig}
          onVoiceConfigChange={setVoiceConfig}
          engineMode={engineMode}
          onEngineModeChange={setEngineMode}
          seed={seed}
          onSeedChange={setSeed}
          bgmEnabled={bgmEnabled}
          onBgmToggle={setBgmEnabled}
          bgmVolumeDb={bgmVolumeDb}
          onBgmVolumeChange={setBgmVolumeDb}
        />

        <RenderHistory
          runs={renderRuns}
          onLoadRun={handleLoadRun}
        />
      </div>
    </div>
  );
};
