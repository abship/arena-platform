# arena-platform

Arena.gg — a Roblox-style platform where anyone can build, publish, and profit from real-money competitive games. Players compete in io-games, battle royales, card games, casino games, and puzzle duels. Third-party developers build games via the Arena SDK and earn 30% of rake. Platform handles wallets, KYC, matchmaking, anti-cheat, and licensing.

## Current Status

**Phase:** Phase 1 — Platform Core
**Last updated:** 2026-04-12
**Build status:** packages/shared/, packages/database/, packages/wallet/, packages/payments/, packages/kyc/, packages/geolocation/, and packages/matchmaking/ complete and stable. Wallet approved after 3 Codex audit rounds. Matchmaking approved after 2 Codex audit rounds and is production-ready for Phase 1 integration.

## What's Built

- Monorepo scaffolding (Turborepo, npm workspaces, TypeScript strict)
- Agent instruction files: CLAUDE.md, AGENTS.md
- Agent filters in .claude/ and .codex/
- Git remote pointed at abship/arena-platform, main branch tracking
- packages/shared/ — types, interfaces, enums, constants, errors (all service contracts)
- packages/database/ — Prisma schema, migrations scaffolding, seed script, client singleton
- packages/wallet/ — double-entry bookkeeping with idempotency (Codex-audited through 3 review rounds), rake as first-class transaction, pre-provisioned system wallets, Prisma error mapping, unique referenceId constraint for duplicate-webhook protection
- packages/payments/ — FakePaymentProvider + PaymentProviderFactory, wired through WalletService for realistic deposit/withdraw effects; env-var gated (`PAYMENT_PROVIDER=fake`) for one-line swap to real providers post-beta
- packages/kyc/ — FakeKYCProvider + createKYCService factory, in-memory per-user verification state; configurable `rejectUserIds` set and `autoApproveToLevel` knobs for simulating realistic KYC outcomes in tests; env-var gated (`KYC_PROVIDER=fake`)
- packages/geolocation/ — FakeGeoProvider + injectable RulesSource; DEFAULT_RULES_SOURCE blocks 11 US states (AZ, AR, CT, DE, IA, LA, MT, SC, SD, TN, VT) and GB (no UKGC license). MaxMind provider NOT built yet — deferred pending ad-hoc signup; GeoComply will be its own package post-beta. Env-var gated (`GEO_PROVIDER=fake`)
- packages/matchmaking/ — InMemoryMatchmakingService: in-memory queue with per-(gameId, entryFeeCents) buckets, compensating-transaction createMatch with entry fee deduction and automatic refund on partial failure, idempotent resolveMatch (safe to retry), injectable PayoutCalculator map (WinnerTakesAll, BattleRoyaleTopThree, Coinflip), rake tier utility (under $1 = 10%, $1–$10 = 8%, over $10 = 5%), ELO K=32 with pairwise updates. Factory gated on `MATCHMAKING_PROVIDER` env var (default "in-memory"; Redis swap point documented). 74 tests, all passing. **Codex-audited (2 rounds). Production-ready for Phase 1 integration.**

## In Progress

- Claude Code: idle
- Codex: idle — ready to start `servers/api/` Stage 2

## Next Up

1. `servers/api/` (Codex, Stage 2)
2. `servers/websocket/` (Codex, Stage 3)
3. Integration test: signup → deposit → queue → match → play → payout

## Blockers

None currently.

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

