import { z } from 'zod';

const gameIdSchema = z.string().min(1);
const userIdSchema = z.string().min(1);
const amountCentsSchema = z.number().int().positive().max(100_000_000);

/** Request body schema for POST /matchmaking/queue. */
export const queueBodySchema = z.object({
  gameId: gameIdSchema,
  entryFeeCents: amountCentsSchema,
});

/** Request body schema for DELETE /matchmaking/queue. */
export const leaveQueueBodySchema = z.object({
  gameId: gameIdSchema,
});

/** Request body schema for POST /matchmaking/dev/create-match. */
export const devCreateMatchBodySchema = z.object({
  gameId: gameIdSchema,
  playerIds: z.array(userIdSchema).min(2),
  entryFeeCents: amountCentsSchema,
});

const placementSchema = z.object({
  userId: userIdSchema,
  position: z.number().int().positive(),
  payoutCents: z.number().int().nonnegative().default(0),
});

/** Request body schema for POST /matchmaking/dev/resolve-match. */
export const devResolveMatchBodySchema = z.object({
  matchId: z.string().min(1),
  result: z.array(placementSchema).min(1),
});

/** Query schema for GET /matchmaking/rating. */
export const ratingQuerySchema = z.object({
  gameId: gameIdSchema,
});
