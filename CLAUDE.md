# CLAUDE.md — Arena.gg Platform

## What Is This Project

Arena.gg is a Roblox-style platform where anyone can build, publish, and profit from real-money competitive games. Players compete in io-games, battle royales, card games, casino games, puzzle duels, and more with real money on the line. Third-party developers can create games using the Arena SDK and earn a share of platform revenue (30% of the rake their game generates).

The platform handles all money (wallets, deposits, withdrawals, entry fees, prize distribution), all compliance (KYC, age verification, geolocation, AML), all matchmaking, and all anti-cheat. Game developers only write game logic.

## Tech Stack

- **Language**: TypeScript everywhere. No JavaScript files. Strict mode enabled in tsconfig.
- **Monorepo**: Turborepo with npm workspaces
- **Frontend**: Next.js 14+ with App Router, React, Tailwind CSS, Shadcn UI
- **2D Game Rendering**: Pixi.js (all io-games, card games, algorithm games, puzzle games)
- **3D Game Rendering**: Three.js (krunker FPS only)
- **Backend API**: Node.js with Express, REST endpoints
- **Database**: PostgreSQL via Prisma ORM (hosted on Supabase)
- **Real-time**: Socket.io for WebSocket communication (game servers, matchmaking notifications)
- **Cache/Queue**: In-memory initially, Redis (Upstash) for production
- **Auth**: NextAuth.js with JWT strategy
- **Payments Phase 1**: Solana Web3.js for SOL deposits/withdrawals, @solana/spl-token for USDC
- **Payments Phase 2**: Stripe for cards, PayPal REST API (when approved)
- **KYC**: Sumsub API (when approved)
- **Geolocation**: MaxMind GeoLite2 for IP lookup, browser Geolocation API for GPS
- **Testing**: Vitest for unit/integration tests
- **Deployment**: Railway (beta), Fly.io (production)

## Repository Structure

arena-platform/
├── apps/
│   ├── web/                    # Next.js player-facing website
│   ├── admin/                  # Internal admin dashboard
│   └── developer-portal/       # Developer game management portal
├── packages/
│   ├── database/               # Prisma schema, migrations, seed scripts
│   ├── wallet/                 # Wallet: deposits, withdrawals, balances, double-entry ledger
│   ├── matchmaking/            # Matchmaking: ELO ratings, queues, skill-based pairing
│   ├── kyc/                    # KYC: Sumsub integration, verification pyramid
│   ├── geolocation/            # Geolocation: IP lookup, GPS, jurisdiction rules engine
│   ├── payments/               # Payment providers: Solana, Stripe, PayPal plugins
│   ├── anti-cheat/             # Anti-cheat: behavioral analysis, collusion detection
│   ├── fairness/               # Game classification: skill/chance analysis, tier assignment
│   ├── shared/                 # Shared TypeScript types, interfaces, constants
│   └── sdk/                    # Arena SDK for third-party developers
├── games/
│   ├── [game-name]/
│   │   ├── server/             # Authoritative game server logic
│   │   └── client/             # Client-side renderer and UI
├── servers/
│   ├── api/                    # Main REST API server
│   ├── game-server/            # Game server runtime (hosts all game instances)
│   └── websocket/              # WebSocket gateway (routes connections to game instances)
├── infrastructure/
│   ├── docker/                 # Dockerfiles
│   └── ci/                     # CI/CD configs
├── docs/                       # Architecture docs, game specs, legal docs
├── scripts/                    # Setup, seed, deploy scripts
├── .github/workflows/          # GitHub Actions
├── CLAUDE.md                   # This file
├── AGENTS.md                   # Instructions for Codex
├── package.json                # Root monorepo config
├── tsconfig.json               # Root TypeScript config
└── turbo.json                  # Turborepo config

## Game List (24 Games)

### Engine Class A — Real-Time Continuous

