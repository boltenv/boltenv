import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadToken, saveToken, removeToken, requireAuth, verifyRepoAccess, checkRepoAccess, login } from '../../src/core/auth.js';
import type { AuthConfig } from '../../src/types/index.js';
import type { LoginCallbacks } from '../../src/core/auth.js';

const TEST_AUTH: AuthConfig = {
  accessToken: 'gho_test_token_123',
  tokenType: 'bearer',
  scope: 'repo',
  obtainedAt: new Date().toISOString(),  // fresh token to avoid stale warning
  gitHubUser: 'testuser',
};

describe('auth', () => {
  const testDir = path.join(os.tmpdir(), `boltenv-test-${Date.now()}`);
  const authDir = path.join(testDir, '.boltenv');
  const authFile = path.join(authDir, 'auth.json');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(testDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('saveToken + loadToken', () => {
    it('should save and load a token', () => {
      saveToken(TEST_AUTH);
      const loaded = loadToken();
      expect(loaded).toEqual(TEST_AUTH);
    });

    it('should create auth directory', () => {
      saveToken(TEST_AUTH);
      const stats = fs.statSync(authDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create auth file with 0o600 permissions', () => {
      saveToken(TEST_AUTH);
      const stats = fs.statSync(authFile);
      expect(stats.isFile()).toBe(true);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should overwrite existing token', () => {
      saveToken(TEST_AUTH);
      const updated = { ...TEST_AUTH, gitHubUser: 'newuser' };
      saveToken(updated);
      const loaded = loadToken();
      expect(loaded!.gitHubUser).toBe('newuser');
    });
  });

  describe('loadToken', () => {
    it('should return null when no file exists', () => {
      const result = loadToken();
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(authFile, 'not json', 'utf8');
      const result = loadToken();
      expect(result).toBeNull();
    });

    it('should return null for invalid schema', () => {
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(authFile, JSON.stringify({ bad: 'data' }), 'utf8');
      const result = loadToken();
      expect(result).toBeNull();
    });

    it('should return null for empty object', () => {
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(authFile, '{}', 'utf8');
      const result = loadToken();
      expect(result).toBeNull();
    });
  });

  describe('removeToken', () => {
    it('should remove existing token and return true', () => {
      saveToken(TEST_AUTH);
      const removed = removeToken();
      expect(removed).toBe(true);
      expect(loadToken()).toBeNull();
    });

    it('should return false when no token exists', () => {
      const removed = removeToken();
      expect(removed).toBe(false);
    });
  });

  describe('requireAuth', () => {
    it('should return auth config when token exists', () => {
      saveToken(TEST_AUTH);
      const auth = requireAuth();
      expect(auth.gitHubUser).toBe('testuser');
    });

    it('should throw when not authenticated', () => {
      expect(() => requireAuth()).toThrow('Not logged in');
    });

    it('should return token as-is (no Upstash overrides in v3)', () => {
      saveToken(TEST_AUTH);
      const auth = requireAuth();
      expect(auth).toEqual(TEST_AUTH);
    });
  });

  describe('checkRepoAccess', () => {
    it('should return write when user has push permission', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ permissions: { push: true, admin: false }, private: false }),
      }));

      const result = await checkRepoAccess('gho_token', 'owner/repo');
      expect(result).toBe('write');
    });

    it('should return write when user has admin permission', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ permissions: { push: false, admin: true }, private: true }),
      }));

      const result = await checkRepoAccess('gho_token', 'owner/repo');
      expect(result).toBe('write');
    });

    it('should return read when user can see repo but has no write access', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ permissions: { push: false, admin: false }, private: false }),
      }));

      const result = await checkRepoAccess('gho_token', 'owner/public-repo');
      expect(result).toBe('read');
    });

    it('should return none for 404', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

      const result = await checkRepoAccess('gho_token', 'owner/private-repo');
      expect(result).toBe('none');
    });

    it('should return none for 403', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

      const result = await checkRepoAccess('gho_token', 'owner/forbidden-repo');
      expect(result).toBe('none');
    });
  });

  describe('verifyRepoAccess (deprecated)', () => {
    it('should return true when user has write access', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ permissions: { push: true }, private: false }),
      }));

      const result = await verifyRepoAccess('gho_token', 'owner/repo');
      expect(result).toBe(true);
    });

    it('should return false when user has no access (404)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

      const result = await verifyRepoAccess('gho_token', 'owner/private-repo');
      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should complete the device flow and return auth config', async () => {
      let tokenPollCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('login/device/code')) {
          return {
            ok: true,
            json: async () => ({
              device_code: 'test_device_code',
              user_code: 'TEST-1234',
              verification_uri: 'https://github.com/login/device',
              expires_in: 900,
              interval: 5,
            }),
          };
        }

        if (String(url).includes('login/oauth/access_token')) {
          tokenPollCount++;
          if (tokenPollCount <= 1) {
            return {
              ok: true,
              json: async () => ({
                error: 'authorization_pending',
                error_description: 'waiting',
              }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              access_token: 'gho_fresh_token',
              token_type: 'bearer',
              scope: 'repo',
            }),
          };
        }

        if (String(url).includes('api.github.com/user')) {
          return {
            ok: true,
            json: async () => ({ login: 'newuser' }),
          };
        }

        return { ok: false, status: 404 };
      });
      vi.stubGlobal('fetch', mockFetch);

      const callbacks: LoginCallbacks = {
        onDeviceCode: vi.fn(),
        onPolling: vi.fn(),
        onAuthenticated: vi.fn(),
      };

      const loginPromise = login(callbacks);

      // Advance timers for poll intervals
      await vi.advanceTimersByTimeAsync(6000);
      await vi.advanceTimersByTimeAsync(6000);

      const auth = await loginPromise;

      expect(auth.accessToken).toBe('gho_fresh_token');
      expect(auth.gitHubUser).toBe('newuser');
      expect(auth).not.toHaveProperty('upstashUrl');
      expect(auth).not.toHaveProperty('upstashToken');
      expect(callbacks.onDeviceCode).toHaveBeenCalledWith(
        'TEST-1234',
        'https://github.com/login/device',
      );
      expect(callbacks.onPolling).toHaveBeenCalled();
      expect(callbacks.onAuthenticated).toHaveBeenCalledWith('newuser');
    });

    it('should throw when device code request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }));

      const callbacks: LoginCallbacks = {
        onDeviceCode: vi.fn(),
        onPolling: vi.fn(),
        onAuthenticated: vi.fn(),
      };

      await expect(
        login(callbacks),
      ).rejects.toThrow('GitHub login failed');
    });

    it('should throw when user info fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes('login/device/code')) {
          return {
            ok: true,
            json: async () => ({
              device_code: 'dc',
              user_code: 'UC',
              verification_uri: 'https://github.com/login/device',
              expires_in: 900,
              interval: 5,
            }),
          };
        }
        if (String(url).includes('login/oauth/access_token')) {
          return {
            ok: true,
            json: async () => ({
              access_token: 'gho_token',
              token_type: 'bearer',
              scope: 'repo',
            }),
          };
        }
        return { ok: false, status: 401 };
      }));

      const callbacks: LoginCallbacks = {
        onDeviceCode: vi.fn(),
        onPolling: vi.fn(),
        onAuthenticated: vi.fn(),
      };

      // Capture the rejection immediately to avoid unhandled rejection
      let caughtError: Error | undefined;
      const loginPromise = login(callbacks)
        .catch((e: Error) => { caughtError = e; });

      await vi.advanceTimersByTimeAsync(6000);
      await loginPromise;

      expect(caughtError).toBeDefined();
      expect(caughtError!.message).toContain('GitHub login failed');
    });
  });
});
