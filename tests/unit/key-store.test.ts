import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRepoKey, saveRepoKey, hasRepoKey, exportRepoKey, importRepoKey } from '../../src/core/key-store.js';
import { generateMasterKey } from '../../src/core/crypto.js';

describe('key-store', () => {
  const testDir = path.join(os.tmpdir(), `boltenv-keystore-test-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('saveRepoKey + loadRepoKey', () => {
    it('should save and load a key', () => {
      const key = generateMasterKey();
      saveRepoKey('owner/repo', key);
      const loaded = loadRepoKey('owner/repo');
      expect(loaded).not.toBeNull();
      expect(loaded!.equals(key)).toBe(true);
    });

    it('should create directories with secure permissions', () => {
      saveRepoKey('myorg/myrepo', generateMasterKey());
      const keysDir = path.join(testDir, '.boltenv', 'keys', 'myorg');
      const stats = fs.statSync(keysDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('loadRepoKey', () => {
    it('should return null when no key exists', () => {
      const result = loadRepoKey('owner/norepo');
      expect(result).toBeNull();
    });

    it('should return null for wrong-length key file', () => {
      const keyDir = path.join(testDir, '.boltenv', 'keys', 'owner');
      fs.mkdirSync(keyDir, { recursive: true });
      fs.writeFileSync(path.join(keyDir, 'bad.key'), Buffer.alloc(10));
      const result = loadRepoKey('owner/bad');
      expect(result).toBeNull();
    });
  });

  describe('hasRepoKey', () => {
    it('should return false when no key exists', () => {
      expect(hasRepoKey('owner/none')).toBe(false);
    });

    it('should return true when key exists', () => {
      saveRepoKey('owner/exists', generateMasterKey());
      expect(hasRepoKey('owner/exists')).toBe(true);
    });
  });

  describe('exportRepoKey', () => {
    it('should export key as base64', () => {
      const key = generateMasterKey();
      saveRepoKey('owner/exp', key);
      const exported = exportRepoKey('owner/exp');
      expect(Buffer.from(exported, 'base64').equals(key)).toBe(true);
    });

    it('should throw when key does not exist', () => {
      expect(() => exportRepoKey('owner/missing')).toThrow('No key found');
    });
  });

  describe('importRepoKey', () => {
    it('should import a base64 key', () => {
      const key = generateMasterKey();
      importRepoKey('owner/imp', key.toString('base64'));
      const loaded = loadRepoKey('owner/imp');
      expect(loaded!.equals(key)).toBe(true);
    });

    it('should reject wrong-length key', () => {
      const shortKey = Buffer.alloc(16).toString('base64');
      expect(() => importRepoKey('owner/bad', shortKey)).toThrow('wrong length');
    });
  });
});
