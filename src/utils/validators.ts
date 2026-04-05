import { z } from 'zod';

// --- Base64 length helpers ---

/**
 * Zod refinement: validates a base64 string decodes to exactly `byteLength` bytes.
 */
function base64Bytes(byteLength: number) {
  return z.string().min(1).refine(
    (val) => {
      try { return Buffer.from(val, 'base64').length === byteLength; }
      catch { return false; }
    },
    { message: `Must be base64 encoding of exactly ${byteLength} bytes` },
  );
}

// --- Crypto schemas ---

export const EncryptedEnvelopeSchema = z.object({
  version: z.literal(1),
  iv: base64Bytes(12),         // AES-GCM IV: exactly 12 bytes
  authTag: base64Bytes(16),    // AES-GCM auth tag: exactly 16 bytes
  ciphertext: z.string().min(1),
});

export const EncryptedBlobSchema = z.object({
  version: z.literal(1),
  envelope: EncryptedEnvelopeSchema,
  encryptedAt: z.string().min(1),
  pushedBy: z.string().min(1),
  environment: z.string().min(1),
});

export const BlobMetadataSchema = z.object({
  keyCount: z.number().int().min(0),
  pushedBy: z.string().min(1),
  encryptedAt: z.string().min(1),
  environment: z.string().min(1),
  keys: z.array(z.string()).optional(),
});

// --- Auth schema ---

export const AuthConfigSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1),
  scope: z.string(),
  obtainedAt: z.string().datetime({ offset: true }),
  gitHubUser: z.string().regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/, 'Invalid GitHub username format'),
});

// --- Config schema ---

export const EnvironmentOverrideSchema = z.object({
  ttl: z.string().optional(),
});

export const BoltenvConfigSchema = z.object({
  version: z.literal(2),
  defaultEnvironment: z.string().min(1).optional(),
  ttl: z.string().optional(),
  environments: z.record(z.string(), EnvironmentOverrideSchema).optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  branchEnvironments: z.record(z.string(), z.string()).optional(),
  repo: z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Must be in "owner/repo" format').optional(),
  files: z.array(z.string().min(1)).optional(),
});

// --- API Request Schemas ---

export const PushRequestSchema = z.object({
  blob: EncryptedBlobSchema,
  keyFingerprint: z.string().min(1),
  keySalt: z.string().optional(),
  environment: z.string().min(1),
  ttlSeconds: z.number().int().positive().optional(),
  keys: z.array(z.string()).optional(),
});

export const PullRequestSchema = z.object({
  environment: z.string().min(1),
  version: z.number().int().positive().optional(),
});

export const LsRequestSchema = z.object({
  environment: z.string().min(1),
});

// --- API Response Schemas ---

export const PullResponseSchema = z.object({
  blob: EncryptedBlobSchema,
  keyFingerprint: z.string().min(1),
  keySalt: z.string().optional(),
  version: z.number().int().positive(),
  metadata: BlobMetadataSchema,
});

export const PushResponseSchema = z.object({
  version: z.number().int().positive(),
  expiresAt: z.string().optional(),
});

export const VersionEntrySchema = z.object({
  version: z.number().int().positive(),
  pushedBy: z.string().min(1),
  encryptedAt: z.string().min(1),
  keyCount: z.number().int().min(0),
});

export const LsResponseSchema = z.object({
  metadata: BlobMetadataSchema,
  versions: z.array(VersionEntrySchema),
  ttlRemaining: z.number().min(0).nullable(),
});

export const WhoamiResponseSchema = z.object({
  user: z.string().min(1),
  repo: z.string().min(1),
});

export const ApiErrorResponseSchema = z.object({
  error: z.string().min(1),
  code: z.string().min(1),
  hint: z.string().optional(),
});

// --- Account & Team Response Schemas (Fix #20: previously missing) ---

export const AccountResponseSchema = z.object({
  user: z.string().min(1),
  plan: z.enum(['free', 'pro', 'enterprise']),
  createdAt: z.string().min(1),
  usage: z.object({
    pushes: z.number().int().min(0),
    pushLimit: z.number().int().min(0),
    pulls: z.number().int().min(0),
    pullLimit: z.number().int().min(0),
    repos: z.number().int().min(0),
    repoLimit: z.number().int().min(0),
  }),
});

export const TeamMemberEntrySchema = z.object({
  githubUser: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member']),
  addedAt: z.string().min(1),
});

export const TeamResponseSchema = z.object({
  team: z.object({
    name: z.string().min(1),
    owner: z.string().min(1),
    createdAt: z.string().min(1),
  }).nullable(),
  members: z.array(TeamMemberEntrySchema),
  hint: z.string().optional(),
});

export const TeamMemberActionResponseSchema = z.object({
  message: z.string().min(1),
});

export const BillingCheckoutResponseSchema = z.object({
  url: z.string().url().refine(
    (val) => val.startsWith('https://'),
    { message: 'Checkout URL must use HTTPS' },
  ),
});

// --- GitHub API Response Schemas (Fix #10: validate external responses) ---

export const GitHubUserSchema = z.object({
  login: z.string().min(1),
});

export const GitHubDeviceCodeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().min(0),
});

export const GitHubRepoPermissionsSchema = z.object({
  permissions: z.object({
    push: z.boolean().optional(),
    admin: z.boolean().optional(),
  }).optional(),
  private: z.boolean().optional(),
});