These games run a tick-based server loop at 20-60hz. Players move continuously. Server is authoritative — all physics, collision, and game state runs server-side. Client only sends inputs and renders what the server tells it. WebSocket streams state updates using binary serialization with delta compression.

**agario** — You are a circle. Move toward cursor. Eat smaller players and food to grow. Die when eaten by bigger player. Money model: progressive pool. Entry fee $0.10. Cash value accumulates as you kill (absorb victim's value minus 10% rake). Cash-out button after 60 seconds alive AND cash value exceeds entry fee. Max 50 players per lobby. Collision via spatial hash grid. Tier 2 (skill-dominant).

**slitherio** — You are a snake (array of connected segments). Eat pellets to grow longer. Other players die if their head hits your body. Dead snakes become pellets. Boost spends length for speed. Same progressive pool model as agario. Collision detection checks head against nearby body segments via spatial hash. Tier 2.

**diep** — You are a tank. Shoot bullets at other players. Gain XP from kills and food. Level up to allocate stat points (bullet speed, health, movement, damage, reload). Class evolution tree at certain levels (twin, sniper, machine gun, etc). Progressive pool model. Tier 2.

**surviv** — Top-down 2D battle royale. Loot weapons from buildings. Shrinking zone forces players together. Different guns with different stats (fire rate, damage, spread, magazine, reload time). Health and armor. Last player standing wins. Fixed entry fee, top 3 split pool. 50-100 players. Tier 2.

**hole** — You are a hole in the ground. Move around a city. Swallow objects and players to grow. Timed rounds, biggest hole wins. Fixed entry fee, winner takes pool. Tier 2.

**krunker** — First-person 3D shooter (Three.js). Deathmatch or team deathmatch. Multiple weapons. Server-side hit detection with lag compensation (rewind game state to shooter's perspective at time of fire). Fixed match, score limit or time limit. Entry fee $1-5 for 1v1. Tier 1 (pure skill). BUILD THIS LAST — most complex game.

### Engine Class B — Turn-Based / Event-Driven

No game loop. Server processes player actions as they arrive, validates against rules, updates state, broadcasts. Event-driven state machine.

**poker** — Texas Hold'em. 2-9 players. Deck management, hand evaluation (best 5 from 7), betting rounds (preflop/flop/turn/river), pot management with side pots, showdown. Money: rake per pot (5% capped at $3). Tier 2.

**blackjack** — Player vs house (platform). Standard rules (hit, stand, double, split, insurance). Dealer hits soft 17. 6-deck shoe. Money: house edge (~1.5%). Payout 1:1 regular, 3:2 blackjack. Tier 3 (mixed skill/chance).

**spades** — 4 players, fixed partnerships. 13 cards each. Bidding then trick-taking. Spades are trump. Scoring: making bid, bags, nil, blind nil. Play to 500 points. Entry fee per player, winning team splits pool. Tier 2.

**rummy** — Gin Rummy, 2 players. Draw/discard, form melds (sets and runs), knock or gin. Deadwood scoring. Entry fee, winner takes pool. Tier 2.

**war** — Two players flip cards, higher wins. Ties go to war (3 face-down, 1 face-up). Almost pure chance. Entry fee, winner takes pool minus rake. Tier 4 (chance-dominant).

**skill-cards** — Custom designed game. Both players have identical 20-card decks. Each card has attack, defense, and a special ability. Players simultaneously choose a card each round. Resolution based on type matchups and stats. Skill is reading opponent patterns and managing hand. Designed to be Tier 1 (pure skill). 10 rounds per match.

### Engine Class C — Algorithm / Click-and-Resolve

Player makes a decision, server generates outcome via provably fair RNG, client plays animation. Provably fair: server commits to seed hash before round, combines with player seed, reveals seed after for verification.

**plinko** — Choose drop position, bet amount. Ball bounces through 12 rows of pegs. Lands in multiplier slot (0.2x to 10x). Physics animation on client (Matter.js). House edge game. Tier 4.

**crash** — Multiplier starts at 1.00x and rises. Cash out anytime. At random point it crashes — anyone still in loses bet. Provably fair crash point. Social element: see others cashing out. Money: house edge (expected value < bet). Tier 3.

**mines** — 5x5 grid. Some tiles have mines, some have gems. Click tiles to reveal. Each safe tile increases multiplier. Hit a mine, lose bet. Cash out anytime. Provably fair mine placement. Tier 3.

**dice** — Pick over/under a target number (1-100). Probability determines payout. Over 50 = approx 2x. Over 95 = approx 20x. Provably fair roll. Tier 4.

**wheel** — Bet, wheel spins, lands on multiplier segment. Bigger segments (lower multiplier) more likely. Provably fair. Tier 4.

**coinflip** — Two players, same bet, 50/50. Winner takes both minus 10% rake. Provably fair. Tier 4.

### Engine Class D — Synchronized Parallel Competition

Both players receive identical inputs from server. Play independently. Server tracks both scores in real time. Better performance wins.

**tetris-duel** — Server generates identical piece sequence. Both play Tetris independently. Score based on lines cleared, speed, combos. Garbage lines sent to opponent on multi-clears. Game ends when one tops out or timer expires. Entry fee, winner takes pool. Tier 1.

**speed-math** — Server generates math problems (configurable difficulty). Both answer simultaneously. More correct + faster = wins. Entry fee, winner takes pool. Tier 1.

**trivia** — Server selects questions from database. Both answer same questions simultaneously. More correct + faster wins. Tier 1.

**typing-race** — Server selects text passage. Both type it. Faster + more accurate wins. Track WPM and accuracy. Tier 1.

**pattern-match** — Server generates pattern (color sequence, card grid, etc). Both memorize and reproduce. Better accuracy + speed wins. Tier 1.

**word-game** — Server generates letter tiles. Both form words from same tiles. Higher-scoring words win. Dictionary validation via trie. Tier 1.

## Legal Classification Tiers

**Tier 1 (80%+ skill):** Legal for real money in most US states without gambling license. 18+ minimum. Games: tetris-duel, speed-math, trivia, typing-race, pattern-match, word-game, skill-cards, krunker.

**Tier 2 (60-80% skill):** Legal in states using Dominant Factor test. May need gaming lab certification. 18+. Games: agario, slitherio, diep, surviv, hole, poker, spades, rummy.

**Tier 3 (40-60% skill):** Needs gambling license in most US states. Available internationally under Curacao/Malta license. 21+ in US. Games: crash, mines, blackjack.

**Tier 4 (under 40% skill):** Full gambling. Requires licenses everywhere. Games: plinko, dice, wheel, coinflip, war.

## Service Specifications

### packages/shared/
All TypeScript interfaces defined here FIRST before any implementation. Every service imports types from here. Key interfaces:
- WalletService: deposit, withdraw, deductEntryFee, awardPrize, getBalance, getTransactionHistory
- MatchmakingService: joinQueue, leaveQueue, createMatch, resolveMatch, getRating
- GameServer (base): onPlayerJoin, onPlayerInput, onTick, onPlayerLeave, getState, checkWinCondition
- RealTimeGameServer extends GameServer: tickRate, spatialGrid, broadcastState
- TurnBasedGameServer extends GameServer: processAction, validateAction, nextTurn
- AlgorithmGameServer extends GameServer: generateOutcome, commitSeed, revealSeed
- ParallelGameServer extends GameServer: generateChallenge, trackProgress, compareResults
- PaymentProvider: processDeposit, processWithdrawal, getDepositAddress
- KYCService: verifyIdentity, checkAge, getVerificationLevel
- GeoService: getLocation, checkJurisdiction, getRules

### packages/wallet/
CRITICAL SERVICE — CROSS-CHECK ALL CODE WITH GPT BEFORE COMMITTING.
- Double-entry bookkeeping: every transaction creates BOTH a debit entry AND a credit entry
- All operations wrapped in database transactions with SERIALIZABLE isolation level
- Optimistic locking on wallet balance field (version column, increment on every update, reject if version mismatch)
- New users automatically get $100.00 fake balance (fake money phase)
- Functions: deposit(userId, amount, method, reference), withdraw(userId, amount, method), deductEntryFee(userId, matchId, amount), awardPrize(userId, matchId, amount), getBalance(userId), getTransactionHistory(userId, pagination)
- Every function must have comprehensive tests

### packages/matchmaking/
- ELO rating system, starting rating 1200 for all players per game
- Queue: players join specifying gameId and entryFeeTier
- Matching: pair players within 200 ELO of each other (widen range after 30 seconds in queue)
- Match creation: deduct entry fees from all players via wallet, create match record, return matchId
- Match resolution: receive results array (player placements), calculate payouts per money model, award prizes via wallet, update ELO ratings

### packages/payments/
Plugin architecture. PaymentProvider interface with implementations:
- FakePaymentProvider: Phase 1. deposit() just credits wallet with fake money. withdraw() is a no-op.
- SolanaPaymentProvider: Phase 2. Real SOL/USDC deposits and withdrawals via Helius RPC.
- StripePaymentProvider: Phase 3. Card deposits, webhook handling, payouts.
- PayPalPaymentProvider: Phase 3. PayPal checkout, webhooks, payouts.

### packages/kyc/
Verification pyramid:
- Level 0: anonymous browsing, no account
- Level 1: email only, free play with Fun Coins
- Level 2: name + DOB + address + last 4 SSN, database check, small deposits up to $50-100
- Level 3: photo ID + selfie + liveness check via Sumsub, larger deposits up to $2000
- Level 4: enhanced due diligence, source of funds, unlimited deposits

### packages/geolocation/
Rules engine: configuration table mapping each jurisdiction to:
- realMoneyEnabled: boolean
- minAge: 18 or 21
- allowedTiers: [1,2] or [1,2,3,4] etc
- allowedPaymentMethods: ['crypto', 'stripe', 'paypal'] etc
- requiresLicense: boolean

## Coding Conventions

- ALL code is TypeScript with strict mode. Never use any type. Never use // @ts-ignore.
- Use named exports, not default exports: export function createWallet() not export default createWallet
- Use async/await, never raw Promises with .then() chains
- Error handling: throw typed errors that extend a base AppError class with error codes
- Naming: camelCase for variables and functions, PascalCase for types and interfaces, UPPER_SNAKE for constants
- Files: kebab-case filenames (wallet-service.ts, not walletService.ts)
- Every public function must have JSDoc comments explaining parameters and return values
- Every service must have a corresponding .test.ts file with tests using Vitest
- Database operations: always use Prisma, never raw SQL
- All wallet/money operations MUST use database transactions with serializable isolation
- Never store secrets in code. Use environment variables via process.env
- Use zod for all input validation on API endpoints
- Log all errors with structured logging (context, userId, action, error message)

## MCP Tool Usage

You have access to these MCP tools:
- **v0-mcp**: Call when you need to generate polished UI components. Use for landing pages, game lobbies, wallet dashboards, settings screens. The components come back as React + Tailwind + Shadcn. Place them in the appropriate apps/ directory.
- **supabase**: Use for database operations during development — creating tables, running queries, checking data. The Prisma schema is the source of truth; use supabase MCP for quick checks and debugging.
- **github**: Use for creating branches, pushing code, creating pull requests. Always push completed work to GitHub.

## Dual-Agent Coordination

You are one of two AI coding agents on this project. The other agent is OpenAI Codex running in a separate terminal. To avoid file conflicts:

RULES:
1. Only modify files in your assigned territory for the current stage
2. Never modify files in the other agent's territory
3. You may READ and IMPORT from any file, including ones the other agent created
4. If you need a new shared type, add it to packages/shared/ (shared territory in Stage 1 only; after Stage 1, ask the user to coordinate)
5. Always check git status before starting work to see if new files appeared from the other agent

Territory Assignments:

Stage 1 (Interfaces and Database):
- Claude Code: packages/shared/
- Codex: packages/database/

Stage 2 (Wallet and API):
- Claude Code: packages/wallet/
- Codex: servers/api/

Stage 3 (Matchmaking and Game Framework):
- Claude Code: packages/matchmaking/, servers/game-server/
- Codex: servers/websocket/, apps/web/ (lobby system only)

Stage 4 (Agar.io):
- Claude Code: games/agario/server/
- Codex: games/agario/client/

Stage 5 (More Games):
- Cloud tasks work in isolated games/[game-name]/ folders — no conflicts
- Local tasks: Claude Code builds game servers, Codex builds game clients
- Exception: cloud tasks build both server and client for a game since they work in isolation

Stage 6 (Frontend):
- Claude Code: apps/web/ pages, layouts, V0 component generation
- Codex: apps/web/ API client, state management, WebSocket integration

## Money Model Reference

Progressive Pool (agario, slitherio, diep, hole):
Entry fee -> player starts with $0.00 cash value -> kills absorb victim's cash value minus 10% rake -> cash-out button after 60s alive AND cash value > entry fee -> cash-out kills player and credits wallet

Fixed Pot (surviv, krunker, poker, spades, rummy, war, skill-cards, all Class D games):
All players pay entry fee -> fees pooled -> match plays -> winner(s) get pool minus rake
Split for battle royale: 1st 60%, 2nd 25%, 3rd 15%
Split for 1v1: winner gets 90% of total pool

House Edge (blackjack, plinko, dice, wheel):
Player bets against platform -> outcome by rules/RNG -> expected value slightly below bet -> platform profits from math edge over millions of plays

Crash:
All players bet -> multiplier rises -> players cash out at chosen moment -> crash point ends round -> anyone still in loses -> house edge from crash point distribution

Coin Flip:
Two players bet equal amounts -> 50/50 -> winner gets both bets minus 10% rake

Rake Tiers:
- Entry fee under $1: 10% rake
- Entry fee $1-$10: 8% rake
- Entry fee over $10: 5% rake
## Operating Instructions (Standing Rules)

These rules apply to every session and every task, unless a specific prompt overrides them.

### Permissions

Full-access permissions are configured in .claude/settings.json. Do not ask for approval on file edits, bash commands, or git operations. Just execute. The exception is anything explicitly destructive the user didn't ask for (e.g. `rm -rf`, `git push --force` on main, dropping databases) — those still require confirmation.

### Database

There is no live Postgres database yet. For any Prisma command that requires DATABASE_URL (validate, generate), use placeholder: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/arena` inline on the command. Never run `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push` — those require a real database connection. Migration files should be written to packages/database/prisma/migratiobut not executed.

### Commits

After completing a task, update README.md to reflect the new state, then run: `git add .`, `git commit -m "<descriptive message>"`, `git push`. Do this without being prompted at the end of any task that produced file changes.

### Testing

If a test fails, fix the root cause (usually the code, sometimes an incorrect test expectation). Do not weaken test assertions to make them pass. Tests marked `.skip` with a comment explaining a real-DB requirement are acceptable; don't remove them.

### Unknown commands / missing tools

If you need a tool that isn't installed (e.g. a new npm package), install it. Add it to the appropriate package.json as a dependency or devDependency depending on whether it's used at runtime or build-time.

### When in doubt

If a prompt doesn't specify a design choice and both options are reasonable, pick the simpler one and note your choice in the final summary. Don't pause to ask the user mid-task unless the decision would be genuinely irreversible (e.g. deleting user data, pushing to an external service).