- **MaxMind GeoLite2** — sign up when building MaxMindProvider. Interface is ready in packages/geolocation/; swap-in point is geo-service-factory.ts (single switch-case branch). Signup just unlocks the real provider implementation. See Deferred Integration Points → MaxMind GeoLite2 for swap steps.
- **Sentry** — sign up when deploying beta and wanting real error monitoring. See Deferred Integration Points → Sentry for swap steps.
- **PostHog** — sign up when building the website and wanting analytics. See Deferred Integration Points → PostHog for swap steps.
- **Resend** — sign up when building real transactional email (verification, match notifications). See Deferred Integration Points → Resend for swap steps.
- **Cloudflare** — sign up when moving DNS for arenagaming.gg before beta deploy. See Deferred Integration Points → Cloudflare for swap steps.
- **Fly.io** — sign up at production deploy time (beta stays on Railway)
- **Upstash Redis** — sign up when in-memory queues need to survive server restarts. See Deferred Integration Points → Upstash Redis for swap steps.
- **Coinbase personal + Commerce** — sign up at payment integration time. See Deferred Integration Points → Coinbase Commerce for swap steps.
- **NOWPayments** — sign up at payment integration time. See Deferred Integration Points → NOWPayments for swap steps.
- **Bitwarden or 1Password** — set up a password manager immediately, before account count grows

### Accounts Deferred Until Post-Beta (Need Working Product to Apply)

- **BitPay merchant** — after beta works with fake money, needs business bank account. See Deferred Integration Points → BitPay for swap steps.
- **Paysafe, Nuvei, Finix** — after beta, card processors want to see live product. See Deferred Integration Points → Paysafe and Nuvei for swap steps.
- **Jumio** — after beta, KYC vendor wants integration context. See Deferred Integration Points → Jumio for swap steps.
- **GeoComply** — separate package (fundamentally different shape: signed device assertions with client SDK, not IP lookup), required for licensed US states (NJ/PA/MI), post-beta only. Enterprise sales after gaming license application started. See Deferred Integration Points → GeoComply for swap steps.
- **Xpoint** — after gaming license application started, enterprise sales
- **Elliptic** — when processing real crypto volume. See Deferred Integration Points → Elliptic for swap steps.
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
- **2026-04-11:** Codex audit round 2 fixes: Pre-provisioned system wallets via factory, double-sided balance updates, unique constraint on Transaction.referenceId, rake as TransactionType.RAKE, Prisma error mapping.
- **2026-04-11:** Codex audit round 3 fixes: Idempotency user-mismatch protection (userId + type validation on existing transaction before returning it), P2002 race recovery (catch unique-violation on create, re-read winner, validate match), collectRake idempotency via optional idempotencyKey. Opportunistic: BigInt→String in error context, Number.isFinite guard, ConflictError documented as retryable in interface JSDoc. Approved with documented known issues below.
- **2026-04-12:** `packages/payments/` — FakePaymentProvider + PaymentProviderFactory. Fake provider delegates all balance mutations to WalletService via DI (no direct DB access). Factory gated on `PAYMENT_PROVIDER` env var (default "fake"); real providers (BitPay, Helius, Coinbase Commerce, NOWPayments, Paysafe) get added as new switch branches post-beta. 13 tests, all passing.
- **2026-04-12:** `packages/kyc/` — FakeKYCProvider + createKYCService factory. In-memory per-user verification state with configurable `rejectUserIds` (Set\<UserId\>) and `autoApproveToLevel` (default LEVEL_2) knobs for simulating realistic KYC approval/rejection in tests and integration flows. Age check computes from stored DOB. Factory gated on `KYC_PROVIDER` env var; Jumio gets added post-beta. 17 tests, all passing.
- **2026-04-12:** `packages/geolocation/` — shipped with FakeGeoProvider only; MaxMindProvider deferred pending signup (will be single-branch add to factory when done); GeoComply explicitly scoped as separate package post-beta due to fundamentally different shape (signed device assertions vs IP lookup); RulesSource injection pattern decouples jurisdiction policy from location lookup; blocked US state list (AZ, AR, CT, DE, IA, LA, MT, SC, SD, TN, VT) and GB baked into DEFAULT_RULES_SOURCE. 31 tests, all passing.
- **2026-04-12:** `packages/matchmaking/` — shipped with PayoutCalculator injection (no hardcoded money models), compensating refund on partial entry-fee failure, idempotent resolveMatch via status check, ELO K=32, in-memory queue with Redis swap point documented. 56 tests. Pending Codex audit — money-touching per project rule.
- **2026-04-12:** Matchmaking audit round 1: 2 critical / 6 major / 3 minor issues found. Fixed in-package: duplicate-result validation, actual/persisted payout return values, zero-rake handling, prior-rating/current-row ELO fixes, rating-failure tolerance, integer money guards, calculator player-count guards, and queue bucket pruning. Cross-package blocker: wallet `awardPrize` idempotency gap. Suspected issues A–F verdicts: A = confirmed blocker, B = partially present and fixed, C = not present, D = not present, E = not present, F = not present (edge tests added).
- **2026-04-12:** Wallet `awardPrize` idempotency fix landed (mirrors `collectRake` round-3 pattern exactly). Interface updated at packages/shared/ to accept optional `idempotencyKey` parameter; implementation in packages/wallet/ adds pre-create existence check with userId+type validation plus P2002 race recovery; matchmaking wires deterministic `prize-${matchId}-${userId}` keys through `resolveMatch`. This unblocks the matchmaking audit round 2.
- **2026-04-12:** Matchmaking audit round 2: verified the round-1 blocker is definitively closed. `resolveMatch` now passes deterministic `prize-${matchId}-${userId}` keys, wallet `awardPrize` returns existing transactions without re-mutating balances on duplicate keys/P2002 races, and no other production callers omit the key. One local retry-safety gap was found and fixed in-package: `resolveMatch` now flips `Match.status` to `RESOLVED` only after `MatchPlayer` rows and ratings work finish, so post-payout persistence failures remain retryable. Added direct multi-prize retry tests plus post-payout persistence retry coverage. Residual matchmaking known issues remain only: createMatch crash reconciliation, in-memory queue persistence, and flat ELO K-factor.

