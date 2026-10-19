import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ForgeConfigSchema } from '../src/types.js';
import { VoiceManager, POPULAR_VOICES } from '../src/voice-manager.js';
import { inspectWavFile } from '../src/monitor.js';

console.log('Running test suite for audio-forge...');

// Test 1: Config Schema Validation
console.log('1. Testing Zod schema validation...');
const validConfig = {
  version: '1.0',
  input: { text: 'Test synthesis text.' },
  voice: {
    name: 'en_US-lessac-low',
    speaker_id: 0,
    features: {
      length_scale: 1.0,
      noise_scale: 0.667,
      noise_w: 0.8,
      sentence_silence: 0.2,
    },
  },
  output: { path: './output/test.wav' },
  monitor: { enabled: true, report_path: './output/test_report.json' },
};
const parsed = ForgeConfigSchema.safeParse(validConfig);
assert.strictEqual(parsed.success, true, 'Schema should accept valid configuration');

const invalidConfig = {
  version: '1.0',
  input: {}, // missing both text and batch
};
const invalidParsed = ForgeConfigSchema.safeParse(invalidConfig);
assert.strictEqual(invalidParsed.success, false, 'Schema should reject input without text or batch');
console.log('✔ Schema validation tests passed.');

// Test 2: Voice Manager
console.log('2. Testing VoiceManager catalog...');
const vm = new VoiceManager();
const voices = vm.listVoices();
assert(voices.length > 5, 'Voice catalog should list multiple voices');
assert(POPULAR_VOICES['en_US-lessac-low'], 'en_US-lessac-low must be in catalog');
console.log(`✔ VoiceManager verified (${voices.length} voices in catalog).`);

// Test 3: WAV Inspection
console.log('3. Testing WAV inspector...');
const testWavPath = path.resolve('./output/synthesized_speech.wav');
if (fs.existsSync(testWavPath)) {
  const meta = inspectWavFile(testWavPath);
  assert(meta.sampleRate > 0, 'Sample rate must be positive');
  assert(meta.durationSeconds > 0, 'Duration must be positive');
  assert.strictEqual(meta.channels, 1, 'Channels should be mono');
  console.log(`✔ WAV inspector verified: ${meta.durationSeconds.toFixed(2)}s, ${meta.sampleRate}Hz.`);
} else {
  console.log('ℹ Skipping WAV inspector file check (file not present yet).');
}

console.log('\nAll tests passed successfully! 🎉');
