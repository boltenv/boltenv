import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isNewerVersion, checkForUpdates } from '../../src/core/update-notifier.js';

describe('update-notifier', () => {
  describe('isNewerVersion', () => {
    it('should detect newer major version', () => {
      expect(isNewerVersion('3.0.0', '4.0.0')).toBe(true);
    });

    it('should detect newer minor version', () => {
      expect(isNewerVersion('3.0.0', '3.1.0')).toBe(true);
    });

    it('should detect newer patch version', () => {
      expect(isNewerVersion('3.0.0', '3.0.1')).toBe(true);
    });

    it('should return false for same version', () => {
      expect(isNewerVersion('3.0.0', '3.0.0')).toBe(false);
    });

    it('should return false for older version', () => {
      expect(isNewerVersion('3.1.0', '3.0.0')).toBe(false);
    });

    it('should handle v prefix', () => {
      expect(isNewerVersion('v3.0.0', 'v3.1.0')).toBe(true);
    });

    it('should handle major bump over minor', () => {
      expect(isNewerVersion('2.9.9', '3.0.0')).toBe(true);
    });

    it('should handle older major even with higher minor', () => {
      expect(isNewerVersion('3.0.0', '2.9.9')).toBe(false);
    });
  });

  describe('checkForUpdates', () => {
    const testDir = path.join(os.tmpdir(), `boltenv-update-test-${Date.now()}`);

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
      vi.spyOn(os, 'homedir').mockReturnValue(testDir);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should return a function', () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
      const showAlert = checkForUpdates('3.0.0');
      expect(typeof showAlert).toBe('function');
    });

    it('should not throw when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
      const showAlert = checkForUpdates('3.0.0');

      // Wait for the background check to settle
      await new Promise((r) => setTimeout(r, 50));

      // Should not throw
      expect(() => showAlert()).not.toThrow();
    });

    it('should write cache file on successful check', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ latest: '3.1.0' }),
      }));

      checkForUpdates('3.0.0');

      // Wait for the background check to complete
      await new Promise((r) => setTimeout(r, 100));

      const cacheFile = path.join(testDir, '.boltenv', 'update-check.json');
      expect(fs.existsSync(cacheFile)).toBe(true);

      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      expect(cached.latestVersion).toBe('3.1.0');
      expect(cached.checkedAt).toBeGreaterThan(0);
    });

    it('should use cache when fresh', async () => {
      // Pre-populate cache
      const cacheDir = path.join(testDir, '.boltenv');
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(cacheDir, 'update-check.json'),
        JSON.stringify({ latestVersion: '3.2.0', checkedAt: Date.now() }),
        'utf8',
      );

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      checkForUpdates('3.0.0');

      await new Promise((r) => setTimeout(r, 50));

      // Should NOT have called fetch — cache is fresh
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch when cache is stale', async () => {
      // Pre-populate stale cache (25 hours ago)
      const cacheDir = path.join(testDir, '.boltenv');
      fs.mkdirSync(cacheDir, { recursive: true });
      const staleTime = Date.now() - 25 * 60 * 60 * 1000;
      fs.writeFileSync(
        path.join(cacheDir, 'update-check.json'),
        JSON.stringify({ latestVersion: '3.0.0', checkedAt: staleTime }),
        'utf8',
      );

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ latest: '3.1.0' }),
      }));

      checkForUpdates('3.0.0');

      await new Promise((r) => setTimeout(r, 100));

      // Should have called fetch — cache is stale
      expect(fetch).toHaveBeenCalled();
    });

    it('should print alert to stderr when update available', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ latest: '3.5.0' }),
      }));

      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const showAlert = checkForUpdates('3.0.0');

      // Wait for background check
      await new Promise((r) => setTimeout(r, 100));

      showAlert();

      // Wait for the promise in showAlert to resolve
      await new Promise((r) => setTimeout(r, 50));

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Update available');
      expect(output).toContain('3.5.0');
      expect(output).toContain('npm i -g @boltenv.dev/cli');
    });

    it('should not print alert when on latest version', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ latest: '3.0.0' }),
      }));

      const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const showAlert = checkForUpdates('3.0.0');

      await new Promise((r) => setTimeout(r, 100));

      showAlert();

      await new Promise((r) => setTimeout(r, 50));

      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
