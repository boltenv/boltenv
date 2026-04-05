import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AUTH_DIR_NAME, ENCRYPTION_KEY_LENGTH } from '../constants.js';
import { BoltenvError } from '../utils/errors.js';

const KEYS_DIR = 'keys';

/**
 * Get the path to the key file for a repo.
 * ~/.boltenv/keys/{owner}/{repo}.key
 */
function getKeyPath(repoFullName: string): string {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) {
    throw new BoltenvError(
      `Invalid repo name: "${repoFullName}"`,
      'INVALID_REPO_FORMAT',
    );
  }
  return path.join(os.homedir(), AUTH_DIR_NAME, KEYS_DIR, owner, `${repo}.key`);
}

/**
 * Load the master key for a repo.
 *
 * Priority:
 *   1. BOLTENV_KEY env var (base64 — for CI/CD and production VPS)
 *   2. ~/.boltenv/keys/{owner}/{repo}.key file
 *
 * Returns null if no key exists anywhere.
 */
export function loadRepoKey(repoFullName: string): Buffer | null {
  // 1. BOLTENV_KEY env var — non-interactive key provisioning
  const envKey = process.env['BOLTENV_KEY'];
  if (envKey) {
    const key = Buffer.from(envKey, 'base64');
    if (key.length === ENCRYPTION_KEY_LENGTH) {
      return key;
    }
    // Wrong length — fall through to file-based lookup
  }

  // 2. File-based key
  const keyPath = getKeyPath(repoFullName);
  try {
    const raw = fs.readFileSync(keyPath);
    if (raw.length !== ENCRYPTION_KEY_LENGTH) {
      return null;
    }
    return raw;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw new BoltenvError(
      `Failed to read key file: ${keyPath}`,
      'KEY_READ_ERROR',
      'Check file permissions on ~/.boltenv/keys/',
    );
  }
}

/**
 * Save a master key for a repo to the local key store.
 * Creates directories with 0o700 and the key file with 0o600.
 */
export function saveRepoKey(repoFullName: string, key: Buffer): void {
  const keyPath = getKeyPath(repoFullName);
  const keyDir = path.dirname(keyPath);

  fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  // Enforce directory permissions even if it already existed
  fs.chmodSync(keyDir, 0o700);
  fs.chmodSync(path.dirname(keyDir), 0o700);

  fs.writeFileSync(keyPath, key, { mode: 0o600 });
}

/**
 * Check if a repo key exists locally.
 */
export function hasRepoKey(repoFullName: string): boolean {
  const keyPath = getKeyPath(repoFullName);
  try {
    const stat = fs.statSync(keyPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Export a repo key as base64 (for sharing with teammates via secure channel).
 */
export function exportRepoKey(repoFullName: string): string {
  const key = loadRepoKey(repoFullName);
  if (!key) {
    throw new BoltenvError(
      `No key found for "${repoFullName}".`,
      'KEY_NOT_FOUND',
      'Run "boltenv push" first to generate a key, or import one from a teammate.',
    );
  }
  return key.toString('base64');
}

/**
 * Import a repo key from base64 (received from a teammate).
 */
export function importRepoKey(repoFullName: string, base64Key: string): void {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== ENCRYPTION_KEY_LENGTH) {
    throw new BoltenvError(
      'Invalid key: wrong length.',
      'INVALID_KEY_LENGTH',
      `Expected ${ENCRYPTION_KEY_LENGTH} bytes, got ${key.length}.`,
    );
  }
  saveRepoKey(repoFullName, key);
}
