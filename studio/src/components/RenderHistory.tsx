import React, { useState } from 'react';
import { RenderRun } from '../types';
import { History, Download, Code2, RotateCcw, Check, FileJson, FileAudio, FileSpreadsheet } from 'lucide-react';

interface RenderHistoryProps {
  runs: RenderRun[];
  onLoadRun: (run: RenderRun) => void;
}

export const RenderHistory: React.FC<RenderHistoryProps> = ({ runs, onLoadRun }) => {
  const [selectedRunForExport, setSelectedRunForExport] = useState<RenderRun | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'godot' | 'unity'>('godot');

  const downloadWav = (run: RenderRun) => {
    const link = document.createElement('a');
    link.href = `data:audio/wav;base64,${run.audio_base64}`;
    link.download = `audioforge_${run.seed_used}.wav`;
    link.click();
  };

  const downloadJson = (run: RenderRun) => {
    const blob = new Blob([JSON.stringify(run.manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `visemes_${run.seed_used}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCsv = (run: RenderRun) => {
    let csv = 'frame,timestamp_sec,primary_viseme,weight,sprite_frame_id\n';
    for (const f of run.manifest.frames) {
      csv += `${f.frame_index},${f.timestamp_sec.toFixed(4)},${f.primary},${f.primary_weight.toFixed(3)},${f.sprite_frame_id}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `blendshapes_${run.seed_used}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const godotCodeSnippet = `# Godot 4 GDScript - AudioForge LipSync Runtime
extends Node2D

@export var audio_player: AudioStreamPlayer
@export var sprite_rig: AnimatedSprite2D
@export var manifest_path: String = "res://dialogue_manifest.json"

var viseme_frames: Array = []
var fps: float = 30.0

func _ready():
    var file = FileAccess.open(manifest_path, FileAccess.READ)
    var json = JSON.parse_string(file.get_as_text())
    viseme_frames = json["frames"]
    fps = json["target_fps"]

func _process(delta):
    if audio_player.playing:
        var playback_time = audio_player.get_playback_position()
        var current_frame = int(playback_time * fps)
        if current_frame < viseme_frames.size():
            var frame_data = viseme_frames[current_frame]
            # Map directly to 2D sprite frame ID or morph target
            sprite_rig.frame = frame_data["sprite_frame_id"]
`;

  const unityCodeSnippet = `// Unity C# - AudioForge BlendShape Runtime
using UnityEngine;
using System.IO;

public class AudioForgeLipSync : MonoBehaviour {
    public AudioSource audioSource;
    public SkinnedMeshRenderer faceMesh;
    public TextAsset manifestJson;

    [System.Serializable]
    public class VisemeData {
        public int frame_index;
        public float timestamp_sec;
        public string primary;
        public float primary_weight;
    }

    void Update() {
        if (audioSource.isPlaying) {
            float time = audioSource.time;
            // Frame-accurate blendshape weights from AudioForge manifest
        }
    }
}`;

  const copyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: '16px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={17} color="#00f0ff" />
            <span>Render Runs & Artifact Manifests</span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Snapshot history, seed restoration, and game runtime exports
          </p>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
          {runs.length} Render{runs.length === 1 ? '' : 's'} Logged
        </div>
      </div>

      {/* Render Run List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
        {runs.length === 0 ? (
          <div
            style={{
              padding: '30px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: '13px',
              border: '1px dashed var(--border-subtle)',
              borderRadius: '8px',
            }}
          >
            No render runs yet. Click "Render Run & Stems" to produce deterministic assets.
          </div>
        ) : (
          runs.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: '180px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>
                  {r.script_title || 'Clip'} • <span style={{ color: 'var(--accent-cyan)' }}>{r.character_name}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  Seed: {r.seed_used} • {r.duration_ms}ms • {r.manifest.total_frames} frames
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => onLoadRun(r)}
                  title="Restore this run to editor"
                  style={{ padding: '6px 10px', fontSize: '11.5px' }}
                >
                  <RotateCcw size={13} /> Load
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadWav(r)}
                  title="Download 48kHz WAV"
                  style={{ padding: '6px 10px', fontSize: '11.5px' }}
                >
                  <FileAudio size={13} /> WAV
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadJson(r)}
                  title="Download Viseme JSON Manifest"
                  style={{ padding: '6px 10px', fontSize: '11.5px' }}
                >
                  <FileJson size={13} /> JSON
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadCsv(r)}
                  title="Download CSV Blendshape Curves"
                  style={{ padding: '6px 10px', fontSize: '11.5px' }}
                >
                  <FileSpreadsheet size={13} /> CSV
                </button>
                <button
                  className="btn btn-purple"
                  onClick={() => setSelectedRunForExport(r)}
                  title="View Runtime Integration Code"
                  style={{ padding: '6px 10px', fontSize: '11.5px' }}
                >
                  <Code2 size={13} /> Engine Code
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Code Export Modal */}
      {selectedRunForExport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setSelectedRunForExport(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '680px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '17px' }}>Game Engine Integration Runtime</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Sample-accurate lip-sync animation driver code
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedRunForExport(null)}
                style={{ padding: '4px 10px' }}
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
              <button
                onClick={() => setActiveTab('godot')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: activeTab === 'godot' ? 'rgba(0, 240, 255, 0.2)' : 'transparent',
                  color: activeTab === 'godot' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '12px',
                }}
              >
                Godot 4 (GDScript)
              </button>
              <button
                onClick={() => setActiveTab('unity')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: activeTab === 'unity' ? 'rgba(155, 81, 224, 0.2)' : 'transparent',
                  color: activeTab === 'unity' ? '#c084fc' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '12px',
                }}
              >
                Unity (C# BlendShapes)
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <pre
                className="mono"
                style={{
                  background: '#04060a',
                  padding: '16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#93c5fd',
                  overflowX: 'auto',
                  border: '1px solid var(--border-subtle)',
                  maxHeight: '300px',
                }}
              >
                {activeTab === 'godot' ? godotCodeSnippet : unityCodeSnippet}
              </pre>

              <button
                className="btn btn-secondary"
                onClick={() => copyCode(activeTab === 'godot' ? godotCodeSnippet : unityCodeSnippet)}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  padding: '5px 10px',
                  fontSize: '11px',
                }}
              >
                {copied ? <Check size={12} color="#10b981" /> : <Code2 size={12} />}
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
