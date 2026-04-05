import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILENAMES } from '../constants.js';
import { BoltenvConfigSchema } from '../utils/validators.js';
import type { BoltenvConfig } from '../types/index.js';

/**
 * Load and validate .boltenv.yaml from the project root.
 * Searches upward from cwd to find the nearest config file.
 * Returns null if no config file is found.
 */
export function loadProjectConfig(cwd: string = process.cwd()): BoltenvConfig | null {
  const configPath = findConfigFile(cwd);
  if (!configPath) return null;

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed: unknown = parseYaml(raw);
    const result = BoltenvConfigSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`  Warning: Invalid config in ${path.basename(configPath)} — using defaults.`);
      return null;
    }
    return result.data;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'unknown';
    console.error(`  Warning: Failed to parse ${path.basename(configPath)}: ${detail} — using defaults.`);
    return null;
  }
}

/**
 * Search for a config file starting from cwd, walking up to the git root
 * (or filesystem root if not in a git repo).
 */
function findConfigFile(cwd: string): string | null {
  let dir = path.resolve(cwd);
  const fsRoot = path.parse(dir).root;

  while (dir !== fsRoot) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = path.join(dir, filename);
      if (fs.existsSync(candidate)) return candidate;
    }

    // Stop at git root to avoid picking up configs from unrelated parent dirs
    if (fs.existsSync(path.join(dir, '.git'))) break;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
