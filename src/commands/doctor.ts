import type { Command } from 'commander';
import pc from 'picocolors';
import { loadToken, checkRepoAccess } from '../core/auth.js';
import { detectRepo } from '../core/git.js';
import { loadRepoKey } from '../core/key-store.js';
import { keyFingerprint } from '../core/crypto.js';
import {
  API_BASE_URL,
  GITHUB_API_URL,
  ENCRYPTION_KEY_LENGTH,
  TOKEN_STALE_THRESHOLD_MS,
} from '../constants.js';
import { BoltenvError } from '../utils/errors.js';
import { classifyGitHubResponse } from '../core/github-error-classifier.js';
import { header } from '../utils/branding.js';

/**
 * `boltenv doctor` — diagnostic checklist for the common failure modes.
 *
 * Runs a series of independent checks, each classified as ok/warn/fail/skip,
 * and prints them as a single readable report. Each failing check returns
 * the exact next action so the user doesn't have to guess whether it's a
 * boltenv bug, their GitHub setup, or an org policy.
 */

type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

interface CheckResult {
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail?: string;
  readonly hint?: string;
}

interface CheckContext {
  readonly token?: string;
  readonly gitHubUser?: string;
  readonly repoFullName?: string;
  readonly tokenScopes?: string;
}

interface CheckOutcome {
  readonly ctx: CheckContext;
  readonly result: CheckResult;
}

type CheckFn = (ctx: CheckContext) => CheckOutcome | Promise<CheckOutcome>;

// Result + outcome constructors to cut wrapper boilerplate.
const ok = (label: string, detail?: string): CheckResult =>
  ({ label, status: 'ok', detail });
const warn = (label: string, detail: string, hint?: string): CheckResult =>
  ({ label, status: 'warn', detail, hint });
const fail = (label: string, detail: string, hint?: string): CheckResult =>
  ({ label, status: 'fail', detail, hint });
const skip = (label: string, detail: string): CheckResult =>
  ({ label, status: 'skip', detail });

const outcome = (ctx: CheckContext, result: CheckResult): CheckOutcome =>
  ({ ctx, result });

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case 'ok': return pc.green('✓');
    case 'warn': return pc.yellow('⚠');
    case 'fail': return pc.red('✗');
    case 'skip': return pc.dim('·');
  }
}

