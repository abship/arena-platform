# AGENTS.md — Arena.gg Platform (Codex Instructions)

## What Is This Project

Arena.gg is a Roblox-style platform where anyone can build, publish, and profit from real-money competitive games. Players compete in io-games, battle royales, card games, casino games, puzzle duels, and more with real money on the line. Third-party developers can create games using the Arena SDK and earn a share of platform revenue (30% of the rake their game generates).

The platform handles all money (wallets, deposits, withdrawals, entry fees, prize distribution), all compliance (KYC, age verification, geolocation, AML), all matchmaking, and all anti-cheat. Game developers only write game logic.

## Tech Stack

- Language: TypeScript everywhere. No JavaScript files. Strict mode enabled.
- Monorepo: Turborepo with npm workspaces
- Frontend: Next.js 14+ with App Router, React, Tailwind CSS, Shadcn UI
- 2D Game Rendering: Pixi.js
- 3D Game Rendering: Three.js (krunker only)
- Backend API: Node.js with Express
- Database: PostgreSQL via Prisma ORM (Supabase)
- Real-time: Socket.io
- Cache/Queue: In-memory initially, Redis (Upstash) for production
- Auth: NextAuth.js with JWT
- Payments Phase 1: Solana Web3.js, @solana/spl-token for USDC
- Payments Phase 2: Stripe, PayPal REST API
- KYC: Sumsub API
- Geolocation: MaxMind GeoLite2, browser Geolocation API
- Testing: Vitest
- Deployment: Railway (beta), Fly.io (production)

## You Are One Of Two AI Agents

You are OpenAI Codex. The other agent is Claude Code running in a separate terminal. You both work on the same repository. To avoid conflicts:

RULES:
1. Only modify files in YOUR assigned territory for the current stage
2. Never modify files in Claude Code's territory
3. You may READ and IMPORT from any file, including ones Claude Code created
4. If you need a new shared type that does not exist, ask the user to coordinate with Claude Code
5. Always check git status before starting work to see if new files appeared from the other agent

## Territory Assignments Per Stage

Stage 1 (Interfaces and Database):
- Codex owns: packages/database/
- Claude Code owns: packages/shared/
- DO NOT touch packages/shared/

Stage 2 (Wallet and API):
- Codex owns: servers/api/
- Claude Code owns: packages/wallet/
- DO NOT touch packages/wallet/

Stage 3 (Matchmaking and Game Framework):
- Codex owns: servers/websocket/, apps/web/ (lobby system only)
- Claude Code owns: packages/matchmaking/, servers/game-server/
- DO NOT touch packages/matchmaking/ or servers/game-server/

Stage 4 (Agar.io):
- Codex owns: games/agario/client/
- Claude Code owns: games/agario/server/
- DO NOT touch games/agario/server/

Stage 5 (More Games):
- Cloud tasks work in isolated games/[game-name]/ folders — no conflicts
- Local tasks: Codex builds game clients, Claude Code builds game servers
- Exception: cloud tasks build both server and client since they work in isolation

Stage 6 (Frontend):
- Codex owns: apps/web/ API client, state management, WebSocket integration
- Claude Code owns: apps/web/ pages, layouts, component generation
- Coordinate with user if both need to edit the same file

## Triggered Edits (WHEN-THEN.md)

WHEN-THEN.md at the repo root is a living queue of "when X happens, change Y" entries. Before starting any task, scan WHEN-THEN.md to check if the work you're about to do fires a trigger. After completing a task, check again — your work may have created a new trigger condition. If you complete a triggered edit, mark it done in WHEN-THEN.md.

## Game Engine Classes

### Engine Class A — Real-Time Continuous
Tick-based server loop at 20-60hz. Players move continuously. Server authoritative. Client sends inputs, renders server state. WebSocket streams binary state updates with delta compression.
Games: agario, slitherio, diep, surviv, hole, krunker (3D)

### Engine Class B — Turn-Based / Event-Driven
No game loop. Event-driven state machine. Server processes actions, validates, updates, broadcasts.
Games: poker, blackjack, spades, rummy, war, skill-cards

### Engine Class C — Algorithm / Click-and-Resolve
Player decides, server generates outcome via provably fair RNG (hash-committed seed), client animates result.
Games: plinko, crash, mines, dice, wheel, coinflip

