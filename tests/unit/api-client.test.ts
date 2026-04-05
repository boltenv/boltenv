import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient } from '../../src/core/api-client.js';
import type { ApiClient } from '../../src/core/api-client.js';
import type { EncryptedBlob, PullResponse, LsResponse, WhoamiResponse, PushResponse, PushRequest } from '../../src/types/index.js';

const BASE_URL = 'https://boltenv.test.app';
const TOKEN = 'gho_test_token';
const REPO = 'owner/repo';

const TEST_BLOB: EncryptedBlob = {
  version: 1,
  envelope: {
    version: 1,
    iv: 'bFjV9FPpu8n/oEc2',           // 12 bytes
    authTag: 'UTJidcU2wFa3pPE91KzOSQ==', // 16 bytes
    ciphertext: 'Cyx87Ovdx2MiC9xell5mtTFbmZ0=',
  },
  encryptedAt: '2025-01-01T00:00:00.000Z',
  pushedBy: 'user@host',
  environment: 'development',
};

function createMockFetch(responseBody: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => responseBody,
  });
}

describe('api-client', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = createApiClient({ baseUrl: BASE_URL, token: TOKEN, repo: REPO });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('push', () => {
    it('should send POST /api/push with correct headers and body', async () => {
      const mockResponse: PushResponse = { version: 1, expiresAt: '2025-01-08T00:00:00.000Z' };
      const mockFetch = createMockFetch(mockResponse);
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.push({
        blob: TEST_BLOB,
        keyFingerprint: 'abc123',
        environment: 'development',
        ttlSeconds: 604800,
        keys: ['DB_HOST', 'DB_PORT'],
      });

      expect(result.version).toBe(1);
      expect(result.expiresAt).toBeDefined();

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/push`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${TOKEN}`,
            'X-Boltenv-Repo': REPO,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should handle push without TTL', async () => {
      const mockResponse: PushResponse = { version: 2 };
      vi.stubGlobal('fetch', createMockFetch(mockResponse));

      const result = await client.push({
        blob: TEST_BLOB,
        keyFingerprint: 'abc123',
        environment: 'production',
      });

      expect(result.version).toBe(2);
      expect(result.expiresAt).toBeUndefined();
    });
  });

  describe('pull', () => {
    it('should send POST /api/pull and return decrypted data', async () => {
      const mockResponse: PullResponse = {
        blob: TEST_BLOB,
        keyFingerprint: 'abc123testfinger',
        version: 3,
        metadata: {
          keyCount: 2,
          pushedBy: 'user@host',
          encryptedAt: '2025-01-01T00:00:00.000Z',
          environment: 'development',
        },
      };
      vi.stubGlobal('fetch', createMockFetch(mockResponse));

      const result = await client.pull({ environment: 'development' });
      expect(result.blob).toEqual(TEST_BLOB);
      expect(result.version).toBe(3);
      expect(result.keyFingerprint).toBe('abc123testfinger');
    });

    it('should request a specific version', async () => {
      const mockResponse: PullResponse = {
        blob: TEST_BLOB,
        keyFingerprint: 'abc123testfinger',
        version: 2,
        metadata: {
          keyCount: 2,
          pushedBy: 'user@host',
          encryptedAt: '2025-01-01T00:00:00.000Z',
          environment: 'development',
        },
      };
      const mockFetch = createMockFetch(mockResponse);
      vi.stubGlobal('fetch', mockFetch);

      await client.pull({ environment: 'development', version: 2 });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.version).toBe(2);
    });
  });

  describe('ls', () => {
    it('should send POST /api/ls and return metadata', async () => {
      const mockResponse: LsResponse = {
        metadata: {
          keyCount: 5,
          pushedBy: 'user@host',
          encryptedAt: '2025-01-01T00:00:00.000Z',
          environment: 'production',
        },
        versions: [
          { version: 3, pushedBy: 'user@host', encryptedAt: '2025-01-03T00:00:00.000Z', keyCount: 5 },
          { version: 2, pushedBy: 'user@host', encryptedAt: '2025-01-02T00:00:00.000Z', keyCount: 4 },
          { version: 1, pushedBy: 'user@host', encryptedAt: '2025-01-01T00:00:00.000Z', keyCount: 3 },
        ],
        ttlRemaining: null,
      };
      vi.stubGlobal('fetch', createMockFetch(mockResponse));

      const result = await client.ls({ environment: 'production' });
      expect(result.metadata.keyCount).toBe(5);
      expect(result.versions).toHaveLength(3);
      expect(result.ttlRemaining).toBeNull();
    });
  });

  describe('whoami', () => {
    it('should send GET /api/whoami', async () => {
      const mockResponse: WhoamiResponse = { user: 'testuser', repo: 'owner/repo' };
      const mockFetch = createMockFetch(mockResponse);
      vi.stubGlobal('fetch', mockFetch);

      const result = await client.whoami();
      expect(result.user).toBe('testuser');
      expect(result.repo).toBe('owner/repo');

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/api/whoami`,
        expect.objectContaining({
          method: 'GET',
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should throw apiUnauthorized for 401', async () => {
      vi.stubGlobal('fetch', createMockFetch(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        401,
      ));

      await expect(client.whoami()).rejects.toThrow('Authentication failed');
    });

    it('should throw apiForbidden for 403', async () => {
      vi.stubGlobal('fetch', createMockFetch(
        { error: 'Forbidden', code: 'FORBIDDEN' },
        403,
      ));

      await expect(client.whoami()).rejects.toThrow('do not have access');
    });

    it('should throw noRemoteData for 404', async () => {
      vi.stubGlobal('fetch', createMockFetch(
        { error: 'Not found', code: 'NOT_FOUND', hint: 'development' },
        404,
      ));

      await expect(
        client.pull({ environment: 'development' }),
      ).rejects.toThrow('No data found');
    });

    it('should throw apiRequestFailed for 500', async () => {
      vi.stubGlobal('fetch', createMockFetch(
        { error: 'Internal server error', code: 'SERVER_ERROR' },
        500,
      ));

      await expect(client.whoami()).rejects.toThrow('API request failed');
    });

    it('should throw apiTimeout on timeout', async () => {
      const timeoutError = new DOMException('The operation was aborted', 'TimeoutError');
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError));

      await expect(client.whoami()).rejects.toThrow('API request timed out');
    });

    it('should throw apiRequestFailed on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

      await expect(client.whoami()).rejects.toThrow('API request failed');
    });
  });
});
