<p align="center">
  <img src="https://boltenv.dev/boltenv.png" alt="boltenv" width="120" />
</p>

<h1 align="center">boltenv</h1>
<h3 align="center">Stop Slacking your secrets. Start shipping.</h3>

<p align="center">
  <b>AirDrop for .env files</b> — push & pull encrypted environment variables through GitHub. Zero config.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@boltenv.dev/cli"><img src="https://img.shields.io/npm/v/@boltenv.dev/cli?color=F0A030&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@boltenv.dev/cli"><img src="https://img.shields.io/npm/dm/@boltenv.dev/cli?color=F0A030&label=downloads" alt="npm downloads" /></a>
  <a href="https://github.com/boltenv/boltenv/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1--MIT-blue" alt="license" /></a>
  <a href="https://github.com/boltenv/boltenv/stargazers"><img src="https://img.shields.io/github/stars/boltenv/boltenv?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://boltenv.dev">Website</a> &middot;
  <a href="https://boltenv.dev/docs">Docs</a> &middot;
  <a href="https://www.npmjs.com/package/@boltenv.dev/cli">npm</a> &middot;
  <a href="https://github.com/boltenv/boltenv">GitHub</a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/join-the-waitlist-boltenv?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-join-the-waitlist-boltenv" target="_blank" rel="noopener noreferrer"><img alt="Join the Waitlist — boltenv - Airdrop for Developers | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1115278&amp;theme=light&amp;t=1775638256387"></a>
</p>

---

## Install

```bash
npm i -g @boltenv.dev/cli
```

Or via curl:

```bash
curl -fsSL https://boltenv.dev/install | sh
```

Requires Node.js 22+.

---

## Quick Start

```bash
# 1. Authenticate with GitHub
boltenv login

# 2. Push your .env (encrypted locally, uploaded as ciphertext)
boltenv push

# 3. Share the key with your teammate
boltenv key export
# → dGhpcyBpcyBhIDMyIGJ5dGUga2V5...

# Teammate imports the key and pulls
boltenv key import <base64-key>
boltenv pull
```

That's it. Your teammate now has the same `.env` — decrypted on their machine, never visible to the server.

---

## Why boltenv

Your `.env` is the most important file in your project, and you're sharing it via Slack DMs.

| What you do today | What happens |
|---|---|
| Slack the `.env` | Plaintext in a chat log forever |
| `.env.example` with fake values | Half the keys are wrong by Tuesday |
| Copy from prod "carefully" | Someone copies the wrong DB and deletes users |

**boltenv**: encrypted on your machine, decrypted on theirs. The server never sees plaintext.

---

## How It Works

```
  Your Machine                   boltenv Cloud                  Teammate's Machine
  ┌──────────┐                  ┌──────────────┐               ┌──────────────┐
  │ .env file │── AES-256-GCM ─>│  Encrypted   │── Decrypt ──>│  .env file   │
  │ (secrets) │   on YOUR       │  blob only   │   locally     │  (secrets)   │
  └──────────┘   machine        └──────────────┘               └──────────────┘
```

1. **Push** — CLI encrypts your `.env` locally, uploads only the ciphertext
2. **Pull** — CLI downloads ciphertext, decrypts locally with your key
3. **Auth** — GitHub repo access = env access. No new accounts.

---

## Commands

```bash
boltenv login                   # Authenticate with GitHub
boltenv push                    # Encrypt & upload your .env
boltenv pull                    # Download & decrypt .env
boltenv ls                      # Version history & metadata
boltenv whoami                  # Show current user & repo
```

### Push

```bash
boltenv push                    # Push .env from current directory
boltenv push .env.production    # Push a specific file
boltenv push -e production      # Push to a specific environment
boltenv push -y                 # Skip confirmation prompt
```

### Pull

```bash
boltenv pull                    # Pull .env to current directory
boltenv pull -e staging         # Pull from a specific environment
boltenv pull --version 3        # Pull a specific version (rollback)
boltenv pull --format json      # Output as JSON
boltenv pull --stdout           # Print to stdout (pipe anywhere)
```

### Version History

```bash
$ boltenv ls

  myorg/myapp:development

  Keys    12
  TTL     permanent
  Latest  alice pushed 5 min ago

   * v3               12 keys             alice            5 min ago
   . v2               10 keys             bob              2 days ago
   . v1                8 keys             alice            1 week ago
```

### Key Management

```bash
boltenv key export              # Get your key as base64 (share securely)
boltenv key import <base64>     # Import a teammate's key
boltenv key status              # Check if you have the key for this repo
```

---

## Environments

boltenv auto-detects the environment from your git branch:

| Branch | Environment |
|---|---|
| `main`, `master` | production |
| `staging` | staging |
| `develop`, `development` | development |
| anything else | development |

Override with `-e`:

```bash
boltenv push -e production
boltenv pull -e staging
```

---

## CI/CD

```bash
# Set these in your CI environment:
export BOLTENV_TOKEN=ghp_xxx           # GitHub PAT with repo scope
export BOLTENV_KEY=base64-key-here     # From: boltenv key export
export BOLTENV_REPO=myorg/myapp        # Skip git detection

# Pull in CI
boltenv pull -y
```

---

## Security

| | |
|---|---|
| **Encryption** | AES-256-GCM (NIST standard) |
| **Key derivation** | HKDF-SHA256 (separate subkeys for encryption and HMAC) |
| **IV** | 12 bytes, random per push |
| **Auth tag** | 16 bytes (tamper detection) |
| **Server sees** | Ciphertext + key fingerprint only |
| **Key stored at** | `~/.boltenv/keys/{owner}/{repo}.key` (0o600) |

The encryption key is generated locally and never transmitted. The server cannot decrypt your data.

---

## Requirements

- Node.js 22+
- Git repo with a GitHub remote
- GitHub account with repo access

---

<p align="center">
  <b>boltenv</b> — Because your secrets deserve better than a Slack DM.
</p>

<p align="center">
  <a href="https://boltenv.dev">boltenv.dev</a>
</p>