### Engine Class D — Synchronized Parallel Competition
Both players get identical inputs. Play independently. Server tracks scores. Better performance wins.
Games: tetris-duel, speed-math, trivia, typing-race, pattern-match, word-game

## All 24 Games

agario — Circle eating game. Progressive pool. Entry $0.10. Cash-out after 60s + exceeds entry fee. 50 players. Spatial hash collision. Tier 2.
slitherio — Snake game. Progressive pool. Head-to-body collision via spatial hash. Tier 2.
diep — Tank shooter with upgrades/classes. Progressive pool. Tier 2.
surviv — 2D battle royale. Loot, shrinking zone. Fixed pot, top 3 split. 50-100 players. Tier 2.
hole — Hole swallowing game. Timed rounds. Fixed pot. Tier 2.
krunker — 3D FPS. Lag-compensated hit detection. Fixed match. Tier 1. BUILD LAST.
poker — Texas Hold em. Rake per pot 5% capped $3. Tier 2.
blackjack — Player vs house. House edge ~1.5%. Tier 3.
spades — 4-player partnerships. Trick-taking. Fixed pot. Tier 2.
rummy — Gin Rummy 2-player. Fixed pot. Tier 2.
war — Card flip. Nearly pure chance. Fixed pot. Tier 4.
skill-cards — Custom 20-card battle. Simultaneous play. Tier 1.
plinko — Ball drop through pegs. Multiplier slots. House edge. Tier 4.
crash — Rising multiplier, cash out before crash. House edge. Tier 3.
mines — Grid reveal, avoid mines. Cash out anytime. Tier 3.
dice — Over/under target number. Probability-based payout. Tier 4.
wheel — Spin for multiplier. House edge. Tier 4.
coinflip — Two players, 50/50, 10% rake. Tier 4.
tetris-duel — Identical pieces, head-to-head. Fixed pot. Tier 1.
speed-math — Same problems, race to solve. Fixed pot. Tier 1.
trivia — Same questions, race to answer. Fixed pot. Tier 1.
typing-race — Same passage, race to type. Fixed pot. Tier 1.
pattern-match — Same pattern, memorize and reproduce. Fixed pot. Tier 1.
word-game — Same letters, form highest-scoring words. Fixed pot. Tier 1.

## Legal Tiers

Tier 1 (80%+ skill): Most US states, no gambling license, 18+. tetris-duel, speed-math, trivia, typing-race, pattern-match, word-game, skill-cards, krunker.
Tier 2 (60-80% skill): Dominant Factor test states, may need certification, 18+. agario, slitherio, diep, surviv, hole, poker, spades, rummy.
Tier 3 (40-60% skill): Needs gambling license in US, international under Curacao/Malta, 21+. crash, mines, blackjack.
Tier 4 (under 40% skill): Full gambling, licenses everywhere. plinko, dice, wheel, coinflip, war.

## Key Service Specs

### packages/database/ (YOUR STAGE 1 TERRITORY)
Prisma schema with tables:
- users: id mod, email, username, passwordHash, verificationLevel, createdAt
- wallets: id, userId, balance, currency, version (for optimistic locking)
- transactions: id, walletId, type (DEBIT/CREDIT), amount, counterpartyWalletId, matchId, reference, createdAt
- games: id, name, engineClass (A/B/C/D), legalTier (1/2/3/4), minPlayers, maxPlayers, isActive
- game_classifications: id, gameId, skillPercentage, chancePercentage, tier, certifiedAt
- matches: id, gameId, status (WAITING/ACTIVE/COMPLETED/CANCELLED), entryFee, prizePool, rake, startedAt, endedAt
- match_players: id, matchId, userId, entryFee, payout, placement, cashValue
- kyc_records: id, userId, level (0-4), provider, status, verifiedAt
- geolocation_rules: id, jurisdiction, realMoneyEnabled, minAge, allowedTiers, allowedPaymentMethods
- developer_accounts: id, userId, companyName, revenueShare, status
- developer_games: id, developerId, gameId, revenueEarned
- leaderboards: id, gameId, userId, rating, wins, losses, earnings
- ratings: id, userId, gameId, elo, glicko2Rating, glicko2Deviation, glicko2Volatility

Create seed script: 10 test users, each with wallet containing $100.00 fake balance.

