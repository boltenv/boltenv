/** Default environment name */
export const DEFAULT_ENVIRONMENT = 'development';

/** AES-GCM IV length in bytes */
export const AES_IV_LENGTH = 12;

/** AES-GCM auth tag length in bytes */
export const AES_AUTH_TAG_LENGTH = 16;

/** Key fingerprint length (hex chars) */
export const KEY_FINGERPRINT_LENGTH = 16;

/** Encryption key length in bytes (256-bit) */
export const ENCRYPTION_KEY_LENGTH = 32;

/** PBKDF2 iteration count for passphrase-derived keys */
export const PBKDF2_ITERATIONS = 100_000;

/** PBKDF2 salt length in bytes */
export const PBKDF2_SALT_LENGTH = 16;

/** Maximum TTL in seconds (90 days) */
export const MAX_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Minimum TTL in seconds (60 seconds) */
export const MIN_TTL_SECONDS = 60;

/** GitHub OAuth Client ID (public, safe for Device Flow) */
export const GITHUB_CLIENT_ID = 'Ov23liWMOZ8GDxOJzcR8';

/**
 * GitHub OAuth scopes required.
 * 'repo' is the minimum scope that lets us check `permissions.push` on private repos.
 * GitHub's Device Flow does not support fine-grained tokens (which would allow per-repo scoping).
 * When GitHub adds fine-grained token support for Device Flow, switch to:
 *   contents:read + metadata:read (per-repo)
 */
export const GITHUB_SCOPES = 'repo';

/** GitHub API base URL */
export const GITHUB_API_URL = 'https://api.github.com';

/** GitHub Device Flow URLs */
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/** Auth/config directory name (relative to home dir) */
export const AUTH_DIR_NAME = '.boltenv';
export const AUTH_FILE_NAME = 'auth.json';

/** Config file names to search for (in priority order) */
export const CONFIG_FILENAMES = [
  '.boltenv.yaml',
  '.boltenv.yml',
  '.boltenv.json',
] as const;

/** Device Flow poll interval in milliseconds */
export const DEVICE_FLOW_POLL_INTERVAL_MS = 5_000;

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 15_000;

/** Max retries for transient API failures */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
export const RETRY_BASE_DELAY_MS = 300;

/** Token age threshold — warn if older than this (30 days in ms) */
export const TOKEN_STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/** boltenv API base URL (configurable via BOLTENV_API_URL env var, must be HTTPS) */
export const API_BASE_URL = (() => {
  const url = process.env['BOLTENV_API_URL'] ?? 'https://boltenv.dev';
  // Allow http only for localhost development
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
    return url;
  }
  if (!url.startsWith('https://')) {
    throw new Error(`BOLTENV_API_URL must use HTTPS: ${url}`);
  }
  return url;
})();

/** Branch-to-environment mapping */
export const BRANCH_ENV_MAP: Readonly<Record<string, string>> = {
  main: 'production',
  master: 'production',
  staging: 'staging',
  develop: 'development',
  development: 'development',
};

/** Maximum number of versions to retain per repo+environment */
export const MAX_VERSIONS = 50;

/** Separator between environment name and filename in server storage */
export const ENV_FILE_SEPARATOR = '::';

/** Server-side manifest key (stores the list of pushed files) */
export const MANIFEST_ENV_KEY = '__manifest__';

/** Env file suffixes that indicate templates/examples (not real secrets) */
export const EXCLUDED_ENV_SUFFIXES = [
  '.example',
  '.sample',
  '.template',
  '.defaults',
  '.dist',
] as const;

/** Supported output formats for pull */
export const VALID_OUTPUT_FORMATS = ['dotenv', 'json', 'shell'] as const;

/** Allowed team member roles (excluding 'owner' which is system-assigned) */
export const VALID_TEAM_ROLES = ['admin', 'member'] as const;
