import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { GitRepo } from '../types/index.js';
import { BRANCH_ENV_MAP, DEFAULT_ENVIRONMENT } from '../constants.js';
import { Errors } from '../utils/errors.js';

// All patterns that can point to a GitHub repo:
//
// HTTPS:
//   https://github.com/owner/repo.git
//   https://github.com/owner/repo
//   http://github.com/owner/repo.git
//   https://user@github.com/owner/repo.git          (authenticated clone)
//   https://oauth2:TOKEN@github.com/owner/repo.git  (CI token auth)
//   https://x-access-token:TOKEN@github.com/...     (GitHub App auth)
//
// SSH (standard):
//   git@github.com:owner/repo.git
//   git@github.com:owner/repo
//
// SSH (alias — ~/.ssh/config Host can be ANYTHING):
//   git@github.com-personal:owner/repo.git
//   git@gh-work:owner/repo.git
//   git@my-github:owner/repo.git
//   git@company-gh:owner/repo.git
//
// SSH protocol:
//   ssh://git@github.com/owner/repo.git
//   ssh://git@github.com:22/owner/repo.git           (with port)
//   ssh://git@gh-work/owner/repo.git                  (alias)
//   ssh://git@gh-work:2222/owner/repo.git             (alias + port)
//
// Git protocol:
//   git://github.com/owner/repo.git

// HTTPS — github.com with optional credentials before @
const HTTPS_PATTERN = /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/;

// SSH shorthand — git@<any-host>:owner/repo (host can be any SSH alias)
const SSH_SCP_PATTERN = /^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/;

// SSH protocol — ssh://git@<host>[:port]/owner/repo
const SSH_PROTOCOL_PATTERN = /^ssh:\/\/git@[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/;

// Git protocol — git://<host>/owner/repo
const GIT_PROTOCOL_PATTERN = /^git:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/;

const OWNER_REPO_PATTERNS = [
  HTTPS_PATTERN,
  SSH_SCP_PATTERN,
  SSH_PROTOCOL_PATTERN,
  GIT_PROTOCOL_PATTERN,
];

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
 * Parse a GitHub URL (HTTPS, SSH, git protocol) into owner/repo.
 * Accepts any SSH host alias since developers configure custom hosts in ~/.ssh/config.
 */
export function parseGitHubUrl(url: string): GitRepo {
  for (const pattern of OWNER_REPO_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      const owner = match[1]!;
      const repo = match[2]!;
      return { owner, repo, fullName: `${owner}/${repo}` };
    }
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
