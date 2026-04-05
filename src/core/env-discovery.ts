import fs from 'node:fs';
import path from 'node:path';
import { parseEnvFile } from './env-file.js';
import { EXCLUDED_ENV_SUFFIXES } from '../constants.js';

/** A discovered env file on disk */
export interface DiscoveredEnvFile {
  readonly filename: string;
  readonly absolutePath: string;
  readonly varCount: number;
  readonly sizeBytes: number;
  readonly category: 'secret' | 'template';
}

/**
 * Scan a directory for env-like files and classify them.
 *
 * Patterns matched:
 *   .env              classic default
 *   .env.*            .env.local, .env.backend, .env.production
 *   *.env             backend.env, frontend.env
 *
 * Each file is classified as:
 *   secret   — likely contains real secrets (push/pull candidate)
 *   template — example/template/sample file (skip by default, warn user)
 */
export function discoverEnvFiles(cwd: string = process.cwd()): ReadonlyArray<DiscoveredEnvFile> {
  const MAX_SIZE = 1024 * 1024;
  let dirEntries: fs.Dirent[];

  try {
    dirEntries = fs.readdirSync(cwd, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: DiscoveredEnvFile[] = [];

  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    if (!looksLikeEnvFile(entry.name)) continue;

    const abs = path.join(cwd, entry.name);
    try {
      const stat = fs.statSync(abs);
      if (stat.size > MAX_SIZE || stat.size === 0) continue;

      const content = fs.readFileSync(abs, 'utf8');
      const parsed = parseEnvFile(content);

      results.push({
        filename: entry.name,
        absolutePath: abs,
        varCount: parsed.length,
        sizeBytes: stat.size,
        category: classifyEnvFile(entry.name),
      });
    } catch {
      // Skip unreadable files
    }
  }

  // .env first, secrets before templates, then alphabetical
  return results.sort((a, b) => {
    if (a.filename === '.env') return -1;
    if (b.filename === '.env') return 1;
    if (a.category !== b.category) return a.category === 'secret' ? -1 : 1;
    return a.filename.localeCompare(b.filename);
  });
}

/**
 * Check if a filename looks like an env file.
 */
function looksLikeEnvFile(name: string): boolean {
  if (name === '.env') return true;
  if (name.startsWith('.env.')) return true;
  if (name.endsWith('.env') && name.length > 4) return true;
  return false;
}

/** Words that mark a file as a template/example rather than real secrets */
const TEMPLATE_WORDS = ['example', 'sample', 'template', 'defaults', 'dist'];

/**
 * Classify an env file as secret or template.
 *
 * Template patterns:
 *   .env.example, .env.sample, .env.template, .env.defaults, .env.dist
 *   .env.backend.example, .env.backend.template, etc.
 *   example.env, sample.env, template.env
 */
function classifyEnvFile(name: string): 'secret' | 'template' {
  const lower = name.toLowerCase();

  // Check suffix-based patterns: .env.example, .env.backend.template
  for (const suffix of EXCLUDED_ENV_SUFFIXES) {
    if (lower.includes(suffix)) return 'template';
  }

  // Check prefix-based patterns: example.env, sample.env
  for (const word of TEMPLATE_WORDS) {
    if (lower.startsWith(`${word}.`)) return 'template';
  }

  return 'secret';
}

/**
 * Filter to only secret files (the ones worth pushing/pulling).
 */
export function secretFiles(files: ReadonlyArray<DiscoveredEnvFile>): ReadonlyArray<DiscoveredEnvFile> {
  return files.filter((f) => f.category === 'secret');
}

/**
 * Filter to only template files.
 */
export function templateFiles(files: ReadonlyArray<DiscoveredEnvFile>): ReadonlyArray<DiscoveredEnvFile> {
  return files.filter((f) => f.category === 'template');
}
