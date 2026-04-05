# boltenv — Team Overview

**Version**: 3.1.0
**Status**: Live (boltenv.dev)
**License**: FSL-1.1-MIT (open-source CLI, hosted backend)

---

## What Is boltenv?

boltenv is a CLI that lets developers **push and pull `.env` files** across machines and teammates — encrypted end-to-end, authenticated via GitHub, zero infrastructure.

**One-liner**: AirDrop for `.env` files.

```
Developer A                boltenv Cloud              Developer B
┌──────────┐             ┌──────────────┐            ┌──────────┐
│ .env file │── encrypt ──│  ciphertext  │── decrypt ──│ .env file│
└──────────┘   locally    └──────────────┘   locally   └──────────┘
                                 │
                     Server never sees plaintext.
```

---

## Core Problem We Solve

Every dev team shares `.env` files insecurely — Slack DMs, pinned messages, emails, screenshots. Meanwhile the actual code goes through PRs, CI/CD, code review...

**Secrets get zero process.** That's what we fix.

| Before boltenv | After boltenv |
|----------------|---------------|
| "Hey can you Slack me the .env?" | `boltenv pull` |
| New hire waits 45 min for someone to respond | New hire runs one command, done in 45 sec |
| "Who changed the Stripe key?" — nobody knows | `boltenv ls` — full audit trail |
| .env.example with fake values and a prayer | Real secrets, encrypted, versioned, synced |
| "Works on my machine" — stale env | Everyone pulls the same env. Always fresh. |

---

## Architecture

```
┌─────────────────────────────────────────┐
│              CLI (TypeScript)            │
│                                         │
│  • AES-256-GCM encryption (local)       │
│  • GitHub Device Flow auth              │
│  • Git branch detection                 │
│  • Zod validation on all I/O            │
│  • Commander.js CLI framework           │
└──────────────────┬──────────────────────┘
                   │ HTTPS (encrypted blob only)
                   ▼
┌─────────────────────────────────────────┐
│         API (Next.js on Vercel)         │
│                                         │
│  • Validates GitHub token per request   │
│  • Verifies repo access via GitHub API  │
│  • Never sees plaintext secrets         │
│  • Never stores encryption keys         │
│  • Endpoints: push, pull, ls, whoami    │
│  • Billing: LemonSqueezy webhooks       │
│  • Account DB: Drizzle + libSQL (Turso) │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│          Storage (Upstash Redis)        │
│                                         │
│  • Stores encrypted blobs only          │
│  • TTL-based auto-expiration            │
│  • Up to 50 versions per repo+env       │
│  • Serverless — zero ops                │
└─────────────────────────────────────────┘
```

**Key principle**: Encryption happens on the developer's machine. The server is a dumb relay for ciphertext. Even a full backend breach exposes nothing useful.

---

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| **CLI** | TypeScript, Commander.js, Zod | Type-safe, battle-tested CLI framework |
| **Encryption** | Node.js `crypto` (AES-256-GCM) | No dependencies. Fresh key + IV per push. |
| **Auth** | GitHub OAuth Device Flow | No passwords, no new accounts, access tied to repo |
| **API** | Next.js App Router (Vercel) | API routes + landing page in one deploy |
| **Database** | Drizzle ORM + libSQL (Turso) | Accounts, plans, usage tracking |
| **Blob storage** | Upstash Redis | Encrypted env blobs + TTL expiry |
| **Billing** | LemonSqueezy | Checkout, webhooks, subscription management |
| **Validation** | Zod v4 | Runtime validation on every API boundary |
| **UI** | Tailwind CSS v4, MUI icons | Landing page components |

---

## CLI Commands (Full Surface)

