# arena-platform

Arena.gg — a Roblox-style platform where anyone can build, publish, and profit from real-money competitive games. Players compete in io-games, battle royales, card games, casino games, and puzzle duels. Third-party developers build games via the Arena SDK and earn 30% of rake. Platform handles wallets, KYC, matchmaking, anti-cheat, and licensing.

## Current Status

**Phase:** Phase 1 — Platform Core (starting)
**Last updated:** 2026-04-11
**Build status:** packages/shared/, packages/database/, and packages/wallet/ complete. Codex audit fixes applied.

## What's Built

- Monorepo scaffolding (Turborepo, npm workspaces, TypeScript strict)
- Agent instruction files: CLAUDE.md, AGENTS.md
- Agent filters in .claude/ and .codex/
- Git remote pointed at abship/arena-platform, main branch tracking
- packages/shared/ — types, interfaces, enums, constants, errors (all service contracts)
- packages/database/ — Prisma schema, migrations scaffolding, seed script, client singleton
- packages/wallet/ — double-entry bookkeeping with idempotency, rake as first-class transaction, and pre-provisioned system-wallet accounting (Codex-audited)

## In Progress

- Wallet fixes complete; awaiting Codex re-audit of fixes.
- Codex: idle — ready for Stage 2 (servers/api/)

## Next Up

1. Codex re-audit of wallet fixes
2. packages/payments/ with FakePaymentProvider (Claude Code)
3. packages/kyc/ with FakeKYCProvider (Claude Code)
4. packages/geolocation/ with fake + MaxMind provider (Claude Code)
5. packages/matchmaking/ (Claude Code)
6. servers/api/ (Codex, Stage 2)
7. Integration test: signup → deposit → queue → match → play → payout

## Blockers

None.

## Business Infrastructure Status

### Entity & Legal

- **C-Corp:** Delaware C-Corp via Stripe Atlas — formation complete
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
- **Current plan:** operating on personal card during build phase; migrate to Arena.gg-owned business bank account (Relay, Grasshopper, or Chase) at launch prep, before applying to any payment processor. Pre-banking expenses will be reimbursed as founder loan per standard CPA process.
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
- **PostHog** — sign up when building the website and wanting analytics
- **Resend** — sign up when building real transactional email (verification, match notifications)
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
- **Bench, Pilot, or Kruze CPA** — when real expenses justify bookkeeping
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
- **2026-04-09:** Phased build plan — Claude Code builds platform core alone in Phase 1 (Days 1–10); both agents in opposite zones from Phase 2 onward.
- **2026-04-11:** 83(b) filed by Atlas. EIN received. Formation complete.
- **2026-04-11:** Mercury rejected as banking option — Mercury ToS prohibits gaming. Banking decision deferred to launch prep.
- **2026-04-11:** Account signup strategy = ad-hoc, in the moment each integration needs the API key. No premature signups.
- **2026-04-11:** Build order = games against fakes → payment processors → website → geolocation → premium infrastructure → gaming licenses. Solo-founder ship-first sequencing.
- **2026-04-11:** `packages/database/` uses `BigInt` for all money columns to prevent overflow at scale; singleton Prisma client pattern; seed script populates 24 games and initial jurisdiction rules.
- **2026-04-11:** `packages/wallet/` uses SERIALIZABLE isolation level on all money-mutating Prisma transactions + optimistic locking via Wallet.version column (updateMany with version in WHERE, reject on 0 rows). Double-entry ledger enforced in code: every transaction creates balanced debit/credit LedgerEntry pairs, with invariant check before write. Fixed `workspace:*` → `*` in database package.json (npm compat).
- **2026-04-11:** Codex audit fixes: (1) Pre-provisioned system wallets via `WalletServiceImpl.create()` factory — no provisioning in hot-path transactions, eliminates cache-poisoning on rollback. Three system wallets: platform_suspense, match_pool, platform_revenue. (2) Double-sided balance updates — both user and system wallet balances update in every operation; match_pool checked for negative on awardPrize/collectRake. (3) Unique constraint on Transaction.referenceId for deposit idempotency + optional idempotencyKey on withdraw. (4) Rake as first-class TransactionType.RAKE via collectRake() (debit match_pool, credit platform_revenue). (5) Prisma error mapping via prisma-error-mapper.ts (P2002→ConflictError, P2025→NotFoundError, P2034→ConflictError), integer validation on amounts, pagination validation.

## Notes

- Planning happens in claude.ai chats (within the Arena.gg project). Execution happens in Cursor terminal with Claude Code and Codex. README.md is the living memory between planning chats and agent sessions.
- All code goes through Cursor agents so they can test locally before pushing. Planning chats only edit text files (this README, ARENA-GG-INFO-FILE) via GitHub connector when needed.
- Territory rules per CLAUDE.md "Dual-Agent Coordination" section are strictly enforced.
