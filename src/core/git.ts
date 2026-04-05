import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GitRepo } from '../types/index.js';
import { BRANCH_ENV_MAP, DEFAULT_ENVIRONMENT } from '../constants.js';
import { Errors } from '../utils/errors.js';

const HTTPS_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;
const SSH_PATTERN = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

/**
 * Detect the GitHub repository from the current working directory.
 * Tries `git remote get-url origin` first, then falls back to parsing .git/config.
 */
export function detectRepo(cwd: string = process.cwd()): GitRepo {
  const remoteUrl = getRemoteUrl(cwd);
  if (!remoteUrl) {
    throw Errors.gitRemoteNotFound();
  }
  return parseGitHubUrl(remoteUrl);
}

/**
 * Get the remote URL for "origin" via git CLI or .git/config fallback.
 */
function getRemoteUrl(cwd: string): string | null {
  // Try git CLI first (fast, reliable)
  try {
    const url = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (url) return url;
  } catch {
    // git not available or not a repo — try fallback
  }

  // Fallback: parse .git/config
  return parseGitConfig(cwd);
}

/**
 * Parse .git/config to extract the origin remote URL.
 */
function parseGitConfig(cwd: string): string | null {
  const gitConfigPath = path.join(cwd, '.git', 'config');
  try {
    const content = fs.readFileSync(gitConfigPath, 'utf8');
    const lines = content.split('\n');
    let inOriginRemote = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === '[remote "origin"]') {
        inOriginRemote = true;
        continue;
      }
      if (line.startsWith('[')) {
        inOriginRemote = false;
        continue;
      }
      if (inOriginRemote && line.startsWith('url = ')) {
        return line.slice(6).trim();
      }
    }
  } catch {
    // .git/config not found
  }
  return null;
}

/**
 * Parse a GitHub URL (HTTPS or SSH) into owner/repo.
 */
export function parseGitHubUrl(url: string): GitRepo {
  const httpsMatch = url.match(HTTPS_PATTERN);
  if (httpsMatch) {
    const owner = httpsMatch[1]!;
    const repo = httpsMatch[2]!;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  const sshMatch = url.match(SSH_PATTERN);
  if (sshMatch) {
    const owner = sshMatch[1]!;
    const repo = sshMatch[2]!;
    return { owner, repo, fullName: `${owner}/${repo}` };
  }

  throw Errors.gitRemoteParseError(url);
}

/**
 * Detect the current git branch name.
 * Tries `git rev-parse --abbrev-ref HEAD` first, then falls back to parsing .git/HEAD.
 */
export function detectBranch(cwd: string = process.cwd()): string {
  // Try git CLI first
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (branch && branch !== 'HEAD') return branch;
  } catch {
    // git not available — try fallback
  }

  // Fallback: parse .git/HEAD
  const headPath = path.join(cwd, '.git', 'HEAD');
  try {
    const content = fs.readFileSync(headPath, 'utf8').trim();
    const refPrefix = 'ref: refs/heads/';
    if (content.startsWith(refPrefix)) {
      return content.slice(refPrefix.length);
    }
  } catch {
    // .git/HEAD not found
  }

  throw Errors.branchDetectionFailed();
}

/**
 * Map a git branch name to an environment name.
 * Uses custom mapping first (from .boltenv.yaml), then built-in defaults, then 'development'.
 */
export function branchToEnvironment(
  branch: string,
  customMapping?: Readonly<Record<string, string>>,
): string {
  // Custom mapping takes priority
  if (customMapping) {
    const customMatch = customMapping[branch];
    if (customMatch) return customMatch;

    // Try prefix matching for patterns like "release/*" → "staging"
    for (const [pattern, env] of Object.entries(customMapping)) {
      if (pattern.endsWith('/*') && branch.startsWith(pattern.slice(0, -1))) {
        return env;
      }
    }
  }

  return BRANCH_ENV_MAP[branch] ?? DEFAULT_ENVIRONMENT;
}
