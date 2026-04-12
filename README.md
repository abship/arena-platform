# arena-platform

Arena.gg — a Roblox-style platform where anyone can build, publish, and profit from real-money competitive games. Players compete in io-games, battle royales, card games, casino games, and puzzle duels. Third-party developers build games via the Arena SDK and earn 30% of rake. Platform handles wallets, KYC, matchmaking, anti-cheat, and licensing.

## Current Status

**Phase:** Phase 1 — Platform Core (starting)
**Last updated:** 2026-04-11
**Build status:** Scaffolding in place. Ready to start packages/shared/.

## What's Built

- Monorepo scaffolding (Turborepo, npm workspaces, TypeScript strict)
- Agent instruction files: CLAUDE.md, AGENTS.md
- Agent filters in .claude/ and .codex/
- Git remote pointed at abship/arena-platform, main branch tracking

## In Progress

- Claude Code: (none — about to start packages/shared/)
- Codex: idle during Phase 1 (per CLAUDE.md Stage 1 territory rules)

## Next Up

1. packages/shared/ — all TypeScript tyerfaces, enums, constants, error classes (Claude Code)
2. packages/database/ — Prisma schema + migrations (Codex, after shared is done)
3. packages/wallet/ — double-entry bookkeeping (Claude Code)
4. packages/payments/ with FakePaymentProvider (Claude Code)
5. packages/kyc/ with FakeKYCProvider (Claude Code)
6. packages/geolocation/ with fake + MaxMind provider (Claude Code)
7. packages/matchmaking/ (Claude Code)
8. servers/api/ (Codex, Stage 2)
9. Integration test: signup → deposit → queue → match → play → payout

## Blockers

None.

## Business Infrastructure Status

### Entity & Legal

- **Care C-Corp via Stripe Atlas — formation complete
- **EIN:** received (CP 575 letter downloaded)
- **83(b) election:** filed by Atlas on 2026-04-10 via USPS certified mail, tracking 9207190235890900003860​7398, expected IRS delivery 2026-04-15, tracking screenshot saved
- **Bylaws, board consent, stock certificate:** completed via Atlas
- **Delaware franchise tax:** first payment due 2027-03-01
- **Foreign qualification in home state (California):** not yet filed, defer until revenue

### Domain & Email

- **Domain:** arenagaming.gg (owned)
- **Email / Workspace:** not yet set up (deferring Zoho Mail or Google Workspace until needed for vendor applications)
- **DNS:** at registrar, not yet on Cloudflare

### Banking

- **Mercury:** not usable (Mercury prohibits internet gaming in ToS)
- **Current plan:** operating on personal card during build phase; migrate to Arena.gg-owned business bank account (Relay, Grasshopper, or Chase) at launch prep, before applying to any payment processor. Pre-banking expensell be reimbursed as founder loan per standard CPA process.
- **Stripe account from Atlas:** exists but unused — Stripe prohibits skill games with prizes, will not be used for player payments

### Accounts Active Now

- Claude Max 20x — active, powering Claude Code
- ChatGPT Pro — active, powering Codex CLI
- Cursor Pro — active (IDE)
- V0 Premium — active (MCP connected)
- GitHub — active (abship/arena-platform private repo)
- Supabase — free tier, active
- Railway — free tier, active (beta deploy target)
- Helius — active (Solana RPC key in password manager)
- MCP servers connected in Cursor: v0-mcp, github, supabase

### Accounts Deferred (Signup On Ad-Hoc Basis When Needed)

Sign up in the moment the agent needs the API key during integration. No point signing up early.

- **MaxMind GeoLite2** — sign up when building packages/geolocation/ real provider
- **Sentry** — sign up when deploying beta and wanting real error monitoring
- **PostHog** — sign up when building the website andesend** — sign up when building real transactional email (verification, match notifications)
- **Cloudflare** — sign up when moving DNS for arenagaming.gg before beta deploy
- **Fly.io** — sign up at production deploy time (beta stays on Railway)
- **Upstash Redis** — sign up when in-memory queues need to survive server restarts
- **Coinbase personal + Commerce** — sign up at payment integration time
- **NOWPayments** — sign up at payment integration time
- **Bitwarden or 1Password** — set up a password manager immediately, before account count grows

### Accounts Deferred Until Post-Beta (Need Working Product to Apply)

- **BitPay merchant** — after beta works with fake money, needs business bank account
- **Paysafe, Nuvei, Finix** — after beta, card processors want to see live product
- **Jumio** — after beta, KYC vendor wants integration context
- **GeoComply, Xpoint** — after gaming license application started, enterprise sales
- **Elliptic** — when processing real crypto volume
ze CPA** — when real expenses justify bookkeeping
- **Ifrah Law, Walters Law Group intro calls** — after beta deployed, when there's a product to describe
- **Business bank account (Relay / Grasshopper / Chase)** — at launch prep before applying to payment processors

### Licensing (Post-Beta, Phased)

- **US skill-gaming attorney opinion letter** ($5–15K) — after beta, before US launch
- **Curaçao license** (~$14K, 6–10 weeks) — after beta, covers ~80% of global market
- **Malta MGA** ($200K+, 6–12 months) — after Curaçao approved
- **Isle of Man** (£5–50K, 3–6 months) — parallel to Malta
- **UKGC** (£150K+, 6–12 months) — after Isle of Man
- **US state gambling licenses** — when Tier 1/2 US revenue justifies
- **Gaming lab cert (GLI or BMM)** — required before Curaçao, start conversation post-beta

## Key Decisions

- **2026-04-09:** Tech stack locked per CLAUDE.md. Fake-then-swap architecture for all external providers.
- **2026-04-09:** Phased build plan — Claude C 1 (Days 1–10); both agents in opposite zones from Phase 2 onward.
- **2026-04-11:** 83(b) filed by Atlas. EIN received. Formation complete.
- **2026-04-11:** Mercury rejected as banking option — Mercury ToS prohibits gaming. Banking decision deferred to launch prep.
- **2026-04-11:** Account signup strategy = ad-hoc, in the moment each integration needs the API key. No premature signups.
- **2026-04-11:** Build order = games against fakes → payment processors → website → geolocation → premium infrastructure → gaming licenses. Solo-founder ship-first sequencing.

## Notes

- Planning happens in claude.ai chats (within the Arena.gg project). Execution happens in Cursor terminal with Claude Code and Codex. README.md is the living memory between planning chats and agent sessions.
- All code goes through Cursor agents so they can test locally before pushing. Planning chats only edit text files (this README, ARENA-GG-INFO-FILE) via GitHub connector when needed.
- Territory rules per CLAUDE.md "Dual-Agent Coordination" section are strictly enforced.
