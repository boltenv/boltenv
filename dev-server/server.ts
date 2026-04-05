/**
 * Mock dev server for boltenv CLI development.
 * Provides fake API responses so contributors can test without the real backend.
 *
 * Usage:
 *   npx tsx dev-server/server.ts
 *   BOLTENV_API_URL=http://localhost:4040 boltenv push
 *
 * NOTE: This is a zero-knowledge mock. The server stores encrypted blobs
 * and key fingerprints, but NEVER the encryption key itself. This mirrors
 * the production architecture.
 */

import http from 'node:http';

const PORT = 4040;

interface StoredEntry {
  readonly blob: string;
  readonly keyFingerprint: string;
  readonly keySalt?: string;
  readonly meta: string;
}

// In-memory storage
const store: Record<string, StoredEntry> = {};
const versions: Record<string, number> = {};

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Boltenv-Repo, Content-Type',
  });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

function getRepo(req: http.IncomingMessage): string {
  return req.headers['x-boltenv-repo'] as string ?? 'mock/repo';
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    json(res, 204, null);
    return;
  }

  // Validate auth header exists (don't validate token — it's a mock)
  const auth = req.headers['authorization'];
  if (!auth && !url.startsWith('/api/version')) {
    json(res, 401, { error: 'Missing Authorization header.', code: 'UNAUTHORIZED' });
    return;
  }

  try {
    // POST /api/push
    if (url === '/api/push' && method === 'POST') {
      const body = await readBody(req) as Record<string, unknown>;
      const repo = getRepo(req);
      const env = body['environment'] as string;
      const vKey = `${repo}:${env}`;
      const ver = (versions[vKey] ?? 0) + 1;
      versions[vKey] = ver;
      store[`${vKey}:v${ver}`] = {
        blob: JSON.stringify(body['blob']),
        keyFingerprint: body['keyFingerprint'] as string,
        keySalt: body['keySalt'] as string | undefined,
        meta: JSON.stringify({
          keyCount: (body['keys'] as string[])?.length ?? 0,
          pushedBy: 'dev@localhost',
          encryptedAt: new Date().toISOString(),
          environment: env,
          keys: body['keys'] ?? [],
        }),
      };
      json(res, 200, { version: ver });
      console.log(`  POST /api/push → ${vKey} v${ver} (fingerprint: ${body['keyFingerprint']})`);
      return;
    }

    // POST /api/pull
    if (url === '/api/pull' && method === 'POST') {
      const body = await readBody(req) as Record<string, unknown>;
      const repo = getRepo(req);
      const env = body['environment'] as string;
      const vKey = `${repo}:${env}`;
      const ver = (body['version'] as number) ?? versions[vKey] ?? 0;
      const data = store[`${vKey}:v${ver}`];
      if (!data) {
        json(res, 404, { error: `No data for "${env}".`, code: 'NOT_FOUND', hint: env });
        return;
      }
      json(res, 200, {
        blob: JSON.parse(data.blob),
        keyFingerprint: data.keyFingerprint,
        keySalt: data.keySalt,
        version: ver,
        metadata: JSON.parse(data.meta),
      });
      console.log(`  POST /api/pull → ${vKey} v${ver}`);
      return;
    }

    // POST /api/ls
    if (url === '/api/ls' && method === 'POST') {
      const body = await readBody(req) as Record<string, unknown>;
      const repo = getRepo(req);
      const env = body['environment'] as string;
      const vKey = `${repo}:${env}`;
      const latest = versions[vKey] ?? 0;
      const data = store[`${vKey}:v${latest}`];
      const meta = data ? JSON.parse(data.meta) : { keyCount: 0, pushedBy: '-', encryptedAt: '-', environment: env };
      const versionList = [];
      for (let i = latest; i >= Math.max(1, latest - 9); i--) {
        const d = store[`${vKey}:v${i}`];
        if (d) {
          const m = JSON.parse(d.meta);
          versionList.push({ version: i, keyCount: m.keyCount, pushedBy: m.pushedBy, encryptedAt: m.encryptedAt });
        }
      }
      json(res, 200, { metadata: meta, versions: versionList, ttlRemaining: null });
      return;
    }

    // GET /api/whoami
    if (url === '/api/whoami' && method === 'GET') {
      json(res, 200, { user: 'dev-user', repo: getRepo(req) });
      return;
    }

    // GET /api/account
    if (url === '/api/account' && method === 'GET') {
      json(res, 200, {
        user: 'dev-user',
        plan: 'free',
        createdAt: new Date().toISOString(),
        usage: { pushes: 0, pushLimit: 100, pulls: 0, pullLimit: 500, repos: 0, repoLimit: 3 },
      });
      return;
    }

    // GET /api/team
    if (url === '/api/team' && method === 'GET') {
      json(res, 200, { team: null, members: [], hint: 'Mock server — no team.' });
      return;
    }

    // POST /api/team/members
    if (url === '/api/team/members' && method === 'POST') {
      const body = await readBody(req) as Record<string, unknown>;
      json(res, 200, { message: `Added ${body['githubUser']} as ${body['role'] ?? 'member'}.` });
      return;
    }

    // DELETE /api/team/members/:user
    if (url.startsWith('/api/team/members/') && method === 'DELETE') {
      const user = decodeURIComponent(url.split('/').pop() ?? '');
      json(res, 200, { message: `Removed ${user}.` });
      return;
    }

    // POST /api/billing/checkout
    if (url === '/api/billing/checkout' && method === 'POST') {
      json(res, 200, { url: 'https://checkout.stripe.com/mock-session' });
      return;
    }

    // GET /api/version
    if (url === '/api/version' && method === 'GET') {
      json(res, 200, { latest: '3.2.0' });
      return;
    }

    json(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error('  Error:', err);
    json(res, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log(`  ⚡ boltenv dev server running on http://localhost:${PORT}`);
  console.log('  Zero-knowledge mode: encryption keys never stored server-side.');
  console.log('');
  console.log('  Usage:');
  console.log(`    BOLTENV_API_URL=http://localhost:${PORT} boltenv push`);
  console.log('');
});
