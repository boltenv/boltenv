import { describe, it, expect } from 'vitest';
import {
  generateMasterKey,
  deriveEncryptionKey,
  deriveHmacKey,
  deriveKeyFromPassphrase,
  encrypt,
  decrypt,
  hashKeyName,
  keyFingerprint,
} from '../../src/core/crypto.js';
import { ENCRYPTION_KEY_LENGTH, AES_IV_LENGTH, AES_AUTH_TAG_LENGTH } from '../../src/constants.js';

describe('crypto', () => {
  describe('generateMasterKey', () => {
    it('should generate a 32-byte key', () => {
      const key = generateMasterKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should produce different keys each time', () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('HKDF key derivation', () => {
    it('should derive a 32-byte encryption subkey', () => {
      const master = generateMasterKey();
      const encKey = deriveEncryptionKey(master);
      expect(encKey).toBeInstanceOf(Buffer);
      expect(encKey.length).toBe(ENCRYPTION_KEY_LENGTH);
    });

    it('should derive a 32-byte HMAC subkey', () => {
      const master = generateMasterKey();
      const hmacKey = deriveHmacKey(master);
      expect(hmacKey).toBeInstanceOf(Buffer);
      expect(hmacKey.length).toBe(ENCRYPTION_KEY_LENGTH);
    });

    it('should derive different subkeys for encryption vs HMAC (key separation)', () => {
      const master = generateMasterKey();
      const encKey = deriveEncryptionKey(master);
      const hmacKey = deriveHmacKey(master);
      expect(encKey.equals(hmacKey)).toBe(false);
    });

    it('should derive the same subkey deterministically', () => {
      const master = generateMasterKey();
      const enc1 = deriveEncryptionKey(master);
      const enc2 = deriveEncryptionKey(master);
      expect(enc1.equals(enc2)).toBe(true);
    });

    it('should derive different subkeys for different master keys', () => {
      const master1 = generateMasterKey();
      const master2 = generateMasterKey();
      expect(deriveEncryptionKey(master1).equals(deriveEncryptionKey(master2))).toBe(false);
    });
  });

  describe('deriveKeyFromPassphrase', () => {
    it('should derive a 32-byte key from a passphrase', () => {
      const { key, salt } = deriveKeyFromPassphrase('test-passphrase');
      expect(key.length).toBe(ENCRYPTION_KEY_LENGTH);
      expect(salt.length).toBe(16);
    });

    it('should produce the same key with the same passphrase and salt', () => {
      const { key: key1, salt } = deriveKeyFromPassphrase('my-secret');
      const { key: key2 } = deriveKeyFromPassphrase('my-secret', salt);
      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys with different passphrases', () => {
      const { key: key1, salt } = deriveKeyFromPassphrase('passA');
      const { key: key2 } = deriveKeyFromPassphrase('passB', salt);
      expect(key1.equals(key2)).toBe(false);
    });

    it('should produce different salts each time', () => {
      const { salt: salt1 } = deriveKeyFromPassphrase('same');
      const { salt: salt2 } = deriveKeyFromPassphrase('same');
      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const master = generateMasterKey();
      const encKey = deriveEncryptionKey(master);
      const plaintext = 'my-secret-value';
      const envelope = encrypt(plaintext, encKey);
      const decrypted = decrypt(envelope, encKey);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext each time (random IV)', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const envelope1 = encrypt('same-value', encKey);
      const envelope2 = encrypt('same-value', encKey);
      expect(envelope1.ciphertext).not.toBe(envelope2.ciphertext);
      expect(envelope1.iv).not.toBe(envelope2.iv);
    });

    it('should handle empty strings', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const envelope = encrypt('', encKey);
      expect(decrypt(envelope, encKey)).toBe('');
    });

    it('should handle unicode strings', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const plaintext = 'hello world emoji test';
      expect(decrypt(encrypt(plaintext, encKey), encKey)).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const plaintext = 'a'.repeat(10000);
      expect(decrypt(encrypt(plaintext, encKey), encKey)).toBe(plaintext);
    });

    it('should throw BoltenvError with wrong key', () => {
      const encKey1 = deriveEncryptionKey(generateMasterKey());
      const encKey2 = deriveEncryptionKey(generateMasterKey());
      const envelope = encrypt('secret', encKey1);
      expect(() => decrypt(envelope, encKey2)).toThrow('Failed to decrypt');
    });

    it('should throw on invalid key length', () => {
      expect(() => encrypt('test', Buffer.alloc(16))).toThrow('Invalid encryption key length');
    });

    it('should throw on invalid IV length', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const envelope = encrypt('test', encKey);
      const badEnvelope = { ...envelope, iv: Buffer.alloc(4).toString('base64') };
      expect(() => decrypt(badEnvelope, encKey)).toThrow('Invalid IV length');
    });

    it('should throw on invalid auth tag length', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const envelope = encrypt('test', encKey);
      const badEnvelope = { ...envelope, authTag: Buffer.alloc(4).toString('base64') };
      expect(() => decrypt(badEnvelope, encKey)).toThrow('Invalid auth tag length');
    });

    it('should return version 1 in envelope', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      expect(encrypt('test', encKey).version).toBe(1);
    });

    it('should produce base64-encoded iv, authTag, ciphertext', () => {
      const encKey = deriveEncryptionKey(generateMasterKey());
      const envelope = encrypt('test', encKey);
      expect(() => Buffer.from(envelope.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(envelope.authTag, 'base64')).not.toThrow();
      expect(() => Buffer.from(envelope.ciphertext, 'base64')).not.toThrow();
    });
  });

  describe('hashKeyName', () => {
    it('should produce a hex string', () => {
      const hmacKey = deriveHmacKey(generateMasterKey());
      expect(hashKeyName('DATABASE_URL', hmacKey)).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic', () => {
      const hmacKey = deriveHmacKey(generateMasterKey());
      expect(hashKeyName('DB', hmacKey)).toBe(hashKeyName('DB', hmacKey));
    });

    it('should produce different hashes for different names', () => {
      const hmacKey = deriveHmacKey(generateMasterKey());
      expect(hashKeyName('A', hmacKey)).not.toBe(hashKeyName('B', hmacKey));
    });

    it('should produce different hashes with different keys', () => {
      const hmac1 = deriveHmacKey(generateMasterKey());
      const hmac2 = deriveHmacKey(generateMasterKey());
      expect(hashKeyName('DB', hmac1)).not.toBe(hashKeyName('DB', hmac2));
    });
  });

  describe('keyFingerprint', () => {
    it('should produce a 16-char hex string', () => {
      const key = generateMasterKey();
      const fp = keyFingerprint(key);
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should be deterministic', () => {
      const key = generateMasterKey();
      expect(keyFingerprint(key)).toBe(keyFingerprint(key));
    });

    it('should differ for different keys', () => {
      expect(keyFingerprint(generateMasterKey())).not.toBe(keyFingerprint(generateMasterKey()));
    });
  });
});
