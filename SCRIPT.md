# boltenv — Pitch Script

> **Format**: 3-minute product demo / launch video
> **Audience**: Developers, tech leads, DevOps engineers
> **Tone**: Sharp, direct, slightly irreverent. No corporate fluff. Talk like a dev to devs.

---

## COLD OPEN (0:00 – 0:20)

**[SCREEN: Dark terminal, cursor blinking]**

> Every codebase has one dirty secret.
>
> Not the spaghetti in `/utils`. Not the TODO from 2021.
>
> It's the `.env` file.
>
> The most critical file in your project — and you're sharing it
> over Slack like it's a lunch order.

**[SCREEN: Quick-cut montage — Slack DM with .env pasted, a pinned message from 2023, a screenshot of terminal output, an email with subject "here's the env"]**

---

## THE PROBLEM (0:20 – 0:50)

> Let's be honest. Your code goes through pull requests, CI pipelines,
> linting, type checking, code review...
>
> Your secrets? Copy. Paste. Pray.
>
> And when a new dev joins?

**[SCREEN: Terminal typing]**

```
"hey @sarah can you send me the .env?"
"which one?"
"the one for staging"
"I think mike has it"
"mike left last month"
```

> Forty-five minutes later, they're still not set up.
>
> This is broken. And everyone just... lives with it.

---

## THE FIX (0:50 – 1:20)

> **boltenv.** Two commands. That's the whole product.

**[SCREEN: Clean terminal, typing in real-time]**

```bash
$ boltenv push
```

**[SCREEN: Output animates line by line]**

```
Encrypting 23 variables (AES-256-GCM)...
✓ Pushed to acme/api:production (v4)
```

> Your `.env` just got encrypted on YOUR machine — AES-256-GCM,
> fresh key every push — and synced to the cloud.
>
> The server? It stores ciphertext. It literally CANNOT read your secrets.
> Not us. Not a breach. Not anyone.
>
> Now your teammate runs:

```bash
$ boltenv pull
```

```
⚡ 23 vars written to .env
```

> Done. Same secrets. Same machine-level encryption. Two seconds.
>
> New developer onboarding just went from 45 minutes to 45 seconds.

---

## AUTH (1:20 – 1:40)

> "But wait, what about auth? Do I need another account?"
>
> No. You already have one.

**[SCREEN: Terminal]**

```bash
$ boltenv login
```

```
Opening GitHub... enter code: ABCD-1234
✓ Logged in as @anasahmad
```

> GitHub IS the auth. If you can `git push`, you can `boltenv push`.
>
> Revoke someone's GitHub access? They lose env access. Instantly.
> No separate user database. No API keys to rotate. No admin panel to babysit.

---

## BRANCH AWARENESS (1:40 – 2:00)

> Here's where it gets good.
>
> boltenv reads your git branch.

**[SCREEN: Split terminal — two panes side by side]**

**Left pane:**
```bash
$ git branch
* main

$ boltenv pull
⚡ production — 23 vars written to .env
```

**Right pane:**
```bash
$ git checkout develop

$ boltenv pull
⚡ development — 18 vars written to .env
```

> `main` gives you production. `develop` gives you development.
> `staging` gives you staging.
>
> No flags. No config. It just knows.
>
> Switch branches. Pull. You're in the right environment. Every time.

---

## POWER FEATURES (2:00 – 2:30)

> And because we built this for developers, not dashboards...

**[SCREEN: Quick cuts, one feature per beat]**

**Version history:**
```bash
$ boltenv ls
  v4  23 keys  @anas      2 hours ago     permanent
  v3  21 keys  @sarah     3 days ago      permanent
  v2  18 keys  @anas      2 weeks ago     expired
```

> Every push is versioned. Roll back anytime.

**TTL expiration:**
```bash
$ boltenv push --ttl 24h
```

> Temporary secrets? Gone in 24 hours. Automatically.

**Selective push:**
```bash
$ boltenv push --select
  ✓ DATABASE_URL
  ✓ REDIS_URL
  ✗ MY_PERSONAL_KEY    (skipped)
  ✓ STRIPE_SECRET_KEY
```

> Cherry-pick what you share. Keep what's yours.

**Dev server integration:**
```bash
$ boltenv dev
  ⚡ Pulled development env
  ✓ Starting: npm run dev
```

> Pull secrets AND start your server. One command.

**Multiple formats:**
```bash
$ boltenv pull --format json     # JSON output
$ boltenv pull --format shell    # export KEY=value
$ boltenv pull --stdout | grep DB_   # pipe anywhere
```

