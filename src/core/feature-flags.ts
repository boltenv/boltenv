import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AUTH_DIR_NAME, API_BASE_URL } from '../constants.js';

const FLAGS_CACHE_FILE = 'flags.json';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 3_000;

interface FlagsCache {
  readonly flags: Record<string, boolean>;
  readonly fetchedAt: number;
}

function getCachePath(): string {
  return path.join(os.homedir(), AUTH_DIR_NAME, FLAGS_CACHE_FILE);
}

function readCache(): FlagsCache | null {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as FlagsCache;
    if (parsed.flags && typeof parsed.fetchedAt === 'number') {
      return parsed;
    }
  } catch {
    // No cache or invalid
  }
  return null;
}

function writeCache(cache: FlagsCache): void {
  try {
    const dir = path.join(os.homedir(), AUTH_DIR_NAME);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(getCachePath(), JSON.stringify(cache), 'utf8');
  } catch {
    // Non-critical
  }
}

async function fetchFlags(): Promise<Record<string, boolean> | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/flags`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { flags: Record<string, boolean> };
    return data.flags ?? null;
  } catch {
    return null;
  }
}

/**
 * Get feature flags. Uses local cache (5 min TTL), falls back to defaults if offline.
 * Never blocks or throws -- returns defaults on any failure.
 */
export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  // Check cache first
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.flags;
  }

  // Fetch from API
  const flags = await fetchFlags();
  if (flags) {
    writeCache({ flags, fetchedAt: Date.now() });
    return flags;
  }

  // Return cached (even if stale) or defaults
  if (cached) return cached.flags;

  return {
    push: true,
    pull: true,
    dev: false,
    run: false,
    search: false,
    teams: false,
    multi_file: false,
    ttl: false,
    upgrade: false,
    maintenance: false,
  };
}

/**
 * Check if a specific feature is enabled. Returns true if enabled or if flags can't be fetched.
 */
export async function isFeatureEnabled(feature: string): Promise<boolean> {
  const flags = await getFeatureFlags();

  // Maintenance mode overrides everything
  if (flags['maintenance']) {
    return false;
  }

  return flags[feature] ?? true;
}
