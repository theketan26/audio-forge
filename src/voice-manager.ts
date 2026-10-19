import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

export interface VoiceMetadata {
  name: string;
  language: string;
  country: string;
  gender: 'female' | 'male' | 'multi';
  quality: 'low' | 'medium' | 'high';
  sampleRate: number;
  speakersCount: number;
  description: string;
  hfPath: string; // Path relative to Hugging Face repo v1.0.0
}

export const POPULAR_VOICES: Record<string, VoiceMetadata> = {
  'en_US-lessac-low': {
    name: 'en_US-lessac-low',
    language: 'en',
    country: 'US',
    gender: 'female',
    quality: 'low',
    sampleRate: 16000,
    speakersCount: 1,
    description: 'Crisp American English female voice, lightweight and ultra-fast',
    hfPath: 'en/en_US/lessac/low/en_US-lessac-low',
  },
  'en_US-lessac-medium': {
    name: 'en_US-lessac-medium',
    language: 'en',
    country: 'US',
    gender: 'female',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Natural, articulate American English female voice',
    hfPath: 'en/en_US/lessac/medium/en_US-lessac-medium',
  },
  'en_US-lessac-high': {
    name: 'en_US-lessac-high',
    language: 'en',
    country: 'US',
    gender: 'female',
    quality: 'high',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'High-fidelity American English female voice',
    hfPath: 'en/en_US/lessac/high/en_US-lessac-high',
  },
  'en_US-amy-medium': {
    name: 'en_US-amy-medium',
    language: 'en',
    country: 'US',
    gender: 'female',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Pleasant, expressive American English female voice',
    hfPath: 'en/en_US/amy/medium/en_US-amy-medium',
  },
  'en_US-ryan-medium': {
    name: 'en_US-ryan-medium',
    language: 'en',
    country: 'US',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Clear, resonant American English male voice',
    hfPath: 'en/en_US/ryan/medium/en_US-ryan-medium',
  },
  'en_US-libritts-high': {
    name: 'en_US-libritts-high',
    language: 'en',
    country: 'US',
    gender: 'multi',
    quality: 'high',
    sampleRate: 22050,
    speakersCount: 904,
    description: 'Rich multi-speaker American English dataset with 900+ distinct speakers',
    hfPath: 'en/en_US/libritts/high/en_US-libritts-high',
  },
  'en_GB-alba-medium': {
    name: 'en_GB-alba-medium',
    language: 'en',
    country: 'GB',
    gender: 'female',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Natural British English Scottish/Northern female voice',
    hfPath: 'en/en_GB/alba/medium/en_GB-alba-medium',
  },
  'en_GB-alan-medium': {
    name: 'en_GB-alan-medium',
    language: 'en',
    country: 'GB',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Articulate British English male voice',
    hfPath: 'en/en_GB/alan/medium/en_GB-alan-medium',
  },
  'es_ES-davefx-medium': {
    name: 'es_ES-davefx-medium',
    language: 'es',
    country: 'ES',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'European Spanish male voice',
    hfPath: 'es/es_ES/davefx/medium/es_ES-davefx-medium',
  },
  'fr_FR-siwis-medium': {
    name: 'fr_FR-siwis-medium',
    language: 'fr',
    country: 'FR',
    gender: 'female',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Smooth French female voice',
    hfPath: 'fr/fr_FR/siwis/medium/fr_FR-siwis-medium',
  },
  'de_DE-thorsten-medium': {
    name: 'de_DE-thorsten-medium',
    language: 'de',
    country: 'DE',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Clear Standard German male voice',
    hfPath: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium',
  },
  'hi_IN-rohit-medium': {
    name: 'hi_IN-rohit-medium',
    language: 'hi',
    country: 'IN',
    gender: 'male',
    quality: 'medium',
    sampleRate: 22050,
    speakersCount: 1,
    description: 'Natural Hindi Indian male voice',
    hfPath: 'hi/hi_IN/rohit/medium/hi_IN-rohit-medium',
  },
};

export interface ResolvedVoice {
  name: string;
  modelPath: string;
  configPath: string;
  sampleRate: number;
  numSpeakers: number;
  speakerIdMap?: Record<string, number>;
}

export class VoiceManager {
  private cacheDir: string;
  private localModelDir: string;

  constructor(customCacheDir?: string) {
    this.cacheDir =
      customCacheDir || path.join(os.homedir(), '.cache', 'audio-forge', 'voices');
    this.localModelDir = path.resolve(process.cwd(), 'models');
  }

