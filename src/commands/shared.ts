import os from 'node:os';
import type { CommandContext, GitRepo } from '../types/index.js';
import { requireAuth, checkRepoAccess } from '../core/auth.js';
import { detectRepo, detectBranch, branchToEnvironment } from '../core/git.js';
import { loadProjectConfig } from '../core/config.js';
import { API_BASE_URL, DEFAULT_ENVIRONMENT } from '../constants.js';
import { Errors } from '../utils/errors.js';

export interface CommandOptions {
  readonly env?: string;
  readonly repo?: string;
}

/**
 * Resolve the target repo from multiple sources.
 * Priority: -r flag > BOLTENV_REPO env var > .boltenv.yaml repo > git detection
 */
function resolveRepo(repoOverride?: string, configRepo?: string): GitRepo {
  // 1. Explicit -r flag
  if (repoOverride) {
    return parseRepoString(repoOverride);
  }

  // 2. BOLTENV_REPO env var (useful in CI/CD without .git)
  const envRepo = process.env['BOLTENV_REPO'];
  if (envRepo) {
    return parseRepoString(envRepo);
  }

  // 3. .boltenv.yaml repo field
  if (configRepo) {
    return parseRepoString(configRepo);
  }

  // 4. Git detection (requires .git directory)
  return detectRepo();
}

function parseRepoString(repoStr: string): GitRepo {
  const parts = repoStr.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw Errors.invalidRepoFormat(repoStr);
  }
  return { owner: parts[0], repo: parts[1], fullName: repoStr };
}

/**
 * Build the resolved command context from auth, git, and options.
 *
 * Repo priority:   -r flag > BOLTENV_REPO env > .boltenv.yaml repo > git detection
 * Env priority:    -e flag > .boltenv.yaml defaultEnvironment > branch detection > 'development'
 */
export function loadCommandContext(envOverride?: string, repoOverride?: string): CommandContext {
  const auth = requireAuth();
  const config = loadProjectConfig();
  const repo = resolveRepo(repoOverride, config?.repo);

  let environment: string;
  if (envOverride) {
    environment = envOverride;
  } else if (config?.defaultEnvironment) {
    environment = config.defaultEnvironment;
  } else {
    // Auto-detect from branch (gracefully falls back if no .git)
    try {
      const branch = detectBranch();
      environment = branchToEnvironment(branch, config?.branchEnvironments);
    } catch {
      environment = DEFAULT_ENVIRONMENT;
      console.error(`  Warning: Could not detect git branch — defaulting to "${DEFAULT_ENVIRONMENT}".`);
      console.error(`  Use -e <environment> to specify explicitly.`);
    }
  }

  const apiBaseUrl = API_BASE_URL;

  return { auth, repo, environment, apiBaseUrl };
}

/**
 * Verify the user has write (push) access to the repo on GitHub.
 * Required for: push
 */
export async function requireWriteAccess(ctx: CommandContext): Promise<void> {
  const level = await checkRepoAccess(ctx.auth.accessToken, ctx.repo.fullName);

  if (level === 'none') {
    throw Errors.repoAccessDenied(ctx.repo.fullName);
  }

  if (level === 'read') {
    throw Errors.repoReadOnly(ctx.repo.fullName);
  }
}

/**
 * Verify the user has at least collaborator (read or write) access to the repo.
 * Required for: pull, dev, run, ls
 * This requires write access (collaborator status) to prevent the public repo loophole.
 * Read-only public repo viewers are blocked — they must be added as collaborators
 * or via boltenv team membership.
 */
export async function requireRepoAccess(ctx: CommandContext): Promise<void> {
  const level = await checkRepoAccess(ctx.auth.accessToken, ctx.repo.fullName);

  if (level === 'none') {
    throw Errors.repoAccessDenied(ctx.repo.fullName);
  }

  if (level === 'read') {
    throw Errors.repoReadOnly(ctx.repo.fullName);
  }
}

/**
 * Get a human-readable actor name for audit metadata.
 * Handles containerized environments where os.userInfo() may throw.
 */
export function getActorName(): string {
  let user: string;
  try {
    user = os.userInfo().username;
  } catch {
    user = process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown';
  }
  const host = os.hostname();
  return `${user}@${host}`;
}
