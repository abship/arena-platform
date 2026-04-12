# WHEN-THEN

Triggered edits queue. Each entry describes a trigger condition that, once met, activates a set of edits elsewhere in the codebase or docs. Planning chats and agent sessions should scan this file whenever something new happens that might fire a trigger.

Entries are not rigidly categorized — engineering integrations, launch checklists, deprecation deadlines, and capacity triggers all follow the same shape.

Format:

```
### [short label]
**WHEN:** [specific, observable trigger condition]
**THEN:**
- [ ] edit 1 (file path or area)
- [ ] edit 2
**NOTES:** (optional context, constraints, gotchas)
```

Mark entries `[DONE]` when fully resolved. Delete after one cleanup pass confirms nothing was missed.

---

## Active Entries

### MaxMind GeoLite2 signup complete
**WHEN:** MaxMind account is created and license key is in the password manager
**THEN:**
- [ ] Implement `MaxMindProvider` in `packages/geolocation/src/maxmind-provider.ts`
- [ ] Add `case 'maxmind'` to `packages/geolocation/src/geo-service-factory.ts`
- [ ] Add `@maxmind/geoip2-node` to `packages/geolocation/package.json`
- [ ] Export from `packages/geolocation/src/index.ts`
- [ ] Write tests mocking the MaxMind reader
- [ ] Move MaxMind from "Accounts Deferred" to "Accounts Active Now" in README.md
**NOTES:** See Deferred Integration Points in README.md for full swap steps. `.mmdb` file goes OUTSIDE repo.

### servers/api/ built and working
**WHEN:** REST API server is functional with auth, wallet, and matchmaking endpoints
**THEN:**
- [ ] Document ConflictError retry guidance in API route handlers (wallet known issue)
- [ ] Add zod validation on all endpoints per coding conventions
- [ ] Wire webhook endpoints for future payment/KYC providers (stub routes)
- [ ] Update README.md "In Progress" / "What's Built" sections

### servers/game-server/ engine base classes built
**WHEN:** RealTimeGameServer, TurnBasedGameServer, AlgorithmGameServer, ParallelGameServer base classes exist
**THEN:**
- [ ] Begin `games/agario/server/` (first game, reference implementation)
- [ ] Update README.md build status

### First game (agario) playable end-to-end
**WHEN:** agario server + client work together through matchmaking with fake money
**THEN:**
- [ ] Use agario as the reference pattern for documenting game development in `packages/sdk/`
- [ ] Begin Phase 3 game builds (remaining 23 games)
- [ ] Update README.md phase status

### Integration test passes end-to-end
**WHEN:** signup -> deposit -> queue -> match -> play -> resolve -> payout works against local Postgres + fake providers
**THEN:**
- [ ] Mark Phase 1 as complete in README.md
- [ ] Begin Phase 2 (frontend + first game)
- [ ] Add the integration test to CI

### Node 20 GitHub Actions deprecation
**WHEN:** Before 2026-06-02 (GitHub forces Node 24)
**THEN:**
- [ ] Bump `node-version` in `.github/workflows/ci.yml` from 20 to 24
- [ ] Test CI pipeline after bump
**NOTES:** actions/checkout@v4 and actions/setup-node@v4 both affected.

### In-memory queue insufficient (multi-server or crash recovery needed)
**WHEN:** Deploying multiple game-server instances OR queue loss on restart becomes unacceptable
**THEN:**
- [ ] Sign up for Upstash Redis
- [ ] Implement `RedisMatchQueue` in `packages/matchmaking/src/redis-queue.ts`
- [ ] Add `case 'redis'` in `packages/matchmaking/src/matchmaking-service-factory.ts`
- [ ] Update `MATCHMAKING_PROVIDER` env var documentation
**NOTES:** Players in queue at crash time lose position but not money (fees deducted at match creation, not queue join).

### Real payment provider approved (any of: BitPay, Helius, Coinbase Commerce, NOWPayments, Paysafe)
**WHEN:** Provider application approved and API keys are available
**THEN:**
- [ ] Implement provider in `packages/payments/src/[provider]-provider.ts`
- [ ] Add factory case in `packages/payments/src/payment-provider-factory.ts`
- [ ] Add webhook endpoint in `servers/api/` with signature validation
- [ ] Verify wallet idempotency handles duplicate webhooks (it should — referenceId uniqueness)
- [ ] Move provider from "Accounts Deferred" to "Accounts Active Now" in README.md
**NOTES:** See Deferred Integration Points in README.md for provider-specific details.

### Real KYC provider approved (Jumio)
**WHEN:** Jumio contract signed and API credentials received
**THEN:**
- [ ] Implement `JumioProvider` in `packages/kyc/src/jumio-provider.ts`
- [ ] Add `case 'jumio'` in `packages/kyc/src/kyc-service-factory.ts`
- [ ] Decide on async verification pattern (return pending immediately + webhook, or amend interface)
- [ ] Add webhook endpoint `POST /webhooks/jumio` in `servers/api/`
**NOTES:** Interface gap: Jumio flow is async-pending. Recommended: return pending VerificationResult, update via webhook. Less invasive than changing shared interface.

### Beta deployed to Railway
**WHEN:** App is live on a real URL with fake money
**THEN:**
- [ ] Sign up for Sentry, add `Sentry.init()` to all server entry points and `apps/web`
- [ ] Sign up for PostHog, add SDK to `apps/web` and `servers/api/`
- [ ] Move DNS to Cloudflare (free SSL, DDoS, CDN)
- [ ] Update README.md deployment status

### Second currency needed (EUR, GBP, etc.)
**WHEN:** Arena.gg needs to support a currency other than USD
**THEN:**
- [ ] Add currency validation to all wallet mutation functions (currently assumes USD — known issue)
- [ ] Add cross-currency transfer rules or reject cross-currency operations
- [ ] Update wallet tests for multi-currency scenarios

### createMatch crash reconciliation needed
**WHEN:** Production observability shows orphaned QUEUED matches with partial fee deductions
**THEN:**
- [ ] Build reconciliation sweeper job that scans for stale QUEUED matches and refunds deducted fees
- [ ] Add alerting for matches stuck in QUEUED state beyond threshold
**NOTES:** State is recoverable — Match, MatchPlayer, and ENTRY_FEE records share matchId.

### ELO rating tuning justified by data
**WHEN:** Sufficient match data exists to analyze rating convergence and accuracy
**THEN:**
- [ ] Replace flat K=32 with rating-band-aware K-factor (e.g. K=40 new, K=20 established, K=10 top)
- [ ] Backtest against historical match data before deploying

### Real database integration tests needed
**WHEN:** Preparing for production volume OR after a bug that mocked tests missed
**THEN:**
- [ ] Set up docker-compose with Postgres for CI
- [ ] Write integration tests for wallet race conditions and serialization failures
- [ ] Write integration tests for matchmaking fee deduction + refund flows
**NOTES:** Current test suite is mocked-Prisma only. Real race conditions and constraint enforcement are not covered.

### Production deploy (Fly.io)
**WHEN:** Beta validated, moving to production infrastructure
**THEN:**
- [ ] Sign up for Fly.io
- [ ] Create Dockerfiles in `infrastructure/docker/`
- [ ] Set up CI/CD in `infrastructure/ci/`
- [ ] Migrate from Railway to Fly.io
- [ ] Update deployment documentation

---

## Done

(none yet)
