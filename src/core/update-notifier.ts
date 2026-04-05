import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import pc from 'picocolors';
import { AUTH_DIR_NAME, API_BASE_URL } from '../constants.js';

const CHECK_FILE_NAME = 'update-check.json';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_TIMEOUT_MS = 3_000; // 3 seconds — must be fast

interface UpdateCheckCache {
  readonly latestVersion: string;
  readonly checkedAt: number; // Unix ms
}

/**
 * Get the path to the update check cache file.
 */
function getCacheFilePath(): string {
  return path.join(os.homedir(), AUTH_DIR_NAME, CHECK_FILE_NAME);
}

/**
 * Read the cached update check result.
 */
function readCache(): UpdateCheckCache | null {
  try {
    const raw = fs.readFileSync(getCacheFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as UpdateCheckCache;
    if (parsed.latestVersion && typeof parsed.checkedAt === 'number') {
      return parsed;
    }
  } catch {
    // No cache or invalid
  }
  return null;
}

/**
 * Write the update check result to cache.
 */
function writeCache(cache: UpdateCheckCache): void {
  const dir = path.join(os.homedir(), AUTH_DIR_NAME);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(getCacheFilePath(), JSON.stringify(cache), 'utf8');
  } catch {
    // Non-critical — silently ignore cache write failures
  }
}

/**
 * Compare two semver version strings.
 * Returns true if `latest` is newer than `current`.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const parseSemver = (v: string): readonly number[] =>
    v.replace(/^v/, '').split('.').map(Number);

  const cur = parseSemver(current);
  const lat = parseSemver(latest);

  for (let i = 0; i < 3; i++) {
    const c = cur[i] ?? 0;
    const l = lat[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

/**
 * Fetch the latest version from the boltenv API.
 * Returns null if the check fails (network error, timeout, etc.).
 */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/version`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { latest: string };
    return data.latest ?? null;
  } catch {
    return null;
  }
}

/**
 * Check for updates in the background.
 * Returns a function that, when called after the command finishes,
 * prints an update alert if a newer version is available.
 *
 * The check is non-blocking and cached for 24 hours.
 */
export function checkForUpdates(currentVersion: string): () => void {
  // Start the check immediately (non-blocking)
  const resultPromise = performCheck(currentVersion);

  // Return a function to be called after the command finishes
  return () => {
    resultPromise.then((latestVersion) => {
      if (latestVersion && isNewerVersion(currentVersion, latestVersion)) {
        printUpdateAlert(currentVersion, latestVersion);
      }
    }).catch(() => {
      // Silently ignore — update check should never break the CLI
    });
  };
}

/**
 * Perform the update check. Uses cache if fresh, otherwise fetches from API.
 */
async function performCheck(_currentVersion: string): Promise<string | null> {
  // Check cache first
  const cached = readCache();
  if (cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) {
    return cached.latestVersion;
  }

  // Fetch from API
  const latest = await fetchLatestVersion();
  if (latest) {
    writeCache({ latestVersion: latest, checkedAt: Date.now() });
  }
  return latest;
}

/**
 * Print the update alert to stderr (so it doesn't pollute stdout pipes).
 */
function printUpdateAlert(current: string, latest: string): void {
  const cmd = pc.cyan('npm i -g @boltenv.dev/cli');
  const border = pc.yellow('│');
  console.error('');
  console.error(`  ${pc.yellow('┌─────────────────────────────────────────────┐')}`);
  console.error(`  ${border}                                               ${border}`);
  console.error(`  ${border}   Update available: ${pc.dim(current)} → ${pc.green(pc.bold(latest))}          ${border}`);
  console.error(`  ${border}   Run ${cmd} to update   ${border}`);
  console.error(`  ${border}                                               ${border}`);
  console.error(`  ${pc.yellow('└─────────────────────────────────────────────┘')}`);
  console.error('');
}
