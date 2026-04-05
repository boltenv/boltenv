<p align="center">
  <img src="https://boltenv.dev/boltenv.png" alt="boltenv" width="120" />
</p>

<h1 align="center">boltenv</h1>
<h3 align="center">Stop Slacking your secrets. Start shipping.</h3>

<p align="center">
  <b>AirDrop for .env files</b> — push & pull environment variables through GitHub, encrypted end-to-end, zero config.
</p>

<p align="center">
  <a href="https://boltenv.dev">Website</a> ·
  <a href="https://www.npmjs.com/package/boltenv">npm</a> ·
  <a href="https://github.com/boltenv/boltenv">GitHub</a> ·
  <a href="https://docs.boltenv.dev">Docs</a>
</p>

---

## The Problem Every Team Has (But Nobody Talks About)

Your `.env` file is **the most important file in your project** and you're sharing it like it's a meme.

```
# How your team shares secrets today:

💀  "Hey can you Slack me the .env?"
💀  Pinned message in #dev from 2023 (half the keys are wrong)
💀  .env.example with fake values and a prayer
💀  "Just copy it from prod... carefully"
💀  Screenshot of a terminal. Yes, really.
```

Meanwhile, your actual code goes through PRs, CI/CD, code review, linting, testing...

**Your secrets? Copy-pasted in plaintext across Slack DMs.**

---

## The Fix: Two Commands. That's It.

```bash
# You set up the env
boltenv push

# Your teammate gets it
boltenv pull
```

**Done.** Encrypted on your machine. Decrypted on theirs. The server never sees plaintext. Ever.

---

## How It Works (30-Second Version)

```
  Your Machine                    boltenv Cloud                  Teammate's Machine
  ┌──────────┐                   ┌──────────────┐               ┌──────────────┐
  │ .env file │──► AES-256-GCM ──►│  Encrypted   │──► Decrypt ──►│  .env file   │
  │ (secrets) │    encryption     │  blob only   │    locally     │  (secrets)   │
  └──────────┘    on YOUR machine └──────────────┘               └──────────────┘
                                         │
                                  Never sees plaintext.
                                  Never stores keys.
                                  Never will.
```

1. **You push** → CLI encrypts locally with AES-256-GCM → uploads ciphertext
2. **They pull** → CLI downloads ciphertext → decrypts locally
3. **Auth?** GitHub. If you have repo access, you have env access. No new accounts.

---

## Watch This

```bash
# Install
npm i -g boltenv

# Login with GitHub (one time, 10 seconds)
boltenv login
# → Opens browser → Enter code → Done

# See where you are
boltenv whoami
# ✓ Logged in as @anasahmad
# ✓ Repo: your-org/your-app
# ✓ Branch: main → production

# Push your env (encrypted before it leaves your machine)
boltenv push
# ✓ Encrypted 23 variables
# ✓ Pushed to production (v4)
# ✓ TTL: permanent

# New dev joins? One command:
boltenv pull
# ✓ Pulled production (v4)
# ✓ Decrypted 23 variables
# ✓ Written to .env

# Even better — pull AND start your dev server:
boltenv dev
# ✓ Pulled development env
# ✓ Starting: npm run dev
```

**New developer onboarding just went from 45 minutes to 45 seconds.**

---

## Why Developers Choose boltenv

### **Zero Trust by Default**

Your secrets are encrypted with **AES-256-GCM** before they leave your machine. The server stores ciphertext — it literally *cannot* read your secrets. Not us, not a breach, not a subpoena. Plaintext lives on developer machines. Period.

```
┌─────────────────────────────────────────────┐
│  Encryption: AES-256-GCM                    │
│  Key:        256-bit random (per push)      │
│  IV:         12 bytes random (per push)     │
│  Auth Tag:   16 bytes (tamper detection)    │
│  Server sees: base64 gibberish. That's it.  │
└─────────────────────────────────────────────┘
```

### **GitHub-Native Auth**

No new accounts. No API keys to manage. No SSO integration headaches.

If you can `git push`, you can `boltenv push`. Access follows your GitHub repo permissions automatically. Revoke someone's GitHub access → they lose env access. Instantly.

### **Branch-Aware Environments**

boltenv reads your git branch and maps it to the right environment:

```
main / master  →  production
staging        →  staging
develop        →  development
feature/*      →  development (default)
```

No flags needed. `boltenv pull` on `main` gives you production vars. Switch to `develop`, pull again — development vars. It just knows.

### **Version History & Audit Trail**

Every push is versioned. Every action is logged.

```bash
boltenv ls
# production (3 versions)
#   v3  23 keys  @anasahmad   2 hours ago    permanent
#   v2  21 keys  @teammate    3 days ago     permanent
#   v1  18 keys  @anasahmad   2 weeks ago    expired

# Need to rollback?
boltenv pull --version 2
```

When the CEO asks "who changed the Stripe key in production?" — you'll know.

### **Selective Push**

