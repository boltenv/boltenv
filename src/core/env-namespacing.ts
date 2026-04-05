import path from 'node:path';
import { ENV_FILE_SEPARATOR, MANIFEST_ENV_KEY } from '../constants.js';
import { BoltenvError } from '../utils/errors.js';
import type { EnvEntry } from '../types/index.js';

/**
 * Strict allowlist for filenames that can appear in manifests or config.
 * Only allows: alphanumeric, dots, hyphens, underscores. Max 128 chars.
 * No slashes, no spaces, no shell metacharacters.
 */
const SAFE_FILENAME = /^[a-zA-Z0-9._-]{1,128}$/;

/**
 * Validate that a filename is safe for filesystem operations.
 * Rejects path traversal, absolute paths, and non-env-looking names.
 * Throws on any violation — never silently accepts a bad name.
 */
export function assertSafeFilename(filename: string): void {
  // Must match strict character allowlist
  if (!SAFE_FILENAME.test(filename)) {
    throw new BoltenvError(
      `Unsafe filename rejected: "${filename}"`,
      'UNSAFE_FILENAME',
      'Filenames must only contain letters, numbers, dots, hyphens, and underscores (max 128 chars).',
    );
  }

  // Must not resolve to a path outside cwd
  const normalized = path.normalize(filename);
  if (path.isAbsolute(normalized) || normalized.startsWith('..')) {
    throw new BoltenvError(
      `Path traversal rejected: "${filename}"`,
      'PATH_TRAVERSAL',
      'Filenames must not contain path separators or ".." sequences.',
    );
  }

  // Must look like an actual env file (defense-in-depth)
  const lower = filename.toLowerCase();
  const looksLikeEnv = lower === '.env'
    || lower.startsWith('.env.')
    || lower.endsWith('.env');
  if (!looksLikeEnv) {
    throw new BoltenvError(
      `Not an env file: "${filename}"`,
      'NOT_ENV_FILE',
      'Expected a filename like .env, .env.backend, or backend.env.',
    );
  }
}

/**
 * Build the server-side environment key for a file.
 *
 * .env (the default) → plain environment name (backward compat)
 * Anything else      → "development::.env.backend"
 */
export function buildEnvKey(environment: string, filename: string): string {
  assertSafeFilename(filename);
  if (filename === '.env') return environment;
  return `${environment}${ENV_FILE_SEPARATOR}${filename}`;
}

/**
 * Build the manifest key for an environment.
 * Manifest stores the list of files that were pushed.
 */
export function buildManifestKey(environment: string): string {
  return `${environment}${ENV_FILE_SEPARATOR}${MANIFEST_ENV_KEY}`;
}

/**
 * Convert a list of filenames into env entries for manifest storage.
 * Validates every filename before accepting it.
 */
export function filesToManifestEntries(filenames: ReadonlyArray<string>): ReadonlyArray<EnvEntry> {
  for (const f of filenames) {
    assertSafeFilename(f);
  }
  return filenames.map((f, i) => ({ key: `FILE_${i}`, value: f }));
}

/**
 * Extract filenames from manifest entries.
 * Validates every filename — rejects path traversal, non-env names, etc.
 */
export function manifestEntriesToFiles(entries: ReadonlyArray<EnvEntry>): ReadonlyArray<string> {
  return entries
    .filter((e) => e.key.startsWith('FILE_'))
    .sort((a, b) => {
      const numA = parseInt(a.key.slice(5), 10);
      const numB = parseInt(b.key.slice(5), 10);
      return numA - numB;
    })
    .map((e) => {
      assertSafeFilename(e.value);
      return e.value;
    });
}
