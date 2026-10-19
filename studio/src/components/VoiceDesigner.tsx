import React from 'react';
import { Character, EngineMode, FujisakiParams, GlottalDynamics, VoiceConfig } from '../types';
import { Sliders, Dices, Volume2, Shield, Activity, Sparkles, Cpu } from 'lucide-react';

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

  const updateFujisaki = (key: keyof FujisakiParams, value: number) => {
    const prev = voiceConfig.fujisaki_params || {
      phrase_decay_alpha: 2.0,
      accent_decay_beta: 20.0,
      accent_strength: 0.8,
    };
    onVoiceConfigChange({
      ...voiceConfig,
      fujisaki_params: {
        ...prev,
        [key]: value,
      },
    });
  };

  const updateGlottal = (key: keyof GlottalDynamics, value: number) => {
    const prev = voiceConfig.glottal_dynamics || {
      open_quotient: 0.65,
      breathiness_ratio: 0.08,
      jitter_pct: 0.8,
      shimmer_pct: 2.5,
    };
    onVoiceConfigChange({
      ...voiceConfig,
      glottal_dynamics: {
        ...prev,
        [key]: value,
      },
    });
  };

  const fujisaki = voiceConfig.fujisaki_params || {
    phrase_decay_alpha: 2.0,
    accent_decay_beta: 20.0,
    accent_strength: 0.8,
  };

  const glottal = voiceConfig.glottal_dynamics || {
    open_quotient: voiceConfig.open_quotient || 0.65,
    breathiness_ratio: voiceConfig.breathiness || 0.08,
    jitter_pct: (voiceConfig.jitter || 0.012) * 100,
    shimmer_pct: (voiceConfig.shimmer || 0.015) * 100,
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={17} color="#00f0ff" />
            <span>Voice Acoustics & Fujisaki Prosody Designer</span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            2nd-order critically damped vocal tract & continuous Fujisaki F₀ intonation
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
            onClick={() => onEngineModeChange('neural_vits')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: engineMode === 'neural_vits' ? 'var(--accent-cyan)' : 'transparent',
              color: engineMode === 'neural_vits' ? '#040914' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Neural VITS ✨
          </button>
          <button
            onClick={() => onEngineModeChange('formant')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: engineMode === 'formant' ? 'var(--accent-cyan)' : 'transparent',
              color: engineMode === 'formant' ? '#040914' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Formant v2
          </button>
          <button
            onClick={() => onEngineModeChange('psola')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: engineMode === 'psola' ? '#10b981' : 'transparent',
              color: engineMode === 'psola' ? '#040914' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            TD-PSOLA
          </button>
          <button
            onClick={() => onEngineModeChange('granular')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '11.5px',
              fontWeight: '600',
              border: 'none',
              cursor: 'pointer',
              background: engineMode === 'granular' ? '#c084fc' : 'transparent',
              color: engineMode === 'granular' ? '#040914' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            Animalese
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
            <div style={{ fontSize: '10.5px', color: 'var(--text-dim)' }}>Exact reproducible synthesis</div>
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

      {/* Neural VITS Studio Parameters */}
      {engineMode === 'neural_vits' && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.08), rgba(155, 81, 224, 0.08))',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={16} color="var(--accent-cyan)" />
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
                Embedded Neural VITS Engine
              </span>
            </div>
            <span
              style={{
                fontSize: '10.5px',
                color: 'var(--accent-cyan)',
                background: 'rgba(0, 240, 255, 0.15)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: '600',
              }}
            >
              22,050 Hz Studio Alignment
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-main)' }}>Noise Scale (Expressiveness)</span>
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
                  {(voiceConfig.noise_scale ?? 0.667).toFixed(3)}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.2"
                step="0.01"
                value={voiceConfig.noise_scale ?? 0.667}
                onChange={(e) => updateParam('noise_scale', parseFloat(e.target.value))}
                className="range-slider"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-main)' }}>Noise W (Cadence Variance)</span>
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
                  {(voiceConfig.noise_w ?? 0.8).toFixed(3)}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.5"
                step="0.01"
                value={voiceConfig.noise_w ?? 0.8}
                onChange={(e) => updateParam('noise_w', parseFloat(e.target.value))}
                className="range-slider"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-main)' }}>Speed Scale (Pacing)</span>
                <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
                  {(voiceConfig.speed_scale ?? 1.0).toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={voiceConfig.speed_scale ?? 1.0}
                onChange={(e) => updateParam('speed_scale', parseFloat(e.target.value))}
                className="range-slider"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ONNX Runtime Acceleration</span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-main)', marginTop: '2px' }}>
                Piper VITS (en_US-lessac-medium) + Direct Frame Quantization
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Primary Acoustic Parameters Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
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

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Speech Pacing (Speed)</span>
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

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--text-main)' }}>Articulation Inertia Speed</span>
            <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: '600' }}>
              {(voiceConfig.articulation_speed || 1.1).toFixed(2)}x
            </span>
          </div>
          <input
            type="range"
            min="0.6"
            max="2.0"
            step="0.05"
            value={voiceConfig.articulation_speed || 1.1}
            onChange={(e) => updateParam('articulation_speed', parseFloat(e.target.value))}
            className="range-slider"
          />
        </div>
      </div>

      {/* Fujisaki Intonation & Prosody Section */}
      <div
        style={{
          background: 'rgba(155, 81, 224, 0.08)',
          border: '1px solid rgba(155, 81, 224, 0.25)',
          borderRadius: '8px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={15} color="#c084fc" />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
            Fujisaki Intonation Dynamics
          </span>
          <span style={{ fontSize: '10.5px', color: '#c084fc', background: 'rgba(155, 81, 224, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
            Natural F₀
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px 14px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Phrase Decay (α)</span>
              <span className="mono" style={{ color: '#c084fc' }}>{fujisaki.phrase_decay_alpha.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="3.5"
              step="0.1"
              value={fujisaki.phrase_decay_alpha}
              onChange={(e) => updateFujisaki('phrase_decay_alpha', parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Accent Decay (β)</span>
              <span className="mono" style={{ color: '#c084fc' }}>{fujisaki.accent_decay_beta.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min="10.0"
              max="35.0"
              step="1.0"
              value={fujisaki.accent_decay_beta}
              onChange={(e) => updateFujisaki('accent_decay_beta', parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Accent Strength (Aa)</span>
              <span className="mono" style={{ color: '#c084fc' }}>{fujisaki.accent_strength.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.5"
              step="0.05"
              value={fujisaki.accent_strength}
              onChange={(e) => updateFujisaki('accent_strength', parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>
        </div>
      </div>

      {/* Glottal Source & 1/f Pink Noise Dynamics */}
      <div
        style={{
          background: 'rgba(0, 240, 255, 0.05)',
          border: '1px solid rgba(0, 240, 255, 0.2)',
          borderRadius: '8px',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} color="var(--accent-cyan)" />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
            Glottal Physics & 1/f Pink Noise Dynamics
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Open-Quotient (Oq)</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{glottal.open_quotient.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.35"
              max="0.85"
              step="0.02"
              value={glottal.open_quotient}
              onChange={(e) => {
                updateGlottal('open_quotient', parseFloat(e.target.value));
                updateParam('open_quotient', parseFloat(e.target.value));
              }}
              className="range-slider"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Breathiness (2-5kHz Aspiration)</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{(glottal.breathiness_ratio * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.25"
              step="0.01"
              value={glottal.breathiness_ratio}
              onChange={(e) => {
                updateGlottal('breathiness_ratio', parseFloat(e.target.value));
                updateParam('breathiness', parseFloat(e.target.value));
              }}
              className="range-slider"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Organic Jitter (1/f Pink)</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{glottal.jitter_pct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="2.5"
              step="0.1"
              value={glottal.jitter_pct}
              onChange={(e) => updateGlottal('jitter_pct', parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Organic Shimmer (Amplitude)</span>
              <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{glottal.shimmer_pct.toFixed(1)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.2"
              value={glottal.shimmer_pct}
              onChange={(e) => updateGlottal('shimmer_pct', parseFloat(e.target.value))}
              className="range-slider"
            />
          </div>
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
