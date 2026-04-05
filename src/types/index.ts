/** Decrypted env key-value pair */
export interface EnvEntry {
  readonly key: string;
  readonly value: string;
}

/** AES-256-GCM encrypted envelope */
export interface EncryptedEnvelope {
  readonly version: 1;
  readonly iv: string;        // base64, 12 bytes random per encryption
  readonly authTag: string;   // base64, 16 bytes from GCM
  readonly ciphertext: string; // base64
}

/** Detected GitHub repository info */
export interface GitRepo {
  readonly owner: string;
  readonly repo: string;
  readonly fullName: string;  // "owner/repo"
}

/** Persisted auth config in ~/.boltenv/auth.json */
export interface AuthConfig {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly scope: string;
  readonly obtainedAt: string;    // ISO 8601
  readonly gitHubUser: string;
}

/** Encrypted blob stored in Redis */
export interface EncryptedBlob {
  readonly version: 1;
  readonly envelope: EncryptedEnvelope;
  readonly encryptedAt: string;  // ISO 8601
  readonly pushedBy: string;
  readonly environment: string;
}

/** Versioned encrypted blob (extends EncryptedBlob with version tracking) */
export interface VersionedBlob extends EncryptedBlob {
  readonly blobVersion: number;
}

/** Metadata stored alongside encrypted blob */
export interface BlobMetadata {
  readonly keyCount: number;
  readonly pushedBy: string;
  readonly encryptedAt: string;
  readonly environment: string;
  readonly keys?: ReadonlyArray<string>;
}

/** Per-environment override config */
export interface EnvironmentOverride {
  readonly ttl?: string;
}

/** Optional local config (.boltenv.yaml) — only for TTL/environment overrides */
export interface BoltenvConfig {
  readonly version: 2;
  readonly defaultEnvironment?: string;
  readonly ttl?: string;
  readonly environments?: Readonly<Record<string, EnvironmentOverride>>;
  readonly scripts?: Readonly<Record<string, string>>;
  /** Custom branch-to-environment mapping. Keys are branch names/patterns, values are environment names. */
  readonly branchEnvironments?: Readonly<Record<string, string>>;
  /** Explicit repo in "owner/repo" format. Skips git detection when set. */
  readonly repo?: string;
  /** List of env files to track for multi-file push/pull. */
  readonly files?: ReadonlyArray<string>;
}

/** Resolved context available to every command */
export interface CommandContext {
  readonly auth: AuthConfig;
  readonly repo: GitRepo;
  readonly environment: string;
  readonly apiBaseUrl: string;
}

/** GitHub Device Flow code response */
export interface DeviceCodeResponse {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly expires_in: number;
  readonly interval: number;
}

/** GitHub Device Flow token response */
export interface DeviceTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
}

/** GitHub Device Flow error response */
export interface DeviceTokenError {
  readonly error: string;
  readonly error_description?: string;
  readonly interval?: number;
}

// --- API Request/Response Types ---

/** POST /api/push request body */
export interface PushRequest {
  readonly blob: EncryptedBlob;
  readonly keyFingerprint: string;
  readonly keySalt?: string;       // base64, present when passphrase-derived
  readonly environment: string;
  readonly ttlSeconds?: number;
  readonly keys?: ReadonlyArray<string>;
}

/** POST /api/push response */
export interface PushResponse {
  readonly version: number;
  readonly expiresAt?: string;
}

/** POST /api/pull request body */
export interface PullRequest {
  readonly environment: string;
  readonly version?: number;
}

/** POST /api/pull response */
export interface PullResponse {
  readonly blob: EncryptedBlob;
  readonly keyFingerprint: string;
  readonly keySalt?: string;       // base64, present when passphrase-derived
  readonly version: number;
  readonly metadata: BlobMetadata;
}

/** POST /api/ls request body */
export interface LsRequest {
  readonly environment: string;
}

/** Version entry in ls response */
export interface VersionEntry {
  readonly version: number;
  readonly pushedBy: string;
  readonly encryptedAt: string;
  readonly keyCount: number;
}

/** POST /api/ls response */
export interface LsResponse {
  readonly metadata: BlobMetadata;
  readonly versions: ReadonlyArray<VersionEntry>;
  readonly ttlRemaining: number | null;
}

/** GET /api/whoami response */
export interface WhoamiResponse {
  readonly user: string;
  readonly repo: string;
}

/** API error response */
export interface ApiErrorResponse {
  readonly error: string;
  readonly code: string;
  readonly hint?: string;
}

// --- Account & Team Types ---

/** Plan tier */
export type PlanTier = 'free' | 'pro' | 'enterprise';

/** Team member role */
export type TeamRole = 'owner' | 'admin' | 'member';

/** GET /api/account response */
export interface AccountResponse {
  readonly user: string;
  readonly plan: PlanTier;
  readonly createdAt: string;
  readonly usage: {
    readonly pushes: number;
    readonly pushLimit: number;
    readonly pulls: number;
    readonly pullLimit: number;
    readonly repos: number;
    readonly repoLimit: number;
  };
}

/** Team member in response */
export interface TeamMemberEntry {
  readonly githubUser: string;
  readonly role: TeamRole;
  readonly addedAt: string;
}

/** GET /api/team response */
export interface TeamResponse {
  readonly team: {
    readonly name: string;
    readonly owner: string;
    readonly createdAt: string;
  } | null;
  readonly members: ReadonlyArray<TeamMemberEntry>;
  readonly hint?: string;
}

/** POST /api/team/members response */
export interface TeamMemberActionResponse {
  readonly message: string;
}

/** POST /api/billing/checkout response */
export interface BillingCheckoutResponse {
  readonly url: string;
}