## Known Issues and Technical Debt

### Wallet Package
- **No multi-currency validation.** Wallet.currency field exists but isn't checked during money mutations. All operations assume USD. Safe while Arena.gg is USD-only; needs fix before supporting EUR/GBP/etc.
- **Mocked tests only.** The test suite uses a mocked Prisma client. Real race conditions, Prisma serialization failures, and Postgres constraint enforcement are not covered by automated tests. Needs real-database integration tests (docker-compose Postgres or testcontainers) before scaling to significant production volume.
- **Money type is Number, database is BigInt.** The shared Money type is a branded number. Safe up to ~$90 trillion (JavaScript safe integer max in cents). Change to BigInt end-to-end before Arena.gg could plausibly handle that kind of aggregate volume.
- **ConflictError retry is caller's responsibility.** The wallet package does not automatically retry on serialization failures or optimistic-lock mismatches. Callers must catch ConflictError and retry with their own backoff. Document this in API route handlers when servers/api/ is built.

### Matchmaking Package
- **createMatch crash during partial fee deduction needs reconciliation tooling.** If the process dies after some `deductEntryFee` calls succeed but before compensating refunds run, the match can remain `QUEUED` with some funds already moved into `MATCH_POOL`. State is recoverable because the `Match`, `MatchPlayer`, and `ENTRY_FEE` records all share the `matchId`, but there is no automated sweeper/reconciliation job yet.
- **In-memory queue does not survive server restart.** Acceptable for Phase 1 through beta. Players in queue at crash time lose their queue position but not money (fees aren't deducted until createMatch). Swap to Redis/Upstash when multi-server or persistence is needed — swap point is packages/matchmaking/src/queue.ts.
- **PlayerRating ELO K-factor is flat 32 regardless of games played.** Standard K=32 for all ratings. Should be refined to rating-band-aware K (e.g. K=40 for new players, K=20 for established, K=10 for top-rated) when sufficient match data justifies the tuning.

### CI / Testing
- **No integration tests.** CI runs typecheck, build, and mocked unit tests. No end-to-end test of deposit → match → payout flow against a real database.
- **Node 20 action deprecated June 2026.** .github/workflows/ci.yml uses actions/checkout@v4 and actions/setup-node@v4 on node-version: 20. GitHub will force Node 24 by June 2, 2026. Bump to 24 before then.

## Deferred Integration Points

When each deferred service is ready to integrate, here is exactly what needs to change and where. This is a living reference — update when a service lands or when the integration path changes.

**MaxMind GeoLite2 (geolocation real provider)**
- Signup: maxmind.com/en/geolite2/signup, free, instant
- Download: GeoLite2-City.mmdb, place OUTSIDE repo (e.g. `~/arena-platform-data/GeoLite2-City.mmdb`), never commit
- Env vars: `MAXMIND_ACCOUNT_ID`, `MAXMIND_LICENSE_KEY`, `MAXMIND_DB_PATH`, `GEO_PROVIDER=maxmind`
- Dep: add `@maxmind/geoip2-node` to `packages/geolocation/package.json`
- New file: `packages/geolocation/src/maxmind-provider.ts` implementing `GeoService` from `packages/shared/src/interfaces/geo-service.ts`. Delegate `getRules`/`checkJurisdiction` to the injected `RulesSource` (same as FakeGeoProvider). Only `getLocation` changes — use the MaxMind reader for IP-based lookups, ignore gpsCoords in v1 or fuse later.
- Factory branch: add `case 'maxmind'` in `packages/geolocation/src/geo-service-factory.ts` error-listing all supported providers
- Export from barrel: `packages/geolocation/src/index.ts`
- Tests: mock the MaxMind reader; verify interface conformance and rule delegation
- README update: move MaxMind entry from "Accounts Deferred" to "Accounts Active Now"

**GeoComply (licensed-state location verification — separate package, not geolocation)**
- Required for Tier 3/4 games in licensed US states (NJ, PA, MI). Post-beta only. Enterprise sales, contract required.
- Fundamentally different shape from geolocation: signed device assertions via client SDK, NOT IP lookup. Do NOT cram into `packages/geolocation/`.
- New interface: `packages/shared/src/interfaces/location-verification-service.ts` with shape like `verifyLocationAssertion(signedToken: string): Promise<VerifiedLocation>`
- New package: `packages/location-verification/` with `FakeLocationVerifier` + `GeoComplyProvider` + factory (same fake-then-swap pattern)
- Integration: in servers/api match-start handler, after geolocation check, if game tier requires licensed state, additionally require a valid GeoComply assertion from the client
- Client SDK: add to apps/web when integrated; clients generate signed tokens, send them on match-join

**BitPay (primary multi-chain crypto)**
- Signup: bitpay.com/business, $75 application fee, 5-7 day review. Requires business bank account first.
- Env vars: `BITPAY_API_KEY`, `PAYMENT_PROVIDER=bitpay` (or multi-provider map if supporting multiple simultaneously)
- New file: `packages/payments/src/bitpay-provider.ts` implementing `PaymentProvider` from `packages/shared/src/interfaces/payment-provider.ts`
- Factory branch: add `case 'bitpay'` in `packages/payments/src/payment-provider-factory.ts`
- Webhooks: add handler in servers/api (e.g. `POST /webhooks/bitpay`) that validates signature, looks up the BitPay invoice, and credits the player wallet via `walletService.deposit(userId, amount, 'bitpay', invoiceId)`. The `invoiceId` is the idempotency reference — duplicate webhooks become no-ops via wallet's existing idempotency.

**Helius (Solana direct)**
- Already signed up (key in password manager). Build whenever we're ready.
- Env vars: `HELIUS_RPC_URL` (already have), `PAYMENT_PROVIDER=helius` for Solana-only testing
- New file: `packages/payments/src/helius-provider.ts` implementing `PaymentProvider`
- Factory branch: add `case 'helius'`
- Webhook or polling: Helius can push transaction notifications or we can poll for incoming transfers to per-user deposit addresses. Decide at integration time.

**Coinbase Commerce (regulated crypto backup)**
- Signup: coinbase.com personal account first, then upgrade to Business + enable Commerce. After Atlas.
- Env vars: `COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET`
- Pattern identical to BitPay: new `coinbase-provider.ts`, factory case, webhook handler in servers/api
- Use as failover or regional default, not primary

**NOWPayments (long-tail coin coverage)**
- Signup: nowpayments.io, instant, free
- Env vars: `NOWPAYMENTS_API_KEY`
- Same pattern: new `nowpayments-provider.ts`, factory case, webhook handler
- Use for the 300+ less-common coins BitPay doesn't support

**Paysafe (primary card processor)**
- Signup: paysafe.com/en/businesses sales, 2-6 week approval. After Atlas + business bank account.
- Env vars: `PAYSAFE_API_KEY`, `PAYSAFE_ACCOUNT_ID`
- New file: `packages/payments/src/paysafe-provider.ts` implementing `PaymentProvider`
- Factory branch: `case 'paysafe'`
- Differences from crypto: synchronous-settlement flow via hosted payment page or API; may need additional endpoints in servers/api for 3DS challenge redirects
- Apple Pay / Google Pay come automatically through Paysafe once approved

**Nuvei (backup card processor)**
- Signup in parallel with Paysafe, same criteria. `packages/payments/src/nuvei-provider.ts`, factory case.

**Jumio (KYC real provider)**
- Signup: jumio.com sales, post-beta. Contract + integration context required.
- Env vars: `JUMIO_API_TOKEN`, `JUMIO_API_SECRET`, `KYC_PROVIDER=jumio`
- New file: `packages/kyc/src/jumio-provider.ts` implementing `KYCService`
- Factory branch: `case 'jumio'` in `packages/kyc/src/kyc-service-factory.ts`
- **Interface gap to resolve at integration time:** Jumio's verifyIdentity flow is async-pending with webhook callbacks, but the current `KYCService.verifyIdentity` returns a synchronous `VerificationResult`. At integration time, decide between: (a) return a "pending" VerificationResult immediately and update via webhook handler in servers/api, OR (b) amend the interface in packages/shared to return a pending state. Option (a) is less invasive and recommended.
- Webhook endpoint in servers/api: `POST /webhooks/jumio` validates signature, looks up the verification session, updates the user's KYC level via the service

**Elliptic (AML / blockchain analytics)**
- Signup: elliptic.co sales, when processing real crypto volume
- Env vars: `ELLIPTIC_API_KEY`
- New package: `packages/aml/` with `AMLService` interface in `packages/shared/src/interfaces/aml-service.ts`. Shape like `screenAddress(address): Promise<ScreeningResult>` and `screenTransaction(txHash): Promise<ScreeningResult>`.
- Fake-first: `FakeAMLProvider` that always returns CLEAN for dev/test
- Real provider: `EllipticProvider`
- Integration: called from servers/api crypto-deposit webhook BEFORE crediting wallet. If high risk, hold the deposit, flag for manual review.

**Chainalysis**
- Replaces Elliptic at scale. Same interface, new provider class. Swap via env var.

**Resend (transactional email)**
- Signup: resend.com, free tier, instant
- Env vars: `RESEND_API_KEY`, `EMAIL_PROVIDER=resend`
- Either: new `packages/email/` with `EmailService` interface + FakeEmailProvider + ResendProvider + factory, OR inline adapter in servers/api. New package is cleaner if email sites multiply.
- Swap points: signup verification, password reset, match-result notifications, payout confirmations
- Before Resend: fake provider logs to console

**Sentry (error monitoring)**
- Signup: sentry.io, free tier, instant
- Env vars: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`
- Bootstrap: add `Sentry.init({ dsn, environment, tracesSampleRate: 0.1 })` at top of servers/api, servers/websocket, servers/game-server entry points. Mirror in apps/web.
- Error middleware: wrap servers/api error handler to forward uncaught errors to Sentry. Keep the existing error response shape; Sentry is observability only.

**PostHog (product analytics)**
- Signup: posthog.com, free tier, instant
- Env vars: `POSTHOG_API_KEY`, `POSTHOG_HOST` (default https://app.posthog.com)
- Client-side: add SDK to apps/web, initialize in root layout, track page views + key events (signup, first deposit, match join, match complete, withdrawal)
- Server-side: add SDK to servers/api; fire events on critical business moments (deposit confirmed, match resolved, rake collected)

**Cloudflare (DNS / SSL / CDN / DDoS)**
- Signup: cloudflare.com, free tier, instant
- Before beta deploy: move arenagaming.gg DNS from Namecheap registrar to Cloudflare
- No code changes
- Enables: free SSL, DDoS protection, global CDN, analytics
- Optional later: Cloudflare Workers in front of servers/api for edge caching

**Upstash Redis (queue persistence)**
- Signup: upstash.com, free tier, when in-memory queues need to survive server restarts or multi-server deployment
- Env vars: `REDIS_URL`, `MATCHMAKING_PROVIDER=redis` (and similar for any other in-memory state we Redis-back later)
- New file: `packages/matchmaking/src/redis-queue.ts` — `RedisMatchQueue` class implementing the same interface as `MatchQueue` in `packages/matchmaking/src/queue.ts`
- Factory branch: add `case 'redis'` in `packages/matchmaking/src/matchmaking-service-factory.ts` that constructs `InMemoryMatchmakingService` with a RedisMatchQueue instance
- Other in-memory state that might migrate to Redis later: rate limiters, session cache, game-lobby presence

**Plaid (ACH bank transfers)**
- Signup: plaid.com developer account, free, instant (but production access requires compliance review)
- Env vars: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` (sandbox/development/production)
- After card processor is live
- New file: `packages/payments/src/plaid-provider.ts` implementing `PaymentProvider`
- Factory branch: `case 'plaid'`
- Multi-day settlement consideration: ACH takes 3-5 business days. Either hold deposits until cleared (conservative) or front the balance and claw back on NSF (higher-risk, needs fraud signal monitoring)

**PayPal**
- Post-beta, requires Curaçao license + clean track record + pre-approval from PayPal. Many months out.
- When ready: `packages/payments/src/paypal-provider.ts`, factory case, webhook handler

**MaxMind GeoIP Insights (higher-tier MaxMind product, if ever needed)**
- Paid upgrade from GeoLite2 with better accuracy and more fraud signals. Same provider class, different data source. Single-line change to env var / db path when swapping.

## Build Roadmap

Realistic path from today to MVP-deployable. Each phase assumes one developer (Arjun) with two AI coding agents (Claude Code, Codex) running in parallel per CLAUDE.md territory rules.

### Phase 1 — Platform Core (in progress, ~30% done)

**Done:** packages/shared, packages/database, packages/wallet (Codex-approved after 3 audit rounds)

**Remaining (~5-8 agent sessions):**
1. ~~packages/payments — PaymentProvider interface + FakePaymentProvider~~ ✓ done 2026-04-12
2. ~~packages/kyc — KYCService interface + FakeKYCProvider~~ ✓ done 2026-04-12
3. ~~packages/geolocation — FakeGeoProvider + injectable RulesSource~~ ✓ done 2026-04-12 (MaxMindProvider deferred pending account signup — will be single-branch add to factory)
3b. MaxMind integration — sign up for GeoLite2 account, implement MaxMindProvider as new switch-case branch in geo-service-factory.ts (future, post-signup)
4. ~~packages/matchmaking — ELO ratings, queue, skill-based pairing (Claude Code)~~ ✓ done 2026-04-12
4b. ~~Wallet `awardPrize` idempotency fix + Codex re-audit of `packages/matchmaking/`~~ ✓ done 2026-04-12
5. servers/api — REST endpoints, JWT auth, zod validation (Codex, Stage 2, ~2-3 hours)
6. servers/websocket — Socket.io gateway for real-time games (Codex, ~60 min)
7. servers/game-server — engine base classes (Real-time, Turn-based, Algorithm, Parallel) (Claude Code, ~2-3 hours)
8. Integration test — full flow: signup → provision wallet → deposit → queue → match → play → resolve → payout (run end-to-end against local Postgres + fake providers)

**Phase 1 milestone:** platform core works end-to-end with fake money, no games yet.

### Phase 2 — First Game + Frontend (~2-3 days)

- apps/web — Next.js frontend, landing page, game browser, wallet UI, profile, leaderboards (Claude Code via V0 MCP)
- games/agario — first playable game (server + client, Pixi.js). Reference pattern for all other games. (Codex for client, Claude Code for server extending RealTimeGameServer)

**Phase 2 milestone:** one game is fully playable in a real browser against fake money, with the full UI built out.

### Phase 3 — Remaining 23 Games (~5-10 days)

- Engine A games (Claude Code): slitherio, diep,ker last — 3D Three.js, most complex)
- Engine B games (Codex): poker, blackjack, spades, rummy, war, skill-cards
- Engine C games (Claude Code): plinko, crash, mines, dice, wheel, coinflip
- Engine D games (Codex): tetris-duel, speed-math, trivia, typing-race, pattern-match, word-game
- Many can run as cloud tasks kicked off from phone — each game is an isolated folder, zero conflict

