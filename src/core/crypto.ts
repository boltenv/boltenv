import crypto from 'node:crypto';
import type { EncryptedEnvelope } from '../types/index.js';
import {
  AES_IV_LENGTH,
  AES_AUTH_TAG_LENGTH,
  KEY_FINGERPRINT_LENGTH,
  ENCRYPTION_KEY_LENGTH,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LENGTH,
} from '../constants.js';
import { BoltenvError } from '../utils/errors.js';

// --- Key Derivation (HKDF subkeys) ---

/**
 * Derive purpose-specific subkeys from a master key using HKDF.
 * This ensures key separation: the encryption key and HMAC key
 * are cryptographically independent even though they share a master.
 */
function deriveSubkey(masterKey: Buffer, purpose: string): Buffer {
  const derived = crypto.hkdfSync(
    'sha256',
    masterKey,
    Buffer.alloc(0),                        // no salt for HKDF (salt was used in PBKDF2)
    `boltenv-v1-${purpose}`,                // info/context label
    ENCRYPTION_KEY_LENGTH,
  );
  return Buffer.from(derived);
}

/**
 * Derive an AES-256-GCM encryption key from a master key.
 */
export function deriveEncryptionKey(masterKey: Buffer): Buffer {
  return Buffer.from(deriveSubkey(masterKey, 'encrypt'));
}

/**
 * Derive an HMAC key from a master key (for key name hashing).
 */
export function deriveHmacKey(masterKey: Buffer): Buffer {
  return Buffer.from(deriveSubkey(masterKey, 'hmac'));
}

// --- Passphrase-based key derivation ---

/**
 * Derive a 256-bit master key from a passphrase using PBKDF2.
 * Returns { key, salt } — salt must be stored alongside encrypted data.
 */
export function deriveKeyFromPassphrase(
  passphrase: string,
  existingSalt?: Buffer,
): { readonly key: Buffer; readonly salt: Buffer } {
  const salt = existingSalt ?? crypto.randomBytes(PBKDF2_SALT_LENGTH);
  const key = crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    ENCRYPTION_KEY_LENGTH,
    'sha256',
  );
  return { key, salt };
}

// --- Random key generation ---

/**
 * Generate a random 256-bit master key.
 * Used when no passphrase is provided (key stored locally in ~/.boltenv/keys/).
 */
export function generateMasterKey(): Buffer {
  return crypto.randomBytes(ENCRYPTION_KEY_LENGTH);
}

// --- Encryption / Decryption ---

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * A fresh random 12-byte IV is generated for every call.
 * The key should be a derived encryption subkey (from deriveEncryptionKey),
 * NOT the raw master key.
 */
export function encrypt(plaintext: string, key: Buffer): EncryptedEnvelope {
  if (key.length !== ENCRYPTION_KEY_LENGTH) {
    throw new BoltenvError(
      'Invalid encryption key length.',
      'INVALID_KEY_LENGTH',
      `Expected ${ENCRYPTION_KEY_LENGTH} bytes, got ${key.length}.`,
    );
  }

  const iv = crypto.randomBytes(AES_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * Decrypt an encrypted envelope using AES-256-GCM.
 * Validates IV and auth tag lengths before attempting decryption.
 */
export function decrypt(envelope: EncryptedEnvelope, key: Buffer): string {
  const ivBuf = Buffer.from(envelope.iv, 'base64');
  const authTagBuf = Buffer.from(envelope.authTag, 'base64');

  if (ivBuf.length !== AES_IV_LENGTH) {
    throw new BoltenvError(
      `Invalid IV length: expected ${AES_IV_LENGTH} bytes, got ${ivBuf.length}.`,
      'INVALID_IV_LENGTH',
    );
  }

  if (authTagBuf.length !== AES_AUTH_TAG_LENGTH) {
    throw new BoltenvError(
      `Invalid auth tag length: expected ${AES_AUTH_TAG_LENGTH} bytes, got ${authTagBuf.length}.`,
      'INVALID_AUTH_TAG_LENGTH',
    );
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
    decipher.setAuthTag(authTagBuf);

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'unknown';
    throw new BoltenvError(
      'Failed to decrypt environment data.',
      'DECRYPTION_FAILED',
      `Decryption error: ${detail}. The key may be wrong or data may be tampered.`,
    );
  }
}

/**
 * Hash an env var name using HMAC-SHA256.
 * The key should be a derived HMAC subkey (from deriveHmacKey),
 * NOT the raw master key or encryption key.
 */
export function hashKeyName(name: string, hmacKey: Buffer): string {
  return crypto.createHmac('sha256', hmacKey).update(name).digest('hex');
}

/**
 * Generate a fingerprint of a key using HMAC with a domain separator.
 * Returns a hex string of KEY_FINGERPRINT_LENGTH * 2 bits.
 */
export function keyFingerprint(key: Buffer): string {
  return crypto
    .createHmac('sha256', 'boltenv-fingerprint-v1')
    .update(key)
    .digest('hex')
    .substring(0, KEY_FINGERPRINT_LENGTH);
}