  /**
   * Resolve a voice by direct paths, catalog name, or local model directory.
   */
  public async resolveVoice(
    voiceName?: string,
    modelPath?: string,
    configPath?: string,
    autoDownload = true
  ): Promise<ResolvedVoice> {
    // Case 1: Direct file paths provided
    if (modelPath && fs.existsSync(modelPath)) {
      const resolvedModel = path.resolve(modelPath);
      const resolvedConfig = configPath
        ? path.resolve(configPath)
        : `${resolvedModel}.json`;

      if (!fs.existsSync(resolvedConfig)) {
        throw new Error(
          `Voice model config not found at: ${resolvedConfig}. Please specify config_path.`
        );
      }
      return this.parseVoiceFiles(voiceName || path.basename(modelPath, '.onnx'), resolvedModel, resolvedConfig);
    }

    // Default to en_US-lessac-low if nothing specified
    const targetName = voiceName || 'en_US-lessac-low';

    // Case 2: Check local models/ directory
    const localModel = path.join(this.localModelDir, `${targetName}.onnx`);
    const localConfig = path.join(this.localModelDir, `${targetName}.onnx.json`);
    if (fs.existsSync(localModel) && fs.existsSync(localConfig)) {
      return this.parseVoiceFiles(targetName, localModel, localConfig);
    }

    // Case 3: Check cache directory
    const cachedModel = path.join(this.cacheDir, `${targetName}.onnx`);
    const cachedConfig = path.join(this.cacheDir, `${targetName}.onnx.json`);
    if (fs.existsSync(cachedModel) && fs.existsSync(cachedConfig)) {
      return this.parseVoiceFiles(targetName, cachedModel, cachedConfig);
    }

    // Case 4: Download from catalog if autoDownload is enabled
    if (autoDownload && POPULAR_VOICES[targetName]) {
      const downloaded = await this.downloadVoice(targetName);
      return this.parseVoiceFiles(targetName, downloaded.modelPath, downloaded.configPath);
    }

    throw new Error(
      `Voice "${targetName}" is not available locally. Available options in catalog: ${Object.keys(
        POPULAR_VOICES
      ).join(', ')}`
    );
  }

  /**
   * Download a voice model and its JSON configuration from Hugging Face repository
   */
  public async downloadVoice(voiceName: string): Promise<{ modelPath: string; configPath: string }> {
    const meta = POPULAR_VOICES[voiceName];
    if (!meta) {
      throw new Error(`Voice "${voiceName}" not recognized in catalog.`);
    }

    fs.mkdirSync(this.cacheDir, { recursive: true });
    const targetModel = path.join(this.cacheDir, `${voiceName}.onnx`);
    const targetConfig = path.join(this.cacheDir, `${voiceName}.onnx.json`);

    const baseUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';
    const onnxUrl = `${baseUrl}/${meta.hfPath}.onnx`;
    const jsonUrl = `${baseUrl}/${meta.hfPath}.onnx.json`;

    console.log(`Downloading voice "${voiceName}" (${meta.quality} quality, ${meta.description})...`);

    try {
      execSync(`curl -sSL -o "${targetConfig}" "${jsonUrl}"`);
      execSync(`curl -sSL -o "${targetModel}" "${onnxUrl}"`);
    } catch (err) {
      throw new Error(
        `Failed to download voice "${voiceName}": ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return { modelPath: targetModel, configPath: targetConfig };
  }

  /**
   * Parse .onnx.json metadata for sample rate, number of speakers, and speaker mappings
   */
  private parseVoiceFiles(name: string, modelPath: string, configPath: string): ResolvedVoice {
    let sampleRate = 22050;
    let numSpeakers = 1;
    let speakerIdMap: Record<string, number> | undefined;

    try {
      const rawJson = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(rawJson);
      if (parsed.audio?.sample_rate) {
        sampleRate = parsed.audio.sample_rate;
      }
      if (parsed.num_speakers !== undefined) {
        numSpeakers = Number(parsed.num_speakers);
      }
      if (parsed.speaker_id_map && typeof parsed.speaker_id_map === 'object') {
        speakerIdMap = parsed.speaker_id_map;
      }
    } catch (e) {
      console.warn(`Warning: Could not parse voice config at ${configPath}:`, e);
    }

    return {
      name,
      modelPath,
      configPath,
      sampleRate,
      numSpeakers,
      speakerIdMap,
    };
  }

  /**
   * List all available voices (catalog + local + cached)
   */
  public listVoices(): Array<VoiceMetadata & { installed: boolean; path?: string }> {
    return Object.entries(POPULAR_VOICES).map(([name, meta]) => {
      const localModel = path.join(this.localModelDir, `${name}.onnx`);
      const cachedModel = path.join(this.cacheDir, `${name}.onnx`);

      let installed = false;
      let modelPath: string | undefined;

      if (fs.existsSync(localModel)) {
        installed = true;
        modelPath = localModel;
      } else if (fs.existsSync(cachedModel)) {
        installed = true;
        modelPath = cachedModel;
      }

      return {
        ...meta,
        installed,
        path: modelPath,
      };
    });
  }
}
