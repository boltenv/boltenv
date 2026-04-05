import { describe, it, expect } from 'vitest';
import {
  buildEnvKey,
  buildManifestKey,
  filesToManifestEntries,
  manifestEntriesToFiles,
  assertSafeFilename,
} from '../../src/core/env-namespacing.js';

describe('env-namespacing', () => {
  describe('assertSafeFilename', () => {
    it('should accept valid env filenames', () => {
      expect(() => assertSafeFilename('.env')).not.toThrow();
      expect(() => assertSafeFilename('.env.backend')).not.toThrow();
      expect(() => assertSafeFilename('.env.frontend')).not.toThrow();
      expect(() => assertSafeFilename('.env.local')).not.toThrow();
      expect(() => assertSafeFilename('.env.production')).not.toThrow();
      expect(() => assertSafeFilename('.env.staging')).not.toThrow();
      expect(() => assertSafeFilename('backend.env')).not.toThrow();
      expect(() => assertSafeFilename('.env.db-primary')).not.toThrow();
      expect(() => assertSafeFilename('.env.my_service')).not.toThrow();
    });

    it('should reject path traversal: ../', () => {
      expect(() => assertSafeFilename('../.env')).toThrow('Unsafe filename');
      expect(() => assertSafeFilename('../../.bashrc')).toThrow('Unsafe filename');
    });

    it('should reject absolute paths', () => {
      expect(() => assertSafeFilename('/etc/passwd')).toThrow('Unsafe filename');
      expect(() => assertSafeFilename('/home/user/.env')).toThrow('Unsafe filename');
    });

    it('should reject filenames with slashes', () => {
      expect(() => assertSafeFilename('services/backend/.env')).toThrow('Unsafe filename');
      expect(() => assertSafeFilename('a/b/c')).toThrow('Unsafe filename');
    });

    it('should reject filenames with spaces', () => {
      expect(() => assertSafeFilename('.env file')).toThrow('Unsafe filename');
    });

    it('should reject filenames with shell metacharacters', () => {
      expect(() => assertSafeFilename('.env;rm -rf')).toThrow('Unsafe filename');
      expect(() => assertSafeFilename('.env$(cmd)')).toThrow('Unsafe filename');
      expect(() => assertSafeFilename('.env`whoami`')).toThrow('Unsafe filename');
    });

    it('should reject non-env filenames', () => {
      expect(() => assertSafeFilename('package.json')).toThrow('Not an env file');
      expect(() => assertSafeFilename('README.md')).toThrow('Not an env file');
      expect(() => assertSafeFilename('.bashrc')).toThrow('Not an env file');
      expect(() => assertSafeFilename('authorized_keys')).toThrow('Not an env file');
    });

    it('should reject empty filename', () => {
      expect(() => assertSafeFilename('')).toThrow('Unsafe filename');
    });

    it('should reject overly long filenames', () => {
      const long = '.env.' + 'a'.repeat(200);
      expect(() => assertSafeFilename(long)).toThrow('Unsafe filename');
    });
  });

  describe('buildEnvKey', () => {
    it('should return plain environment for .env (backward compat)', () => {
      expect(buildEnvKey('development', '.env')).toBe('development');
      expect(buildEnvKey('production', '.env')).toBe('production');
    });

    it('should namespace non-default files', () => {
      expect(buildEnvKey('development', '.env.backend')).toBe('development::.env.backend');
      expect(buildEnvKey('development', '.env.frontend')).toBe('development::.env.frontend');
      expect(buildEnvKey('production', '.env.db')).toBe('production::.env.db');
    });

    it('should handle unusual filenames', () => {
      expect(buildEnvKey('staging', 'backend.env')).toBe('staging::backend.env');
      expect(buildEnvKey('staging', '.env.local')).toBe('staging::.env.local');
    });

    it('should reject unsafe filenames', () => {
      expect(() => buildEnvKey('development', '../.env')).toThrow();
      expect(() => buildEnvKey('development', '/etc/passwd')).toThrow();
    });
  });

  describe('buildManifestKey', () => {
    it('should build correct manifest key', () => {
      expect(buildManifestKey('development')).toBe('development::__manifest__');
      expect(buildManifestKey('production')).toBe('production::__manifest__');
    });
  });

  describe('filesToManifestEntries', () => {
    it('should convert filenames to env entries', () => {
      const entries = filesToManifestEntries(['.env.backend', '.env.frontend']);
      expect(entries).toEqual([
        { key: 'FILE_0', value: '.env.backend' },
        { key: 'FILE_1', value: '.env.frontend' },
      ]);
    });

    it('should handle empty list', () => {
      expect(filesToManifestEntries([])).toEqual([]);
    });

    it('should handle single file', () => {
      const entries = filesToManifestEntries(['.env']);
      expect(entries).toEqual([{ key: 'FILE_0', value: '.env' }]);
    });

    it('should reject unsafe filenames', () => {
      expect(() => filesToManifestEntries(['../../../etc/passwd'])).toThrow();
      expect(() => filesToManifestEntries(['.env', '/etc/shadow'])).toThrow();
    });
  });

  describe('manifestEntriesToFiles', () => {
    it('should extract filenames from entries', () => {
      const files = manifestEntriesToFiles([
        { key: 'FILE_0', value: '.env.backend' },
        { key: 'FILE_1', value: '.env.frontend' },
      ]);
      expect(files).toEqual(['.env.backend', '.env.frontend']);
    });

    it('should sort by index', () => {
      const files = manifestEntriesToFiles([
        { key: 'FILE_2', value: '.env.db' },
        { key: 'FILE_0', value: '.env.backend' },
        { key: 'FILE_1', value: '.env.frontend' },
      ]);
      expect(files).toEqual(['.env.backend', '.env.frontend', '.env.db']);
    });

    it('should ignore non-FILE entries', () => {
      const files = manifestEntriesToFiles([
        { key: 'FILE_0', value: '.env.backend' },
        { key: 'RANDOM', value: 'noise' },
        { key: 'FILE_1', value: '.env.frontend' },
      ]);
      expect(files).toEqual(['.env.backend', '.env.frontend']);
    });

    it('should handle empty entries', () => {
      expect(manifestEntriesToFiles([])).toEqual([]);
    });

    it('should roundtrip with filesToManifestEntries', () => {
      const original = ['.env', '.env.backend', '.env.frontend', '.env.db'];
      const entries = filesToManifestEntries(original);
      const roundtripped = manifestEntriesToFiles(entries);
      expect(roundtripped).toEqual(original);
    });

    it('should reject poisoned manifest with path traversal', () => {
      expect(() => manifestEntriesToFiles([
        { key: 'FILE_0', value: '../../.bashrc' },
      ])).toThrow();
    });

    it('should reject poisoned manifest with absolute paths', () => {
      expect(() => manifestEntriesToFiles([
        { key: 'FILE_0', value: '/etc/shadow' },
      ])).toThrow();
    });

    it('should reject poisoned manifest with non-env files', () => {
      expect(() => manifestEntriesToFiles([
        { key: 'FILE_0', value: 'authorized_keys' },
      ])).toThrow();
    });

    it('should reject poisoned manifest with shell injection', () => {
      expect(() => manifestEntriesToFiles([
        { key: 'FILE_0', value: '.env;rm -rf /' },
      ])).toThrow();
    });
  });
});