### servers/api/ (YOUR STAGE 2 TERRITORY)
Express server with endpoints:
- POST /auth/register — create user + wallet with $100 fake balance, return JWT
- POST /auth/login — validate credentials, return JWT
- GET /users/me — return user profile (requires auth)
- GET /wallet/balance — return balance from wallet service (requires auth)
- GET /wallet/transactions — paginated transaction history (requires auth)
- GET /games — list all active games with classifications
- GET /games/:id/lobbies — list active lobbies for a game
- POST /matchmaking/join — join queue for a game (requires auth)
- POST /matchmaking/leave — leave queue (requires auth)
- JWT auth middleware on all routes except register and login
- Use zod for input validation on all endpoints
- Import types from packages/shared/
- Import wallet functions from packages/wallet/

### servers/websocket/ (YOUR STAGE 3 TERRITORY)
Socket.io gateway:
- On connection: authenticate JWT token from handshake, extract userId
- Route player to correct game instance based on matchId query param
- Handle disconnect: notify game server, start 30-second reconnection timer
- Handle reconnect: restore player to active game
- When matchmaking creates a match: emit 'match-ready' to all matched players with matchId

### games/[name]/client/ (YOUR GAME CLIENT TERRITORY)
For each game, build the client-side renderer:
- Engine Class A: Pixi.js renderer, camera follow, interpolation between server updates, HUD overlay with cash value and cash-out button, minimap, leaderboard
- Engine Class B: Pixi.js card/board renderer, clickable actions, turn timer, chip/score display
- Engine Class C: Pixi.js or HTML animations (plinko ball, crash graph, dice roll, wheel spin, mine reveal), bet controls, cash-out button
- Engine Class D: Split screen showing your game and opponent progress, timer, score comparison

## Money Models

Progressive Pool (agario, slitherio, diep, hole):
Entry fee -> $0.00 start -> kills absorb victim value minus rake -> cash-out after 60s AND value > entry fee

Fixed Pot (surviv, krunker, poker, spades, rummy, war, skill-cards, all Class D):
All pay entry -> pool -> winner(s) get pool minus rake
Battle royale split: 1st 60%, 2nd 25%, 3rd 15%
1v1 split: winner gets 90% of total pool

House Edge (blackjack, plinko, dice, wheel):
Player vs platform -> RNG outcome -> expected value < bet -> platform profits over time

Crash: All bet -> multiplier rises -> cash out or lose -> house edge from crash distribution
Coinflip: Two players equal bets -> 50/50 -> winner gets both minus 10% rake

Rake tiers: under $1 = 10%, $1-$10 = 8%, over $10 = 5%

## Coding Conventions

- ALL TypeScript strict mode. Never use any type. Never use @ts-ignore.
- Named exports only: export function x() not export default
- async/await only, no .then() chains
- Typed errors extending base AppError class
- camelCase variables/functions, PascalCase types/interfaces, UPPER_SNAKE constants
- kebab-case filenames: wallet-service.ts not walletService.ts
- JSDoc on every public function
- Every service needs .test.ts file with Vitest tests
- Prisma only, never raw SQL
- All wallet operations in serializable database transactions
- Secrets in process.env only, never in code
- zod for API input validation
- Structured error logging: context, userId, action, message
## Operating Instructions (Standing Rules)

These rules apply to every session and every task, unless a specific prompt overrides them.

### Permissions

Run Codex in Agent (full access) mode. Do not ask for approval on file edits, bash commands, or git operations. Just execute. Exception: anything destructive the user didn't ask for requires confirmation.

### Database

There is no live Postgres database yet. For any Prisma command that requires DATABASE_URL (validate, generate), use placeholder: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/arena` inline on the command. Never run `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push`. Migration files should be written to packages/database/prisma/migrations/ but not executed.

### Commits

After completing a task, update README.md to reflect the new state, then run: `git add .`, `git commit -m "<descriptive message>"`, `git push`. Do this without being prompted at the end of any task that produced file changes.

### Testing

If a test fails, fix the root cause. Do not weaken test assertions. Tests marked `.skip` with a comment explaining a real-DB requirement are acceptable; don't remove them.

### Unknown commands / missing tools

If you need a tool that isn't installed, install it. Add to package.json appropriately.

### When in doubt

Pick the simpler option and note your choice in the final summary. Don't pause to ask mid-task unless the decision is genuinely irreversible.
