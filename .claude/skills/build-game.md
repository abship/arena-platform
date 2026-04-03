---
name: build-game
description: Step-by-step workflow for building a complete Arena.gg game from spec to tested deployment
---

# Build Game Skill

When asked to build a game, follow this exact workflow:

## Step 1: Read the Spec
- Read /CLAUDE.md and find the specific game entry
- Identify: engine class (A/B/C/D), money model, tier, player count, unique mechanics

## Step 2: Check Dependencies
- Verify servers/game-server/ base classes exist
- Verify packages/shared/ interfaces exist
- Verify packages/wallet/ is available for money operations
- Verify packages/matchmaking/ is available for match lifecycle

## Step 3: Build Server
- Create games/[name]/server/index.ts extending correct base class
- Create games/[name]/server/game-logic.ts with all game rules and physics
- Create games/[name]/server/types.ts with game-specific types
- Create games/[name]/server/constants.ts with game config (tick rate, max players, etc)
- Create games/[name]/server/package.json with dependencies

## Step 4: Build Client
- Create games/[name]/client/index.ts with Pixi.js (or Three.js) renderer
- Create games/[name]/client/ui.ts with HUD overlay, cash-out button, leaderboard
- Create games/[name]/client/input.ts with mouse/keyboard input handling
- Create games/[name]/client/network.ts with WebSocket connection and state interpolation
- Create games/[name]/client/package.json with dependencies

## Step 5: Implement Money
- Wire entry fee deduction through wallet.deductEntryFee on match start
- Implement in-game value tracking per money model
- Wire prize distribution through wallet.awardPrize on match end
- Apply correct rake tier (under $1 = 10%, $1-$10 = 8%, over $10 = 5%)

## Step 6: Test
- Create games/[name]/server/game-logic.test.ts
- Test: player join, player input, collision/interaction, win condition, money distribution, edge cases
- Run tests: npx vitest games/[name]/

## Step 7: Verify
- Server is authoritative (no game outcomes on client)
- Money accounting is correct (entry fees in = prizes out + rake)
- All TypeScript strict mode, no any types
- All functions have JSDoc comments