Don't want to push everything? Cherry-pick:

```bash
boltenv push --select
# ┌──────────────────────────────────┐
# │ Select variables to push:        │
# │                                   │
# │ ✓ DATABASE_URL                    │
# │ ✓ REDIS_URL                       │
# │ ✗ PERSONAL_API_KEY   (skipped)   │
# │ ✓ STRIPE_SECRET_KEY              │
# └──────────────────────────────────┘
```

### **Multiple Output Formats**

```bash
boltenv pull                        # → .env file (default)
boltenv pull --format json          # → JSON object
boltenv pull --format shell         # → export KEY=value (source-able)
boltenv pull --stdout               # → pipe to anything
boltenv pull --stdout | grep DB_    # → filter on the fly
```

### **TTL Expiration**

Temporary secrets? Set a timer:

```bash
boltenv push --ttl 24h    # Gone in 24 hours
boltenv push --ttl 7d     # Gone in a week
boltenv push              # Permanent (default)
```

Perfect for staging credentials, demo keys, or temp API tokens.

### **Dev Server Integration**

Pull env + start your server in one shot:

```bash
boltenv dev              # pulls env → runs `npm run dev`
boltenv dev build        # pulls env → runs `npm run build`
boltenv run -- pytest    # pulls env → runs any command
```

Configure once in `.boltenv.yaml`:

```yaml
version: 2
defaultEnvironment: development
scripts:
  dev: npm run dev
  build: npm run build
  test: vitest run
```

---

## Built for Teams

```bash
# See your team
boltenv team list
# owner   @anasahmad
# admin   @sarah
# member  @mike
# member  @new-intern

# Add someone
boltenv team add @new-hire --role member

# Remove someone (they lose access immediately)
boltenv team remove @ex-employee
```

Access control that follows your GitHub org. No separate user database.

---

## The Comparison Nobody Asked For (But Here It Is)

| | **boltenv** | .env.example | 1Password CLI | HashiCorp Vault |
|---|:---:|:---:|:---:|:---:|
| **Setup time** | 30 sec | N/A | 15 min | 2 hours |
| **Client-side encryption** | **Yes** | No | Yes | No |
| **GitHub-native auth** | **Yes** | No | No | No |
| **Branch auto-detection** | **Yes** | No | No | No |
| **Version history** | **Yes** | No | Yes | Yes |
| **Team management** | **Yes** | No | Yes | Yes |
| **No infra to manage** | **Yes** | Yes | Yes | **No** |
| **Free tier** | **Yes** | Yes | No | Partial |
| **Open source CLI** | **Yes** | Yes | No | Yes |
| **Learning curve** | **Flat** | None | Medium | Steep |

**boltenv isn't replacing Vault for your production infrastructure.** It's replacing the Slack message.

---

## Security Model

```
┌─────────────────────────────────────────────────────────┐
│                     YOUR MACHINE                         │
│                                                          │
│  .env → AES-256-GCM encrypt → ciphertext + auth tag    │
│                                                          │
│  ✓ Fresh 256-bit key per push                           │
│  ✓ Fresh 12-byte IV per push                            │
│  ✓ GCM auth tag = tamper-proof                          │
│  ✓ Plaintext NEVER leaves this box                      │
└──────────────────────┬──────────────────────────────────┘
                       │ (only ciphertext travels)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   BOLTENV CLOUD                          │
│                                                          │
│  ✗ Cannot decrypt your secrets                          │
│  ✗ Does not store encryption keys                       │
│  ✗ Does not store GitHub tokens                         │
│  ✓ Validates GitHub repo access per request             │
│  ✓ Stores encrypted blobs only                          │
│  ✓ Auto-deletes on TTL expiry                           │
└─────────────────────────────────────────────────────────┘
```

**Threat model**: Even if our entire backend is compromised, your secrets remain encrypted. The attacker gets base64 noise.

---

## Pricing

| | **Free** | **Pro** | **Enterprise** |
|---|:---:|:---:|:---:|
| **Price** | $0 | $12/user/mo | Custom |
| Team members | 5 | Unlimited | Unlimited |
| Environments | 3/repo | Unlimited | Unlimited |
| Version history | 10 | 50 | Custom |
| Branch mapping | Default | Custom rules | Custom rules |
| Audit log | - | Full | Full + export |
| TTL expiration | - | Yes | Yes |
| SSO/SAML | - | - | Yes |
| Self-hosted | - | - | Yes |
| Support | Community | Priority | Dedicated |

**Free tier is real.** No credit card. No trial expiry. 5 devs, 3 environments, works forever.

---

## Get Started in 30 Seconds

```bash
npm i -g boltenv
boltenv login
boltenv push
```

That's it. Your team's `.env` nightmare is over.

---

<p align="center">
  <b>boltenv</b> — Because your secrets deserve better than a Slack DM.
</p>

<p align="center">
  <a href="https://boltenv.dev">boltenv.dev</a>
</p>
