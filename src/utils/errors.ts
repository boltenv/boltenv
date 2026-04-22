export class BoltenvError extends Error {
  readonly code: string;
  readonly hint?: string;

  constructor(message: string, code: string, hint?: string) {
    super(message);
    this.name = 'BoltenvError';
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Strip credentials from URLs before including them in error messages.
 * https://user:pass@github.com/... → https://***@github.com/...
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '';
      return parsed.toString();
    }
  } catch {
    // Not a parseable URL — strip anything between :// and @
    return url.replace(/:\/\/[^@]+@/, '://***@');
  }
  return url;
}

/**
 * Strip ANSI escape sequences from server-provided strings.
 */
export function sanitizeForTerminal(input: string): string {
  return input.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').substring(0, 500);
}

/**
 * Build a human-readable rate-limit hint from GitHub's `x-ratelimit-*` headers.
 */
function buildRateLimitHint(
  remaining: string | null,
  resetEpoch: string | null,
): string {
  const fallback = 'Wait a few minutes and try again.';
  if (!resetEpoch) return fallback;
  const resetMs = Number(resetEpoch) * 1000;
  if (!Number.isFinite(resetMs)) return fallback;
  const waitSec = Math.max(0, Math.ceil((resetMs - Date.now()) / 1000));
  if (waitSec === 0) return fallback;
  const mins = Math.ceil(waitSec / 60);
  const remainingLabel = remaining !== null ? `${remaining} remaining` : '0 remaining';
  return `Rate limit resets in ~${mins} minute${mins === 1 ? '' : 's'} (${remainingLabel}).`;
}

