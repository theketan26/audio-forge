import React, { useRef } from 'react';
import { Sparkles, Play, Clock, Zap } from 'lucide-react';

interface ScriptEditorProps {
  script: string;
  onScriptChange: (newScript: string) => void;
  onPreview: () => void;
  onRender: () => void;
  isLoading: boolean;
}

const PRESETS = [
  {
    name: "Hero's Call",
    text: "Greetings adventurer! We must venture into the dragon's lair. [pause:250ms] Are you prepared for the quest?",
  },
  {
    name: 'Cyber AI Alert',
    text: 'Security system initialized. [pitch:+10%] Warning! Intrusion detected on sector four. [pause:200ms] Shield online.',
  },
  {
    name: 'Animalese Sprite',
    text: 'Hey there neighbor! What a wonderful day in the forest! [pause:150ms] Would you like to trade items with me?',
  },
  {
    name: 'Arcane Sorcerer',
    text: 'By the powers of ancient flame... [pause:300ms] [pitch:-15%] Awaken, titan of shadow! [pitch:+20%] Strike now!',
  },
];

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  script,
  onScriptChange,
  onPreview,
  onRender,
  isLoading,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertTag = (tag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onScriptChange(script + ' ' + tag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = script.substring(0, start);
    const after = script.substring(end);
    const newText = before + (before.endsWith(' ') || before.length === 0 ? '' : ' ') + tag + ' ' + after;
    onScriptChange(newText);

    setTimeout(() => {
      textarea.focus();
      const newPos = start + tag.length + 2;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Dialogue Script Editor</span>
            <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', background: 'rgba(0, 240, 255, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              SSML-lite Supported
            </span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Type dialogue text with phoneme markers or inline SSML tags
          </p>
        </div>

        {/* Preset Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => onScriptChange(p.text)}
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '5px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* SSML Tag Inserter Bar */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles size={12} color="#00f0ff" /> Insert Tag:
        </span>
        <button className="badge-chip" onClick={() => insertTag('[pause:200ms]')}>
          <Clock size={11} /> + Pause (200ms)
        </button>
        <button className="badge-chip" onClick={() => insertTag('[pitch:+15%]')}>
          <Zap size={11} /> + Pitch (+15%)
        </button>
        <button className="badge-chip" onClick={() => insertTag('[pitch:-10%]')}>
          <Zap size={11} /> + Pitch (-10%)
        </button>
        <button className="badge-chip" onClick={() => insertTag('[speed:1.2]')}>
          + Speed (1.2x)
        </button>
        <button className="badge-chip" onClick={() => insertTag('[viseme:wide_open]')}>
          + Viseme (wide_open)
        </button>
      </div>

      {/* Main Script Textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          value={script}
          onChange={(e) => onScriptChange(e.target.value)}
          placeholder="Type dialogue text here... e.g. Hello world! [pause:150ms] Ready to begin?"
          rows={4}
          style={{
            width: '100%',
            background: 'rgba(6, 8, 12, 0.9)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            color: '#f8fafc',
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            lineHeight: '1.6',
            resize: 'vertical',
            outline: 'none',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
        />
      </div>

      {/* Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
          {script.length} characters • {script.split(/\s+/).filter(Boolean).length} words
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={onPreview}
            disabled={isLoading || !script.trim()}
          >
            <Play size={15} /> Instant Preview
          </button>
          <button
            className="btn btn-primary"
            onClick={onRender}
            disabled={isLoading || !script.trim()}
          >
            <Sparkles size={15} /> {isLoading ? 'Synthesizing...' : 'Render Run & Stems'}
          </button>
        </div>
      </div>
    </div>
  );
};
