import React from 'react';
import { Character, EngineMode, VoiceConfig } from '../types';
import { Sliders, Dices, Volume2, Shield } from 'lucide-react';

interface VoiceDesignerProps {
  characters: Character[];
  selectedCharacter: Character | null;
  onSelectCharacter: (char: Character) => void;
  voiceConfig: VoiceConfig;
  onVoiceConfigChange: (cfg: VoiceConfig) => void;
  engineMode: EngineMode;
  onEngineModeChange: (mode: EngineMode) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
  bgmEnabled: boolean;
  onBgmToggle: (enabled: boolean) => void;
  bgmVolumeDb: number;
  onBgmVolumeChange: (vol: number) => void;
}

export const VoiceDesigner: React.FC<VoiceDesignerProps> = ({
  characters,
  selectedCharacter,
  onSelectCharacter,
  voiceConfig,
  onVoiceConfigChange,
  engineMode,
  onEngineModeChange,
  seed,
  onSeedChange,
  bgmEnabled,
  onBgmToggle,
  bgmVolumeDb,
  onBgmVolumeChange,
}) => {
  const randomizeSeed = () => {
    onSeedChange(Math.floor(Math.random() * 900000) + 100000);
  };

  const updateParam = (key: keyof VoiceConfig, value: number) => {
    onVoiceConfigChange({
      ...voiceConfig,
      [key]: value,
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={17} color="#00f0ff" />
            <span>Voice Preset & DSP Designer</span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Liljencrants-Fant glottal pulse & formant filter parameters
          </p>
        </div>

        {/* Engine Mode Switcher */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            onClick={() => onEngineModeChange('formant')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: engineMode === 'formant' ? 'var(--accent-cyan)' : 'transparent',
              color: engineMode === 'formant' ? '#040914' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Formant Tract
          </button>
          <button
            onClick={() => onEngineModeChange('granular')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: engineMode === 'granular' ? '#c084fc' : 'transparent',
              color: engineMode === 'granular' ? '#040914' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Animalese Blips
          </button>
        </div>
      </div>

      {/* Character Archetype Cards */}
      <div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          Select Archetype Profile:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          {characters.map((c) => {
            const isSelected = selectedCharacter?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelectCharacter(c)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: isSelected ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                  border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: '600', color: isSelected ? '#ffffff' : 'var(--text-main)' }}>
                  {c.name}
                </div>
                <div style={{ fontSize: '10.5px', color: isSelected ? 'var(--accent-cyan)' : 'var(--text-dim)' }}>
                  {c.engine_mode} • {c.voice_config.base_pitch_hz}Hz
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seed Controller */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '10px 14px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={16} color="var(--accent-cyan)" />
          <div>
            <div style={{ fontSize: '12px', fontWeight: '600' }}>Deterministic Seed</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>Guarantees bit-exact reproduction</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            value={seed}
            onChange={(e) => onSeedChange(parseInt(e.target.value) || 0)}
            className="mono"
            style={{
              width: '100px',
              background: 'rgba(0, 0, 0, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '6px 8px',
              color: 'var(--accent-cyan)',
              fontSize: '13px',
              fontWeight: '700',
              textAlign: 'center',
            }}
          />
          <button
            className="btn btn-secondary"
            onClick={randomizeSeed}
            title="Randomize Seed"
            style={{ padding: '6px 10px' }}
          >
            <Dices size={15} />
          </button>
        </div>
      </div>

      {/* Acoustic Parameters Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' }}>
        {/* Base Pitch F0 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Base Pitch ($F_0$)</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {voiceConfig.base_pitch_hz.toFixed(0)} Hz
            </span>
          </div>
          <input
            type="range"
            min="60"
            max="300"
            step="1"
            value={voiceConfig.base_pitch_hz}
            onChange={(e) => updateParam('base_pitch_hz', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>

        {/* Formant Shift */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Formant Shift</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {voiceConfig.formant_shift.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.8"
            step="0.02"
            value={voiceConfig.formant_shift}
            onChange={(e) => updateParam('formant_shift', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>

        {/* Speed */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Speech Pacing</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {voiceConfig.speed.toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.05"
            value={voiceConfig.speed}
            onChange={(e) => updateParam('speed', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>

        {/* Open Quotient */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Glottal Open-Quotient</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {voiceConfig.open_quotient.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min="0.35"
            max="0.85"
            step="0.02"
            value={voiceConfig.open_quotient}
            onChange={(e) => updateParam('open_quotient', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>

        {/* Jitter */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Pitch Jitter</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {(voiceConfig.jitter * 100).toFixed(1)}%
            </span>
          </div>
          <input
            type="range"
            min="0.0"
            max="0.06"
            step="0.002"
            value={voiceConfig.jitter}
            onChange={(e) => updateParam('jitter', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>

        {/* Shimmer / Breathiness */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Breathiness (Noise)</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {(voiceConfig.breathiness * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.25"
            step="0.01"
            value={voiceConfig.breathiness}
            onChange={(e) => updateParam('breathiness', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>
      </div>

      {/* Multi-Bus Compositor Settings */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '12px 14px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Volume2 size={16} color="#c084fc" />
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600' }}>Multi-Track BGM & Ducking Bus</div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>
                Auto-ducks ambient music by -12 dB when speech begins
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={bgmEnabled}
              onChange={(e) => onBgmToggle(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--accent-cyan)' }}
            />
            <span>Enable BGM</span>
          </label>
        </div>

        {bgmEnabled && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>BGM Volume</span>
              <span className="mono" style={{ color: '#c084fc' }}>{bgmVolumeDb.toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="-24"
              max="0"
              step="0.5"
              value={bgmVolumeDb}
              onChange={(e) => onBgmVolumeChange(parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>
        )}
      </div>
    </div>
  );
};
