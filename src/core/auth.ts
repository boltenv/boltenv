import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  AuthConfig,
  DeviceCodeResponse,
  DeviceTokenResponse,
  DeviceTokenError,
} from '../types/index.js';
import {
  AUTH_DIR_NAME,
  AUTH_FILE_NAME,
  GITHUB_CLIENT_ID,
  GITHUB_SCOPES,
  GITHUB_DEVICE_CODE_URL,
  GITHUB_DEVICE_TOKEN_URL,
  GITHUB_API_URL,
  DEVICE_FLOW_POLL_INTERVAL_MS,
  TOKEN_STALE_THRESHOLD_MS,
} from '../constants.js';
import {
  AuthConfigSchema,
  GitHubUserSchema,
  GitHubDeviceCodeSchema,
  GitHubRepoPermissionsSchema,
} from '../utils/validators.js';
import { Errors, sanitizeForTerminal } from '../utils/errors.js';
import { classifyGitHubResponse } from './github-error-classifier.js';

/** Callbacks for the login UI (spinner/prompt feedback) */
export interface LoginCallbacks {
  readonly onDeviceCode: (userCode: string, verificationUri: string) => void;
  readonly onPolling: () => void;
  readonly onAuthenticated: (user: string) => void;
}

/**
 * Get the path to the auth directory (~/.boltenv/).
 */
function getAuthDir(): string {
  return path.join(os.homedir(), AUTH_DIR_NAME);
}

/**
 * Get the path to the auth file (~/.boltenv/auth.json).
 */
function getAuthFilePath(): string {
  return path.join(getAuthDir(), AUTH_FILE_NAME);
}

/**
 * Load the saved auth token from disk.
 * Returns null if no token file exists or if it's invalid.
 * Throws on permission errors (EACCES).
 */
export function loadToken(): AuthConfig | null {
  const filePath = getAuthFilePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    const result = AuthConfigSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EACCES') {
      throw Errors.authFilePermissionError(filePath);
    }
    return null;
  }
}

/**
 * Save auth config to disk with secure permissions.
 * Enforces directory permissions even on pre-existing directories.
 *
 * SECURITY NOTE: Token is stored as plaintext JSON with 0o600 permissions.
 * This protects against other OS users but NOT against:
 *   - Malware running as the current user
 *   - Disk backups (Time Machine, iCloud Drive)
 *   - Forensic disk imaging
 * Future improvement: use OS keychain (macOS Keychain, libsecret, Windows Credential Manager).
 */
export function saveToken(auth: AuthConfig): void {
  const dir = getAuthDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const filePath = getAuthFilePath();
  fs.writeFileSync(filePath, JSON.stringify(auth, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Remove the stored token file.
 * Returns true if a token was removed, false if none existed.
 * Throws on permission errors (token stays on disk).
 */
export function removeToken(): boolean {
  const filePath = getAuthFilePath();
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw Errors.authFilePermissionError(filePath);
  }
}

/**
 * Load token or throw if not authenticated.
 *
 * Priority:
 *   1. BOLTENV_TOKEN env var (for CI/CD and production VPS — no interactive login needed)
 *   2. ~/.boltenv/auth.json (from `boltenv login`)
 *
 * Prints a warning if a file-based token is older than TOKEN_STALE_THRESHOLD_MS.
 */
export function requireAuth(): AuthConfig {
  // 1. BOLTENV_TOKEN env var — non-interactive service account auth
  const envToken = process.env['BOLTENV_TOKEN'];
  if (envToken) {
    return {
      accessToken: envToken,
      tokenType: 'bearer',
      scope: 'repo',
      obtainedAt: new Date().toISOString(),
      gitHubUser: process.env['BOLTENV_USER'] ?? 'service-account',
    };
  }

  // 2. File-based token from boltenv login
  const token = loadToken();
  if (!token) {
    throw Errors.notAuthenticated();
  }

  // Token freshness check
  const age = Date.now() - new Date(token.obtainedAt).getTime();
  if (age > TOKEN_STALE_THRESHOLD_MS) {
    const days = Math.floor(age / (24 * 60 * 60 * 1000));
    console.error(`  Warning: GitHub token is ${days} days old. Run "boltenv login --force" to refresh.`);
  }

  return token;
}

/**
 * Run the GitHub Device Flow login.
 * Returns the full auth config after successful authentication.
 */
export async function login(
  callbacks: LoginCallbacks,
): Promise<AuthConfig> {
  // Step 1: Request device code (validated)
  const deviceCode = await requestDeviceCode();
  callbacks.onDeviceCode(deviceCode.user_code, deviceCode.verification_uri);

  // Step 2: Poll for token
  callbacks.onPolling();
  const tokenResponse = await pollForToken(
    deviceCode.device_code,
    deviceCode.interval,
    deviceCode.expires_in,
  );

  // Step 3: Get GitHub username (validated)
  const gitHubUser = await fetchGitHubUser(tokenResponse.access_token);
  callbacks.onAuthenticated(gitHubUser);

  return {
    accessToken: tokenResponse.access_token,
    tokenType: tokenResponse.token_type,
    scope: tokenResponse.scope,
    obtainedAt: new Date().toISOString(),
    gitHubUser,
  };
}

/**
 * Access level the user has on a repo.
 */
export type RepoAccessLevel = 'write' | 'read' | 'none';

/**
 * Check what level of access a GitHub token grants on a repo.
 * Differentiates transient errors (5xx, rate limit) from actual access denial.
 */
export async function checkRepoAccess(
  token: string,
  repoFullName: string,
): Promise<RepoAccessLevel> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_API_URL}/repos/${repoFullName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    // Network error — don't silently deny access
    throw Errors.apiRequestFailed(0, 'Failed to verify repo access — check your network connection.');
  }

  // Classify 401/403/429 into targeted errors (SAML, rate limit, token
  // invalid) so the user gets a specific fix, not a generic "none".
  // Header + status only — no body consumption.
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    const classified = classifyGitHubResponse(response, repoFullName);
    if (classified) throw classified;
  }

  // 403 or 404 with no classifier match → treat as no access (legacy behavior).
  if (response.status === 404 || response.status === 403) {
    return 'none';
  }

  if (response.status >= 500) {
    throw Errors.apiRequestFailed(response.status, 'GitHub API is temporarily unavailable. Try again shortly.');
  }
  if (!response.ok) {
    throw Errors.apiRequestFailed(response.status, `GitHub API error: ${response.statusText}`);
  }

  // Validate response with Zod
  const raw: unknown = await response.json();
  const parsed = GitHubRepoPermissionsSchema.safeParse(raw);
  if (!parsed.success) {
    // Can't determine permissions — fail open with a warning rather than silently deny
    console.error('  Warning: Could not parse GitHub permissions response. Assuming read-only.');
    return 'read';
  }

  const data = parsed.data;
  if (data.permissions?.push || data.permissions?.admin) {
    return 'write';
  }

  return 'read';
}

