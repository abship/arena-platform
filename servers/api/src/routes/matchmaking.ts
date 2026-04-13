import { Router } from 'express';
import {
  GameTier as PrismaGameTier,
} from '@arena/database';
import {
  GameTier as SharedGameTier,
  NotFoundError,
} from '@arena/shared';
import type {
  GameId,
  MatchId,
  MatchResult,
  Money,
  Placement,
  UserId,
} from '@arena/shared';
import { createInvalidStateError } from '../lib/errors.js';
import { withRetry } from '../middleware/with-retry.js';
import type { AppDependencies } from '../types/app-dependencies.js';
import {
  devCreateMatchBodySchema,
  devResolveMatchBodySchema,
  leaveQueueBodySchema,
  queueBodySchema,
  ratingQuerySchema,
} from '../validators/matchmaking.js';
import { parseWithSchema } from '../validators/parse.js';

const GAME_TIER_MAP: Record<PrismaGameTier, SharedGameTier> = {
  TIER_1: SharedGameTier.TIER_1,
  TIER_2: SharedGameTier.TIER_2,
  TIER_3: SharedGameTier.TIER_3,
  TIER_4: SharedGameTier.TIER_4,
};

function requireAuthenticatedUserId(req: Express.Request): UserId {
  if (!req.user) {
    throw new Error('Authenticated user missing from request');
  }

  return req.user.userId;
}

function assertDevEndpointsEnabled(enableDevEndpoints: boolean): void {
  if (!enableDevEndpoints) {
    throw new NotFoundError('Route not found');
  }
}

/**
 * Create authenticated matchmaking routes.
 *
 * @param dependencies - Application dependencies
 * @returns An Express router mounted at /matchmaking
 */
export function createMatchmakingRouter(
  dependencies: Pick<
    AppDependencies,
    'enableDevEndpoints' | 'geoService' | 'kycService' | 'matchmakingService' | 'prisma'
  >,
): Router {
  const router = Router();

  router.post('/queue', async (req, res) => {
    const userId = requireAuthenticatedUserId(req);
    const body = parseWithSchema(queueBodySchema, req.body);
    const requestContext = req.requestContext;
    const location = await dependencies.geoService.getLocation(
      requestContext?.ipAddress ?? req.ip ?? '127.0.0.1',
      requestContext?.gpsCoordinates,
    );

    const jurisdictionAllowed = await dependencies.geoService.checkJurisdiction(location);
    if (!jurisdictionAllowed) {
      throw createInvalidStateError('jurisdiction blocked', {
        reason: 'jurisdiction blocked',
        countryCode: location.countryCode,
        regionCode: location.regionCode,
      });
    }

    const game = await dependencies.prisma.game.findUnique({
      where: { id: body.gameId },
    });
    if (!game || !game.isEnabled) {
      throw new NotFoundError('Game not found', { gameId: body.gameId });
    }

    const rules = await dependencies.geoService.getRules(
      location.countryCode,
      location.regionCode ?? undefined,
    );
    const gameTier = GAME_TIER_MAP[game.tier];
    if (!rules.allowedTiers.includes(gameTier)) {
      throw createInvalidStateError('game tier not permitted in jurisdiction', {
        reason: 'game tier not permitted in jurisdiction',
        countryCode: location.countryCode,
        regionCode: location.regionCode,
        gameId: game.id,
        tier: game.tier,
      });
    }

    if (rules.minAge > 0) {
      const meetsMinimumAge = await dependencies.kycService.checkAge(
        userId,
        rules.minAge,
      );
      if (!meetsMinimumAge) {
        throw createInvalidStateError('age verification required', {
          reason: 'age verification required',
          minimumAge: rules.minAge,
          countryCode: location.countryCode,
          regionCode: location.regionCode,
        });
      }
    }

    await dependencies.matchmakingService.joinQueue(
      userId,
      body.gameId as GameId,
      body.entryFeeCents as Money,
    );

    res.json({
      queued: true,
      gameId: body.gameId,
      entryFeeCents: body.entryFeeCents,
    });
  });

  router.delete('/queue', async (req, res) => {
    const userId = requireAuthenticatedUserId(req);
    const body = parseWithSchema(leaveQueueBodySchema, req.body);

    await dependencies.matchmakingService.leaveQueue(userId, body.gameId as GameId);
    res.json({ dequeued: true });
  });

  /**
   * DEV-ONLY endpoint. Disabled in production unless ENABLE_DEV_ENDPOINTS=true.
   * This exists only to exercise the manual createMatch flow until auto-matching ships.
   */
  router.post('/dev/create-match', withRetry(async (req, res) => {
    assertDevEndpointsEnabled(dependencies.enableDevEndpoints);
    const body = parseWithSchema(devCreateMatchBodySchema, req.body);

    const match = await dependencies.matchmakingService.createMatch(
      body.gameId as GameId,
      body.playerIds as unknown as readonly UserId[],
      body.entryFeeCents as Money,
    );

    res.json(match);
  }));

  /**
   * DEV-ONLY endpoint. Disabled in production unless ENABLE_DEV_ENDPOINTS=true.
   * This exists only to exercise the manual resolveMatch flow until auto-matching ships.
   */
  router.post('/dev/resolve-match', withRetry(async (req, res) => {
    assertDevEndpointsEnabled(dependencies.enableDevEndpoints);
    const body = parseWithSchema(devResolveMatchBodySchema, req.body);

    const result: MatchResult = body.result.map((placement) => ({
      userId: placement.userId as UserId,
      position: placement.position,
      payoutCents: placement.payoutCents as Money,
    })) as readonly Placement[];

    const match = await dependencies.matchmakingService.resolveMatch(
      body.matchId as MatchId,
      result,
    );

    res.json(match);
  }));

  router.get('/rating', async (req, res) => {
    const userId = requireAuthenticatedUserId(req);
    const query = parseWithSchema(ratingQuerySchema, req.query);
    const rating = await dependencies.matchmakingService.getRating(
      userId,
      query.gameId as GameId,
    );

    res.json(rating);
  });

  return router;
}
