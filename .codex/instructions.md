# Codex Project Instructions for Arena.gg

You are building Arena.gg, a real-money competitive gaming platform. Read AGENTS.md at the repo root for full project specs.

## Your Role
You are one of two AI agents. The other is Claude Code. You work on DIFFERENT files to avoid conflicts. Check AGENTS.md for your territory assignments per stage.

## Rules
- TypeScript strict mode always. Never use any type.
- Named exports only. async/await only.
- kebab-case filenames.
- Vitest for all tests.
- Prisma for all database operations.
- zod for API input validation.
- Never modify files in Claude Code's territory (check AGENTS.md territory assignments).
- Always read AGENTS.md before starting any task.

## When Building Database (packages/database/)
- Use Prisma ORM
- Every table needs proper indexes
- All money fields use Decimal type, never Float
- Include version column on wallets table for optimistic locking
- Transactions table uses double-entry (DEBIT and CREDIT rows)

## When Building API (servers/api/)
- Express with TypeScript
- JWT auth middleware on protected routes
- zod validation on every endpoint
- Proper HTTP status codes (201 created, 400 bad request, 401 unauthorized, 404 not found)
- Import types from packages/shared/
- Import wallet functions from packages/wallet/

## When Building WebSocket Gateway (servers/websocket/)
- Socket.io
- Authenticate JWT on connection handshake
- Route connections to correct game instance by matchId
- Handle disconnect with 30-second reconnection timer
- Emit match-ready to matched players

## When Building Game Clients (games/*/client/)
- Pixi.js for 2D (all games except krunker)
- Three.js for 3D (krunker only)
- Client only sends inputs, never resolves game outcomes
- Interpolate between server state updates for smooth rendering
- HUD shows: cash value, cash-out button, leaderboard, kill feed
- Cash-out button: visible after 60s alive, clickable when value > entry fee

## Money Safety
- Never manipulate wallet balances directly
- All money operations go through the wallet service
- Entry fees deducted atomically inside database transactions
- Prize distribution in single transaction with rollback on failure