/**
 * @internal — use checkRepoAccess instead.
 */
export async function verifyRepoAccess(
  token: string,
  repoFullName: string,
): Promise<boolean> {
  const level = await checkRepoAccess(token, repoFullName);
  return level === 'write';
}

/**
 * Fetch the authenticated GitHub user's login name.
 * Validates the response with Zod.
 */
async function fetchGitHubUser(token: string): Promise<string> {
  const response = await fetch(`${GITHUB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw Errors.loginFailed('Failed to fetch GitHub user info.');
  }

  const raw: unknown = await response.json();
  const parsed = GitHubUserSchema.safeParse(raw);
  if (!parsed.success) {
    throw Errors.loginFailed('Unexpected response from GitHub /user endpoint.');
  }
  return parsed.data.login;
}

/**
 * Request a device code from GitHub.
 * Validates the response with Zod.
 */
async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPES,
    }),
  });

  if (!response.ok) {
    throw Errors.loginFailed('Failed to initiate device flow.');
  }

  const raw: unknown = await response.json();
  const parsed = GitHubDeviceCodeSchema.safeParse(raw);
  if (!parsed.success) {
    throw Errors.loginFailed('Unexpected response from GitHub device code endpoint.');
  }
  return parsed.data;
}

/**
 * Poll GitHub for the access token until the user authorizes or the code expires.
 */
async function pollForToken(
  deviceCode: string,
  intervalSeconds: number,
  expiresInSeconds: number,
): Promise<DeviceTokenResponse> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  const MAX_POLL_INTERVAL_MS = 30_000; // Cap at 30s to prevent unbounded growth
  let pollInterval = Math.max(intervalSeconds * 1000, DEVICE_FLOW_POLL_INTERVAL_MS);

  while (Date.now() < deadline) {
    await sleep(pollInterval);

    const response = await fetch(GITHUB_DEVICE_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    // Check response.ok before parsing JSON to avoid HTML parse errors on 5xx
    if (!response.ok && response.status >= 500) {
      continue; // retry silently on server errors
    }

    const body = (await response.json()) as DeviceTokenResponse | DeviceTokenError;

    if ('access_token' in body) {
      return body as DeviceTokenResponse;
    }

    const error = body as DeviceTokenError;
    switch (error.error) {
      case 'authorization_pending':
        continue;
      case 'slow_down':
        pollInterval = Math.min(pollInterval + 5000, MAX_POLL_INTERVAL_MS);
        continue;
      case 'expired_token':
        throw Errors.loginExpired();
      default:
        throw Errors.loginFailed(
          sanitizeForTerminal(error.error_description ?? error.error),
        );
    }
  }

  throw Errors.loginExpired();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