**Phase 3 milestone:** all 24 games are fully functional against fake money.

### Phase 4 — Integration, Review, Beta Deploy (~2-3 days)

- Cross-agent review: Claude Code audits Codex money logic; Codex audits Claude Code money logic
- Dockerfiles + Railway deployment configuration
- Sentry error monitoring, PostHog analytics integration
- Swap fake → real providers via env vars: MaxMind (geo), Resend (email), etc. Payment providers and KYC stay fake until post-beta.
- Deploy to Railway with fake money enabled
- Friends playtest

**Phase 4 milestone:** Arena.gg is live on a real URL with fake money. This is where "aldev done, plugging in APIs next" kicks in.

### Post-Beta — Real Money Operations (wall-clock measured in weeks, most waiting on external approvals)

- US skill-gaming attorney opinion letter (~$5-15K, 4-8 weeks)
- Business bank account: Relay or Grasshopper (1-3 days)
- BitPay merchant application (5-7 days approval)
- Paysafe / Nuvei card processor applications (2-6 weeks)
- Jumio KYC integration (2-4 weeks)
- Swap FakePaymentProvider → BitPay/Helius/Coinbase Commerce/NOWPayments
- Swap FakeKYCProvider → Jumio
- Enable Tier 1/2 games in unrestricted US states
- Curaçao license application (~$14K, 6-10 weeks)
- Malta MGA + Isle of Man in parallel after Curaçao approval
- UKGC after Isle of Man approval

