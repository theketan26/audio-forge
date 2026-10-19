import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const PIPER_RELEASE_URL =
  'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz';

export async function resolvePiperBinary(explicitPath?: string): Promise<string> {
  // 1. Environment variable or explicit path passed in config
  const envPath = explicitPath || process.env.PIPER_BIN || process.env.PIPER_BIN_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return path.resolve(envPath);
  }

  // 2. Check local workspace .piper directory
  const localProjectBin = path.resolve(process.cwd(), '.piper/piper/piper');
  if (fs.existsSync(localProjectBin)) {
    return localProjectBin;
  }

  // 3. Check user cache directory (~/.cache/audio-forge/bin/piper/piper)
  const userCacheBin = path.join(
    os.homedir(),
    '.cache',
    'audio-forge',
    'bin',
    'piper',
    'piper'
  );
  if (fs.existsSync(userCacheBin)) {
    return userCacheBin;
  }

  // 4. Check system PATH
  try {
    const sysPath = execSync('which piper 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (sysPath && fs.existsSync(sysPath)) {
      return sysPath;
    }
  } catch {
    // Not found in system PATH
  }

  // 5. Automatically download standalone piper binary to user cache
  const installDir = path.join(os.homedir(), '.cache', 'audio-forge', 'bin');
  fs.mkdirSync(installDir, { recursive: true });

  console.log('Piper binary not found locally. Downloading standalone Piper engine...');
  const tarPath = path.join(installDir, 'piper.tar.gz');

  try {
    execSync(`curl -sSL -o "${tarPath}" "${PIPER_RELEASE_URL}"`);
    execSync(`tar -xzf "${tarPath}" -C "${installDir}"`);
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
    }
  } catch (err) {
    throw new Error(
      `Failed to download standalone Piper binary: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (fs.existsSync(userCacheBin)) {
    // Ensure binary is executable
    fs.chmodSync(userCacheBin, 0o755);
    return userCacheBin;
  }

  throw new Error('Piper TTS binary could not be resolved or downloaded.');
}