export const Errors = {
  notAuthenticated: () =>
    new BoltenvError(
      'Not logged in.',
      'NOT_AUTHENTICATED',
      'Either:\n'
        + '  • Run "boltenv login" for interactive auth\n'
        + '  • Set BOLTENV_TOKEN env var for CI/CD and servers',
    ),

  gitRepoNotFound: () =>
    new BoltenvError(
      'Not inside a Git repository.',
      'GIT_REPO_NOT_FOUND',
      'Run this command from inside a Git repository with a GitHub remote.',
    ),

  gitRemoteNotFound: () =>
    new BoltenvError(
      'No GitHub remote found.',
      'GIT_REMOTE_NOT_FOUND',
      'Either:\n'
        + '  • Run from inside a git repo with a GitHub remote\n'
        + '  • Use -r owner/repo flag\n'
        + '  • Set BOLTENV_REPO=owner/repo env var\n'
        + '  • Add "repo: owner/repo" to .boltenv.yaml',
    ),

  gitRemoteParseError: (url: string) =>
    new BoltenvError(
      `Cannot parse GitHub remote URL: ${sanitizeUrl(url)}`,
      'GIT_REMOTE_PARSE_ERROR',
      'Expected formats:\n'
      + '  • https://github.com/owner/repo.git\n'
      + '  • git@github.com:owner/repo.git\n'
      + '  • git@<ssh-alias>:owner/repo.git\n'
      + '  • ssh://git@github.com/owner/repo.git',
    ),

  decryptionFailed: () =>
    new BoltenvError(
      'Failed to decrypt environment data.',
      'DECRYPTION_FAILED',
      'The local key may not match the key used to encrypt. Try "boltenv key import" to re-import the correct key.',
    ),

  keyNotFound: (repo: string) =>
    new BoltenvError(
      `No encryption key found for "${repo}".`,
      'KEY_NOT_FOUND',
      'Either:\n'
        + '  • Get the key from a teammate:\n'
        + '      Teammate runs: boltenv key export\n'
        + '      You run:       boltenv key import <base64-key>\n'
        + '  • Set BOLTENV_KEY env var (for CI/CD and servers)',
    ),

  keyMismatch: (local: string, remote: string) =>
    new BoltenvError(
      `Key fingerprint mismatch: local=${local}, remote=${remote}.`,
      'KEY_MISMATCH',
      'Your local key does not match the key used to encrypt the remote data.\n'
        + 'Get the correct key from a teammate: boltenv key export / boltenv key import',
    ),

  noRemoteData: (env: string) =>
    new BoltenvError(
      `No data found for environment "${env}".`,
      'NO_REMOTE_DATA',
      'No one has pushed to this environment yet.\nRun "boltenv push" to upload your .env file.',
    ),

  envFileNotFound: (path: string) =>
    new BoltenvError(
      `File not found: ${path}`,
      'ENV_FILE_NOT_FOUND',
      'Make sure the .env file exists in the current directory.',
    ),

  envFileTooLarge: (path: string, size: number) =>
    new BoltenvError(
      `File too large: ${path} (${Math.round(size / 1024)}KB)`,
      'ENV_FILE_TOO_LARGE',
      'Max .env file size is 1MB. If your file is this large, something may be wrong.',
    ),

  invalidTtl: (input: string) =>
    new BoltenvError(
      `Invalid TTL format: "${input}"`,
      'INVALID_TTL',
      'Use formats like "7d", "24h", "30m", or "3600s".\nMin: 60s, Max: 90d.',
    ),

  apiBadRequest: (message: string, serverHint?: string) =>
    new BoltenvError(
      `Invalid request: ${message}`,
      'API_BAD_REQUEST',
      serverHint ?? 'The request was rejected by the server. Run "boltenv doctor" for diagnostics, or try updating: npm i -g @boltenv.dev/cli@latest',
    ),

  apiRequestFailed: (status: number, message: string) =>
    new BoltenvError(
      `API request failed (${status}): ${message}`,
      'API_REQUEST_FAILED',
      'Check your network connection and try again.',
    ),

  apiTimeout: () =>
    new BoltenvError(
      'API request timed out.',
      'API_TIMEOUT',
      'The server took too long to respond. Try again.',
    ),

  repoAccessDenied: (repo: string) =>
    new BoltenvError(
      `Access denied to repository "${repo}".`,
      'REPO_ACCESS_DENIED',
      'Make sure you have access to this repository on GitHub.',
    ),

  repoReadOnly: (repo: string) =>
    new BoltenvError(
      `You have read-only access to "${repo}".`,
      'REPO_READ_ONLY',
      'boltenv requires write (push) access to the repository.\n'
        + 'If this is a public repo, you must be a collaborator with write permission.\n'
        + 'Ask the repo owner to add you, or use "boltenv team add <your-user>" if they use boltenv teams.',
    ),

  loginFailed: (reason: string) =>
    new BoltenvError(
      `GitHub login failed: ${reason}`,
      'LOGIN_FAILED',
      'Try running "boltenv login" again.',
    ),

  loginExpired: () =>
    new BoltenvError(
      'Login code expired.',
      'LOGIN_EXPIRED',
      'The device code has expired. Run "boltenv login" again.',
    ),

  apiUnauthorized: () =>
    new BoltenvError(
      'Authentication failed. Your GitHub token may be expired.',
      'API_UNAUTHORIZED',
      'Run "boltenv login" to re-authenticate.',
    ),

  apiForbidden: (repo: string) =>
    new BoltenvError(
      `You do not have access to repository "${repo}".`,
      'API_FORBIDDEN',
      'Make sure you have push/pull access to this repository on GitHub.',
    ),

  versionNotFound: (version: number, env: string) =>
    new BoltenvError(
      `Version ${version} not found for environment "${env}".`,
      'VERSION_NOT_FOUND',
      'Run "boltenv ls" to see available versions.',
    ),

  invalidVersion: (input: string) =>
    new BoltenvError(
      `Invalid version: "${input}"`,
      'INVALID_VERSION',
      'Version must be a positive integer. Run "boltenv ls" to see available versions.',
    ),

  branchDetectionFailed: () =>
    new BoltenvError(
      'Could not detect the current git branch.',
      'BRANCH_DETECTION_FAILED',
      'Make sure you are inside a git repository with a checked-out branch.',
    ),

  planLimitReached: (message: string) =>
    new BoltenvError(
      message,
      'PLAN_LIMIT_REACHED',
      'Run "boltenv upgrade" to increase your limits.',
    ),

  teamNotAvailable: () =>
    new BoltenvError(
      'No team found.',
      'TEAM_NOT_FOUND',
      'Use "boltenv team add <user>" to create a team and add members.',
    ),

  teamFull: (limit: number, plan: string) =>
    new BoltenvError(
      `Team member limit reached (${limit} on ${plan} plan).`,
      'TEAM_FULL',
      'Run "boltenv upgrade" to add more team members.',
    ),

  alreadyOnPlan: (plan: string) =>
    new BoltenvError(
      `Already on the ${plan} plan.`,
      'ALREADY_ON_PLAN',
    ),

  billingNotConfigured: () =>
    new BoltenvError(
      'Billing is not available right now.',
      'BILLING_NOT_CONFIGURED',
      'Please try again later or contact support.',
    ),

  authFilePermissionError: (filePath: string) =>
    new BoltenvError(
      `Permission denied reading auth file: ${filePath}`,
      'AUTH_FILE_PERMISSION_ERROR',
      'Check file permissions: chmod 600 ~/.boltenv/auth.json',
    ),

  invalidRepoFormat: (input: string) =>
    new BoltenvError(
      `Invalid repo format: "${input}"`,
      'INVALID_REPO_FORMAT',
      'Expected "owner/repo" format.\n'
        + 'Set it via: -r flag, BOLTENV_REPO env var, or "repo" field in .boltenv.yaml.',
    ),

  devCommandEmpty: () =>
    new BoltenvError(
      'No command specified for dev.',
      'DEV_COMMAND_EMPTY',
      'Add a scripts section to .boltenv.yaml or pass a command: boltenv dev "npm run dev"',
    ),

  noEnvFilesFound: () =>
    new BoltenvError(
      'No .env files found in the current directory.',
      'NO_ENV_FILES_FOUND',
      'Create a .env file or specify one explicitly: boltenv push .env.backend',
    ),

  invalidFormat: (format: string) =>
    new BoltenvError(
      `Invalid output format: "${format}"`,
      'INVALID_FORMAT',
      'Supported formats: dotenv, json, shell',
    ),

  invalidRole: (role: string) =>
    new BoltenvError(
      `Invalid role: "${role}"`,
      'INVALID_ROLE',
      'Allowed roles: admin, member',
    ),

  // ---------------------------------------------------------------------------
  // Classified GitHub errors — thrown by github-error-classifier.
  // Each one is targeted at a specific real-world GitHub failure mode so users
  // know exactly what to do instead of seeing a generic 401/403/404.
  // ---------------------------------------------------------------------------

  githubTokenInvalid: () =>
    new BoltenvError(
      'Your GitHub token is invalid, expired, or revoked.',
      'GITHUB_TOKEN_INVALID',
      'Either:\n'
        + '  • Run "boltenv login" to get a fresh token\n'
        + '  • Set BOLTENV_TOKEN to a new PAT with "repo" scope',
    ),

  githubRateLimited: (remaining: string | null, resetEpoch: string | null) =>
    new BoltenvError(
      'GitHub API rate limit exceeded.',
      'GITHUB_RATE_LIMITED',
      buildRateLimitHint(remaining, resetEpoch),
    ),

  samlAuthorizationRequired: (org: string | null, ssoUrl: string) => {
    const safeOrg = org !== null ? sanitizeForTerminal(org) : null;
    const safeSsoUrl = sanitizeForTerminal(ssoUrl);
    return new BoltenvError(
      safeOrg
        ? `Your GitHub token is not authorized for the "${safeOrg}" organization's SAML SSO.`
        : "Your GitHub token is not authorized for this organization's SAML SSO.",
      'SAML_AUTH_REQUIRED',
      'Authorize your token for the org on GitHub:\n'
        + `  1. Visit: ${safeSsoUrl}\n`
        + '  2. Click "Configure SSO" next to the token\n'
        + '  3. Click "Authorize" for the organization\n'
        + '\n'
        + 'Then re-run your boltenv command.',
    );
  },

  repoNotFoundOrNoAccess: (repo: string) => {
    const safeRepo = sanitizeForTerminal(repo);
    return new BoltenvError(
      `Repository "${safeRepo}" not found, or you do not have access to it.`,
      'REPO_NOT_FOUND_OR_NO_ACCESS',
      'GitHub returns the same error for both cases (by design). Check:\n'
        + '  • Spelling of the repo name (owner/repo)\n'
        + '  • Whether you are a collaborator or org member with repo access\n'
        + '  • Whether your token has "repo" scope\n'
        + '\n'
        + 'Run "boltenv doctor" for a full diagnosis.',
    );
  },
} as const;