> Output however you need it.

---

## SECURITY SLIDE (2:30 – 2:45)

**[SCREEN: Minimal diagram on dark background]**

```
  YOUR MACHINE              BOLTENV CLOUD           TEAMMATE
  ┌──────────┐            ┌──────────────┐        ┌──────────┐
  │ .env      │──AES-256──│ ██████████   │──────── │ .env     │
  │ plaintext │  encrypt  │ ciphertext   │ decrypt │ plaintext│
  └──────────┘  locally   └──────────────┘ locally └──────────┘
                                │
                         Never sees plaintext.
                         Never stores keys.
                         Never will.
```

> Zero trust by design. Even if our entire infrastructure gets popped,
> attackers get base64 noise.
>
> Your secrets stay yours.

---

## THE CLOSE (2:45 – 3:00)

**[SCREEN: Clean dark background, terminal centered]**

```bash
$ npm i -g boltenv
$ boltenv login
$ boltenv push
```

> Three commands. Your team's `.env` nightmare is over.
>
> Free for up to 5 developers. No credit card. No trial.
> Works forever.

**[SCREEN: Logo + URL fade in]**

> **boltenv** — Your secrets deserve better than a Slack DM.
>
> **boltenv.dev**

**[END]**

---

## OPTIONAL: EXTENDED DEMO SCENES

Use any of these as standalone clips for Twitter/X, LinkedIn, or docs.

### Scene: "The New Hire"

```bash
# Day 1. New developer. New machine. Zero context.

$ npm i -g boltenv
$ boltenv login
$ boltenv pull
⚡ 23 vars written to .env

$ npm run dev
✓ Server running on localhost:3000

# Time elapsed: 47 seconds.
# Time it used to take: "ask around and hope someone responds"
```

### Scene: "The Incident"

```bash
# CEO: "Who changed the Stripe key in production?"

$ boltenv ls --env production
  v6  24 keys  @intern    12 minutes ago   permanent   ← HERE
  v5  23 keys  @sarah     2 days ago       permanent
  v4  23 keys  @anas      1 week ago       permanent

# Found in 3 seconds.

$ boltenv pull --version 5
⚡ Rolled back to v5 — 23 vars written to .env

# Fixed in 5 more.
```

### Scene: "The Contractor"

```bash
# Give temporary access. No permanent keys. No loose ends.

$ boltenv push --ttl 7d --env staging
✓ Pushed staging (v2) — expires in 7 days

# 7 days later: automatically gone.
# No cleanup. No "did we revoke their access?" No drama.
```

### Scene: "The Env Drift"

```bash
# "Works on my machine" — because your .env is 3 weeks old.

$ boltenv pull
⚡ 23 vars written to .env
# Updated: DATABASE_URL, REDIS_URL, NEW_FEATURE_FLAG
# You now have the same env as everyone else. Instantly.
```

---

## B-ROLL / VISUAL NOTES

| Timestamp | Visual | Notes |
|-----------|--------|-------|
| 0:00–0:20 | Dark terminal, blinking cursor | Suspenseful. Minimal. |
| 0:20–0:50 | Slack screenshots, confused dev face | Comedy beats. Quick cuts. |
| 0:50–1:20 | Live terminal demo | Real commands, real output. No mockups. |
| 1:20–1:40 | GitHub device flow in browser | Show the actual OAuth flow |
| 1:40–2:00 | Split terminal — two branches | Side-by-side is the money shot |
| 2:00–2:30 | Rapid feature showcase | 1 feature = 1 beat. Fast pace. |
| 2:30–2:45 | Architecture diagram | Clean, minimal, dark background |
| 2:45–3:00 | Logo reveal | Calm energy. Confident close. |

## MUSIC / PACING

- **0:00–0:50**: Tension. Low synth. Problem buildup.
- **0:50–1:20**: Drop. Energy shift. "Here's the fix."
- **1:20–2:30**: Momentum. Feature showcase. Upbeat but controlled.
- **2:30–2:45**: Brief pause. Security = trust moment. Quieter.
- **2:45–3:00**: Resolve. Confident. Logo. Done.

## VOICE DIRECTION

- Talk TO developers, not AT them
- Use "you" and "your" — never "users" or "customers"
- Short sentences. Punch hard. Let the terminal do the talking.
- No superlatives ("revolutionary", "game-changing") — let the demo speak
- Slight humor is fine ("pray", "hope someone responds") but never cringe
- Cadence: fast during features, slow during security, confident at close