**Post-beta milestone:** Arena.gg accepts real money from US players for Tier 1/2 skill games. International launch with broader tiers when Curaçao approves.

### Rough Calendar Estimate

- Phase 1 complete: ~1 week from today
- Phase 2 complete: ~1.5 weeks from today
- Phase 3 complete: ~3 weeks f (depends on parallel cloud task throughput)
- Phase 4 beta deployed: ~3-4 weeks from today
- First real-money revenue (US skill games): ~2-3 months from today
- Global launch with Curaçao: ~4-6 months from today

These estimates assume daily work, functioning AI agents, no major rewrites, and no life stuff derailing momentum. Half those assumptions will break; pad accordingly.

## Notes

- Planning happens in claude.ai chats (within the Arena.gg project). Execution happens in Cursor terminal with Claude Code and Codex. README.md is the living memory between planning chats and agent sessions.
- All code goes through Cursor agents so they can test locally before pushing. Planning chats only edit text files (this README, ARENA-GG-INFO-FILE) via GitHub connector when needed.
- Territory rules per CLAUDE.md "Dual-Agent Coordination" section are strictly enforced.
- When a deferred service is signed up and ready to integrate, consult the Deferred Integration Points section for exact file-level swap steps. Keep that section updated as the codebase evolves.
- WHEN-THEN.md at the repo root tracks triggered edits — "when X happens, change Y." Planning chats and agent sessions scan it to catch triggers that may have fired. Keeps decisions from getting lost in chat history.
