import { decrypt, deriveEncryptionKey, keyFingerprint } from './crypto.js';
import { parseEnvFile } from './env-file.js';
import { loadProjectConfig } from './config.js';
import { buildEnvKey, buildManifestKey, manifestEntriesToFiles } from './env-namespacing.js';
import { BoltenvError, Errors } from '../utils/errors.js';
import type { ApiClient } from './api-client.js';
import type { EnvEntry } from '../types/index.js';

export interface ResolvedFile {
  readonly filename: string;
  readonly entries: ReadonlyArray<EnvEntry>;
}

/**
 * Pull entries for a single environment key from the server.
 * Validates key fingerprint and decrypts.
 */
export async function pullEntriesFromServer(
  envKey: string,
  masterKey: Buffer,
  api: ApiClient,
  version?: number,
): Promise<ReadonlyArray<EnvEntry>> {
  const result = await api.pull({
    environment: envKey,
    version,
  });

  const localFingerprint = keyFingerprint(masterKey);
  if (result.keyFingerprint && result.keyFingerprint !== localFingerprint) {
    throw Errors.keyMismatch(localFingerprint, result.keyFingerprint);
  }

  const encKey = deriveEncryptionKey(masterKey);
  const plaintext = decrypt(result.blob.envelope, encKey);
  return parseEnvFile(plaintext);
}

/**
 * Try to pull the file manifest from the server.
 * Returns null if no manifest exists (backward compat).
 */
export async function tryPullManifest(
  environment: string,
  masterKey: Buffer,
  api: ApiClient,
): Promise<ReadonlyArray<string> | null> {
  const manifestKey = buildManifestKey(environment);
  try {
    const entries = await pullEntriesFromServer(manifestKey, masterKey, api);
    return manifestEntriesToFiles(entries);
  } catch (error: unknown) {
    if (error instanceof BoltenvError && (error.code === 'NO_REMOTE_DATA' || error.code === 'DECRYPTION_FAILED')) {
      return null;
    }
    throw error;
  }
}

/**
 * Resolve the list of files for an environment.
 * Priority: config files → server manifest → fallback to ['.env']
 */
export async function resolveFileList(
  environment: string,
  masterKey: Buffer,
  api: ApiClient,
): Promise<ReadonlyArray<string>> {
  const config = loadProjectConfig();

  if (config?.files && config.files.length > 0) {
    return config.files;
  }

  const manifest = await tryPullManifest(environment, masterKey, api);
  if (manifest && manifest.length > 0) {
    return manifest;
  }

  // No config, no manifest — single .env mode (backward compat)
  return ['.env'];
}

/**
 * Pull ALL env files for an environment and return merged entries.
 * Used by dev/run commands to inject all vars into a child process.
 * Later files override earlier files if keys collide.
 */
export async function pullAllEntries(
  environment: string,
  masterKey: Buffer,
  api: ApiClient,
): Promise<{ entries: ReadonlyArray<EnvEntry>; files: ReadonlyArray<ResolvedFile> }> {
  const fileList = await resolveFileList(environment, masterKey, api);
  const allFiles: ResolvedFile[] = [];
  const mergedMap = new Map<string, string>();

  for (const filename of fileList) {
    const envKey = buildEnvKey(environment, filename);
    try {
      const entries = await pullEntriesFromServer(envKey, masterKey, api);
      allFiles.push({ filename, entries });
      for (const e of entries) {
        mergedMap.set(e.key, e.value);
      }
    } catch (error: unknown) {
      // Skip files that don't exist on server (e.g., manifest is stale)
      if (error instanceof BoltenvError && error.code === 'NO_REMOTE_DATA') {
        continue;
      }
      throw error;
    }
  }

  const entries: EnvEntry[] = [...mergedMap.entries()].map(([key, value]) => ({ key, value }));
  return { entries, files: allFiles };
}
