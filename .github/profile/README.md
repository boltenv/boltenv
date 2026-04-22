<p align="center">
  <img src="https://boltenv.dev/boltenv.png" alt="boltenv" width="100" />
</p>

<h1 align="center">boltenv</h1>
<h3 align="center">Stop Slacking your secrets. Start shipping.</h3>

<p align="center">
  <b>Encrypted environment variable sharing for developer teams.</b><br />
  Push and pull <code>.env</code> files through GitHub — end-to-end encrypted, zero config.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@boltenv.dev/cli"><img src="https://img.shields.io/npm/v/@boltenv.dev/cli?color=F0A030&label=npm" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@boltenv.dev/cli"><img src="https://img.shields.io/npm/dm/@boltenv.dev/cli?color=F0A030&label=downloads" alt="npm downloads" /></a>
  <a href="https://github.com/boltenv/boltenv/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-FSL--1.1--MIT-blue" alt="license" /></a>
  <a href="https://github.com/boltenv/boltenv/stargazers"><img src="https://img.shields.io/github/stars/boltenv/boltenv?style=social" alt="GitHub stars" /></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/join-the-waitlist-boltenv?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-join-the-waitlist-boltenv" target="_blank" rel="noopener noreferrer"><img alt="Join the Waitlist — boltenv - Airdrop for Developers | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1115278&amp;theme=light&amp;t=1775638256387"></a>
</p>

---

### The problem

Your `.env` file is the most critical file in your project — and your team shares it over Slack DMs, pinned messages, and screenshots.

Your code goes through PRs, CI/CD, linting, and code review. Your secrets? Copy-paste and pray.

### The fix

```bash
npm i -g @boltenv.dev/cli

boltenv login          # Authenticate via GitHub
boltenv push           # Encrypt locally, upload ciphertext
boltenv pull           # Download ciphertext, decrypt locally
```

New developer onboarding: **45 minutes → 45 seconds.**

### How it works

```
Your Machine                 boltenv Cloud                Teammate's Machine
┌──────────┐                ┌──────────────┐              ┌──────────┐
│ .env file │── AES-256 ──> │  Encrypted   │── Decrypt ──>│ .env file│
│ plaintext │   locally     │  blob only   │   locally    │ plaintext│
└──────────┘                └──────────────┘              └──────────┘
                                   │
                         Server never sees plaintext.
```

- **AES-256-GCM** encryption — secrets encrypted on your machine before upload
- **GitHub auth** — if you can `git push`, you can `boltenv push`. No new accounts.
- **Branch-aware** — `main` pulls production, `develop` pulls development. Automatic.
- **Version history** — every push is versioned. Roll back anytime.
- **Zero infrastructure** — no servers to manage, no config to maintain

### Key features

- **Push & pull** encrypted `.env` files across your team
- **GitHub-native authentication** — access follows repo permissions
- **Branch → environment mapping** — auto-detects the right environment
- **Version history & rollback** — audit trail for every change
- **TTL expiration** — temporary secrets auto-delete
- **CI/CD support** — pull secrets in GitHub Actions, Vercel builds, any pipeline
- **Multi-file support** — handle `.env.backend`, `.env.frontend`, `.env.db` separately
- **Multiple output formats** — dotenv, JSON, shell exports, stdout pipe

### Pricing

| | Free | Pro | Enterprise |
|---|:---:|:---:|:---:|
| Price | $0 | $12/user/mo | Custom |
| Team members | 5 | Unlimited | Unlimited |
| Environments | 3/repo | Unlimited | Unlimited |
| Version history | 10 | 50 | Custom |
| SSO/SAML | — | — | Yes |
| Self-hosted | — | — | Yes |

### Links

- [Website](https://boltenv.dev) — Product overview and documentation
- [Documentation](https://boltenv.dev/docs) — Setup guides and API reference
- [npm](https://www.npmjs.com/package/@boltenv.dev/cli) — Install the CLI
- [GitHub](https://github.com/boltenv/boltenv) — Source code and issues
- [Security](https://boltenv.dev/security) — Encryption model and threat analysis

---

<p align="center">
  <b>boltenv</b> — Because your secrets deserve better than a Slack DM.
</p>