| Command | What It Does |
|---------|-------------|
| `boltenv login` | Authenticate via GitHub Device Flow |
| `boltenv logout` | Remove stored auth token |
| `boltenv push` | Encrypt `.env` locally → upload ciphertext |
| `boltenv pull` | Download ciphertext → decrypt locally → write `.env` |
| `boltenv dev` | Pull env + start dev server (from `.boltenv.yaml`) |
| `boltenv run -- <cmd>` | Pull env + inject into any command |
| `boltenv ls` | List versions, metadata, TTL, audit trail |
| `boltenv whoami` | Show GitHub user, detected repo, branch → environment |
| `boltenv account` | Show plan, usage limits, creation date |
| `boltenv team list` | List team members and roles |
| `boltenv team add <user>` | Add member (admin/member role) |
| `boltenv team remove <user>` | Revoke access |
| `boltenv upgrade` | Open billing portal |

---

## Feature Breakdown

### 1. Client-Side Encryption

```
Algorithm:  AES-256-GCM
Key:        256-bit random    → generated fresh per push
IV:         12 bytes random   → generated fresh per push
Auth Tag:   16 bytes          → GCM tamper detection
```

Plaintext never touches the network. Server stores `{ version, iv, authTag, ciphertext }` — all base64. Decryption only happens on the pulling developer's machine.

### 2. GitHub-Native Auth

- OAuth Device Flow (no client secret needed on CLI)
- Token stored locally at `~/.boltenv/auth.json` (mode 0o600)
- Every API request re-validates token against GitHub
- Repo access checked via GitHub API — if you can't `git push`, you can't `boltenv push`
- Revoke GitHub access → env access dies instantly. No separate revocation needed.

### 3. Branch-Aware Environment Detection

```
main / master   →  production
staging         →  staging
develop         →  development
*               →  development (fallback)
```

Auto-detected from `git rev-parse --abbrev-ref HEAD`. Configurable via `.boltenv.yaml`. No `--env` flags needed for standard workflows.

### 4. Version History

- Every push creates a new version (max 50 per repo+environment)
- Full metadata: key count, who pushed, when, from which machine
- Roll back to any version: `boltenv pull --version N`
- `boltenv ls` shows the full timeline

### 5. TTL Expiration

- Per-push TTL: `--ttl 24h`, `--ttl 7d`, `--ttl 30d`
- Default: permanent
- Redis handles auto-deletion
- Use case: contractor access, staging creds, temp tokens

### 6. Selective Push

`boltenv push --select` opens an interactive checkbox — pick exactly which keys to share.

### 7. Dev Server Integration

```yaml
# .boltenv.yaml
version: 2
defaultEnvironment: development
scripts:
  dev: npm run dev
  build: npm run build
  test: vitest run
```

`boltenv dev` = pull env + spawn process. Signal forwarding (SIGINT/SIGTERM). `--override` flag to override existing process vars.

### 8. Multiple Output Formats

- `--format dotenv` (default) → standard `.env` file
- `--format json` → `{ "KEY": "value" }` object
- `--format shell` → `export KEY=value` lines
- `--stdout` → pipe to anything (`grep`, `jq`, other tools)

---

## Security Model

| Layer | Protection |
|-------|-----------|
| **At rest** | AES-256-GCM ciphertext in Redis. No plaintext. No keys. |
| **In transit** | HTTPS (TLS 1.3). Payload is already encrypted before transport. |
| **Auth** | GitHub token validated on every request. No session cookies. |
| **Authorization** | GitHub repo access check. Can you clone? You can pull env. |
| **Tamper detection** | GCM auth tag. Modified ciphertext → decryption fails. |
| **Token storage** | `~/.boltenv/auth.json` with file mode 0o600 (owner-only read). |
| **Audit** | Every action logged: actor (`user@hostname`), timestamp, environment. |
| **Expiry** | TTL auto-deletes from Redis. No manual cleanup needed. |

**Threat model**: Full backend compromise → attacker gets base64 ciphertext. No keys, no plaintext, no GitHub tokens stored server-side.

---

## Pricing & Business Model

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0 forever | 5 members, 3 envs/repo, 10 versions |
| **Pro** | $12/user/mo | Unlimited members + envs, 50 versions, audit log, TTL, branch rules |
| **Enterprise** | Custom | SSO/SAML, self-hosted, SOC 2, SLA, custom retention |