function renderCheck(result: CheckResult): void {
  const icon = statusIcon(result.status);
  const label = result.status === 'skip' ? pc.dim(result.label) : result.label;
  console.log(`  ${icon} ${label}`);
  if (result.detail) {
    console.log(`      ${pc.dim(result.detail)}`);
  }
  if (result.hint && (result.status === 'fail' || result.status === 'warn')) {
    for (const line of result.hint.split('\n')) {
      console.log(`      ${pc.dim('→')} ${pc.dim(line)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Individual checks — each takes the current CheckContext and returns a new
// context + its CheckResult. Checks never mutate the input context and never
// throw: failures are returned as fail/warn results.
// ---------------------------------------------------------------------------

function checkGitRemote(ctx: CheckContext): CheckOutcome {
  try {
    const repo = detectRepo();
    return outcome(
      { ...ctx, repoFullName: repo.fullName },
      ok('Git remote', repo.fullName),
    );
  } catch (error) {
    if (error instanceof BoltenvError) {
      return outcome(ctx, fail('Git remote', error.message, error.hint));
    }
    return outcome(
      ctx,
      fail(
        'Git remote',
        'Unknown error detecting repo.',
        'Make sure you are inside a git repository with a GitHub remote.',
      ),
    );
  }
}

function checkAuthToken(ctx: CheckContext): CheckOutcome {
  const envToken = process.env['BOLTENV_TOKEN'];
  if (envToken) {
    return outcome(
      { ...ctx, token: envToken },
      ok('GitHub token', 'BOLTENV_TOKEN env var (CI/service mode)'),
    );
  }

  try {
    const auth = loadToken();
    if (!auth) {
      return outcome(
        ctx,
        fail('GitHub token', 'Not logged in.', 'Run "boltenv login" or set BOLTENV_TOKEN.'),
      );
    }
    const nextCtx: CheckContext = {
      ...ctx,
      token: auth.accessToken,
      gitHubUser: auth.gitHubUser,
    };

    const age = Date.now() - new Date(auth.obtainedAt).getTime();
    if (age > TOKEN_STALE_THRESHOLD_MS) {
      const days = Math.floor(age / (24 * 60 * 60 * 1000));
      return outcome(
        nextCtx,
        warn(
          'GitHub token',
          `Loaded for ${auth.gitHubUser} (${days} days old)`,
          'Run "boltenv login --force" to refresh.',
        ),
      );
    }

    return outcome(nextCtx, ok('GitHub token', `Loaded for ${auth.gitHubUser}`));
  } catch (error) {
    if (error instanceof BoltenvError) {
      return outcome(ctx, fail('GitHub token', error.message, error.hint));
    }
    return outcome(
      ctx,
      fail(
        'GitHub token',
        'Could not read auth file.',
        'Check ~/.boltenv/auth.json permissions (should be 0600).',
      ),
    );
  }
}

async function checkGitHubApi(ctx: CheckContext): Promise<CheckOutcome> {
  if (!ctx.token) {
    return outcome(ctx, skip('GitHub API', 'no token'));
  }
  try {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const classified = classifyGitHubResponse(response, ctx.repoFullName);
      if (classified) {
        return outcome(ctx, fail('GitHub API', classified.message, classified.hint));
      }
      return outcome(
        ctx,
        fail('GitHub API', `HTTP ${response.status} ${response.statusText}`),
      );
    }

    const data = (await response.json()) as { login?: string };
    const tokenScopes = response.headers.get('x-oauth-scopes') ?? '';
    const nextCtx: CheckContext = {
      ...ctx,
      tokenScopes,
      ...(data.login !== undefined ? { gitHubUser: data.login } : {}),
    };

    const scopeDetail = tokenScopes ? `scopes: ${tokenScopes}` : 'scopes: (none reported)';
    return outcome(
      nextCtx,
      ok('GitHub API', `${data.login ?? 'user'} — ${scopeDetail}`),
    );
  } catch {
    return outcome(
      ctx,
      fail(
        'GitHub API',
        'Could not reach api.github.com',
        'Check your network connection and DNS.',
      ),
    );
  }
}

function checkTokenScope(ctx: CheckContext): CheckOutcome {
  if (!ctx.token) {
    return outcome(ctx, skip('Token scope', 'no token'));
  }
  if (ctx.tokenScopes === undefined) {
    return outcome(ctx, skip('Token scope', 'scopes unknown'));
  }
  // `repo` scope is our minimum. `repo:*` sub-scopes don't count here —
  // GitHub's Device Flow only issues coarse scopes anyway.
  const scopes = ctx.tokenScopes.split(',').map((s) => s.trim());
  if (scopes.includes('repo')) {
    return outcome(ctx, ok('Token scope', 'repo scope present'));
  }
  return outcome(
    ctx,
    fail(
      'Token scope',
      `missing "repo" scope (has: ${ctx.tokenScopes || 'none'})`,
      'Run "boltenv login" to get a token with repo scope.',
    ),
  );
}

async function checkRepoAccessLevel(ctx: CheckContext): Promise<CheckOutcome> {
  if (!ctx.token || !ctx.repoFullName) {
    return outcome(ctx, skip('Repo access', 'prerequisites failed'));
  }
  try {
    const level = await checkRepoAccess(ctx.token, ctx.repoFullName);
    if (level === 'write') {
      return outcome(ctx, ok('Repo access', `write access to ${ctx.repoFullName}`));
    }
    if (level === 'read') {
      return outcome(
        ctx,
        fail(
          'Repo access',
          `read-only on ${ctx.repoFullName}`,
          'boltenv push requires write access. Ask the repo owner to grant push permission.',
        ),
      );
    }
    return outcome(
      ctx,
      fail(
        'Repo access',
        `no access to ${ctx.repoFullName}`,
        'The repo may not exist, or you may not be a collaborator. See "boltenv doctor" output above.',
      ),
    );
  } catch (error) {
    if (error instanceof BoltenvError) {
      return outcome(ctx, fail('Repo access', error.message, error.hint));
    }
    return outcome(ctx, fail('Repo access', 'Error checking repo access.'));
  }
}

function checkEncryptionKey(ctx: CheckContext): CheckOutcome {
  if (!ctx.repoFullName) {
    return outcome(ctx, skip('Encryption key', 'no repo detected'));
  }
  try {
    const key = loadRepoKey(ctx.repoFullName);
    if (!key) {
      return outcome(
        ctx,
        fail(
          'Encryption key',
          `no key found for ${ctx.repoFullName}`,
          'Either:\n'
            + '  • Ask a teammate to run "boltenv key export" and import it with "boltenv key import"\n'
            + '  • Run "boltenv push" to generate a new key (if you are the first on this repo)\n'
            + '  • Set BOLTENV_KEY for CI/CD',
        ),
      );
    }
    if (key.length !== ENCRYPTION_KEY_LENGTH) {
      return outcome(
        ctx,
        fail(
          'Encryption key',
          `key has wrong length (${key.length}, expected ${ENCRYPTION_KEY_LENGTH})`,
          'Re-import the key with "boltenv key import".',
        ),
      );
    }
    const fingerprint = keyFingerprint(key);
    return outcome(
      ctx,
      ok('Encryption key', `${ENCRYPTION_KEY_LENGTH}-byte key (fp: ${fingerprint})`),
    );
  } catch {
    return outcome(
      ctx,
      fail(
        'Encryption key',
        'Could not read key file.',
        'Check permissions on ~/.boltenv/keys/',
      ),
    );
  }
}

async function checkBoltenvApi(ctx: CheckContext): Promise<CheckOutcome> {
  try {
    const start = Date.now();
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const elapsed = Date.now() - start;
    if (response.ok) {
      return outcome(ctx, ok('boltenv API', `${API_BASE_URL} (${elapsed}ms)`));
    }
    return outcome(
      ctx,
      warn(
        'boltenv API',
        `${API_BASE_URL} returned HTTP ${response.status}`,
        'The boltenv service may be degraded. Try again in a few minutes.',
      ),
    );
  } catch {
    return outcome(
      ctx,
      warn(
        'boltenv API',
        `${API_BASE_URL} unreachable`,
        'Check your network connection or BOLTENV_API_URL override.',
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function summary(results: readonly CheckResult[]): string {
  const ok = results.filter((r) => r.status === 'ok').length;
  const warn = results.filter((r) => r.status === 'warn').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const parts: string[] = [];
  if (ok) parts.push(pc.green(`${ok} ok`));
  if (warn) parts.push(pc.yellow(`${warn} warn`));
  if (fail) parts.push(pc.red(`${fail} fail`));
  return parts.join('  ');
}

function nextAction(results: readonly CheckResult[]): string | null {
  const firstFail = results.find((r) => r.status === 'fail');
  if (firstFail?.hint) {
    const firstLine = firstFail.hint.split('\n')[0]?.trim() ?? '';
    return `${firstFail.label} — ${firstLine}`;
  }
  return null;
}

// Ordered sequence of checks. Most later checks depend on data gathered by
// earlier ones (token → API → scopes → repo access), so they must run in
// order. Each check returns a new context, never mutates.
const CHECKS: readonly CheckFn[] = [
  checkGitRemote,
  checkAuthToken,
  checkGitHubApi,
  checkTokenScope,
  checkRepoAccessLevel,
  checkEncryptionKey,
  checkBoltenvApi,
];

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose common setup and auth issues')
    .action(async () => {
      console.log('');
      console.log(header('boltenv doctor'));
      console.log('');

      const results: CheckResult[] = [];
      let ctx: CheckContext = {};

      for (const check of CHECKS) {
        const outcome = await check(ctx);
        ctx = outcome.ctx;
        results.push(outcome.result);
        renderCheck(outcome.result);
      }

      console.log('');
      console.log(`  ${pc.dim('Summary:')} ${summary(results)}`);

      const next = nextAction(results);
      if (next) {
        console.log(`  ${pc.dim('Next:')}    ${next}`);
      } else {
        console.log(`  ${pc.dim('Next:')}    ${pc.green('everything looks good')}`);
      }
      console.log('');

      if (results.some((r) => r.status === 'fail')) {
        process.exitCode = 1;
      }
    });
}