**Model**: Open-source CLI builds trust. Hosted backend generates revenue. Free tier is generous enough to onboard and sticky.

---

## Competitive Position

| | boltenv | dotenv | 1Password CLI | HashiCorp Vault |
|--|---------|--------|---------------|-----------------|
| Setup | 60 seconds | N/A | 15 min | Hours |
| Encryption | Client-side AES-256 | None | Client-side | Server-side |
| Git integration | Auto branch map | None | None | Manual |
| Versioning | 50 per env | None | Varies | Varies |
| Infrastructure | Zero | Zero | Zero | Self-host or SaaS |
| Team sync | One command | Copy-paste | Dashboard | Dashboard |
| Price (small team) | Free | Free | $$$  | $$$ |

**We're not competing with Vault.** Vault is infrastructure-level secrets management for production systems. We're replacing the Slack DM. Different problem, different buyer, different price point.

---

## Project Structure

```
boltenv/
├── src/                    # CLI source (TypeScript)
│   ├── cli.ts              # Command registration (Commander.js)
│   ├── commands/           # push, pull, login, dev, run, ls, whoami, team, account
│   ├── core/               # crypto, auth, git, api-client, config
│   ├── types/              # All TypeScript interfaces (60+ types)
│   └── utils/              # Zod validators, formatters
├── web/                    # Landing page + API (Next.js)
│   ├── src/app/            # Pages + API routes
│   ├── src/components/     # Hero, Features, HowItWorks, Pricing, etc.
│   ├── src/lib/            # Redis, GitHub, DB, middleware
│   └── drizzle/            # Database schema + migrations
├── packages/
│   └── create-boltenv/     # npx create-boltenv scaffolding
├── .boltenv.yaml           # Config file spec
└── package.json            # @boltenv.dev/cli v3.1.0
```

---

## API Surface

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/push` | POST | GitHub token | Store encrypted blob |
| `/api/pull` | POST | GitHub token | Retrieve + return encrypted blob |
| `/api/ls` | POST | GitHub token | List versions + metadata |
| `/api/whoami` | GET | GitHub token | Verify identity + permissions |
| `/api/version` | GET | None | CLI version check |
| `/api/account` | GET | GitHub token | Plan, usage, limits |
| `/api/team` | GET/POST | GitHub token | Team CRUD |
| `/api/team/members` | GET/POST/DELETE | GitHub token | Member management |
| `/api/billing/checkout` | POST | GitHub token | Create LemonSqueezy checkout |
| `/api/billing/webhook` | POST | LemonSqueezy | Subscription events |
| `/api/waitlist` | POST | None | Email capture (when enabled) |

All endpoints validate via `X-Boltenv-Repo: owner/repo` header for repo-scoped operations.

---

## What's Shipped (v3.1)

- Full push/pull/ls/whoami/login/logout flow
- AES-256-GCM client-side encryption
- GitHub Device Flow auth
- Branch → environment auto-detection
- Version history (up to 50 per env)
- TTL-based secret expiration
- Selective push (interactive key picker)
- `boltenv dev` / `boltenv run` — env injection into processes
- Multiple output formats (dotenv, json, shell, stdout)
- Team management (list, add, remove)
- Account + plan tracking
- LemonSqueezy billing integration
- Landing page with Hero, Features, HowItWorks, Comparison, Pricing, FAQ, CTA
- Waitlist mode (toggle via env var)
- `create-boltenv` scaffolding package

---

## What's Next

Open for team discussion — but natural next steps based on current architecture:

- **CI/CD integration** — `boltenv pull` in GitHub Actions / Vercel builds
- **Diff on pull** — show what changed since last pull
- **Webhooks** — notify on push events (Slack, Discord)
- **RBAC refinement** — read-only members, env-scoped permissions
- **Self-hosted backend** — Docker image for enterprise customers
- **Homebrew + AUR distribution** — beyond npm
- **SDK** — programmatic access for build tools and scripts
