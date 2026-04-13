import { afterEach, describe, expect, it } from 'vitest';
import type { MatchId, MatchResult, Money, UserId } from '@arena/shared';
import {
  cleanupTestContext,
  connectClient,
  createTestGatewayContext,
  emitJoinMatch,
  expectNoEvent,
  seedMatch,
  signTestToken,
  wait,
  waitForEvent,
} from './helpers.js';

const MATCH_ID = 'match-broadcast' as MatchId;
const OTHER_MATCH_ID = 'match-broadcast-other' as MatchId;
const USER_ID = 'user-broadcast-1' as UserId;
const OTHER_USER_ID = 'user-broadcast-2' as UserId;

describe('broadcaster subscriptions', () => {
  const contexts: Awaited<ReturnType<typeof createTestGatewayContext>>[] = [];
  const clients: Awaited<ReturnType<typeof connectClient>>[] = [];

  afterEach(async () => {
    while (contexts.length > 0) {
      const context = contexts.pop();
      if (!context) {
        continue;
      }

      await cleanupTestContext(context, clients.splice(0));
    }
  });

  it('forwards state only to sockets in the matching room', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 0 });
    seedMatch(context, OTHER_MATCH_ID, [OTHER_USER_ID], { counter: 0 });

    const firstClient = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    const secondClient = await connectClient(context.port, {
      token: signTestToken(OTHER_USER_ID),
    });
    clients.push(firstClient, secondClient);

    await emitJoinMatch(firstClient, { matchId: MATCH_ID });
    await emitJoinMatch(secondClient, { matchId: OTHER_MATCH_ID });

    const statePromise = waitForEvent(firstClient, 'state');
    context.broadcaster.emitState(MATCH_ID, { counter: 5 });

    const state = await statePromise;

    expect(state).toEqual({ counter: 5 });
    await expectNoEvent(secondClient, 'state');
  });

  it('forwards player joined and player left events to the room', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID], { counter: 0 });

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    await emitJoinMatch(client, { matchId: MATCH_ID });

    const joinedPromise = waitForEvent(client, 'player-joined');
    context.broadcaster.emitPlayerJoined(MATCH_ID, OTHER_USER_ID);
    const joined = await joinedPromise;
    expect(joined).toEqual({ userId: OTHER_USER_ID });

    const leftPromise = waitForEvent(client, 'player-left');
    context.broadcaster.emitPlayerLeft(MATCH_ID, OTHER_USER_ID);
    const left = await leftPromise;
    expect(left).toEqual({ userId: OTHER_USER_ID });
  });

  it('forwards match-end and removes sockets from the room', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);
    seedMatch(context, MATCH_ID, [USER_ID, OTHER_USER_ID], { counter: 0 });

    const firstClient = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    const secondClient = await connectClient(context.port, {
      token: signTestToken(OTHER_USER_ID),
    });
    clients.push(firstClient, secondClient);

    await emitJoinMatch(firstClient, { matchId: MATCH_ID });
    await emitJoinMatch(secondClient, { matchId: MATCH_ID });

    const result: MatchResult = [
      { userId: USER_ID, position: 1, payoutCents: 100 as Money },
      { userId: OTHER_USER_ID, position: 2, payoutCents: 0 as Money },
    ];

    const firstResultPromise = waitForEvent(firstClient, 'match-end');
    const secondResultPromise = waitForEvent(secondClient, 'match-end');
    context.broadcaster.emitMatchEnd(MATCH_ID, result);

    const firstResult = await firstResultPromise;
    const secondResult = await secondResultPromise;

    expect(firstResult).toEqual(result);
    expect(secondResult).toEqual(result);

    context.broadcaster.emitState(MATCH_ID, { counter: 99 });
    await expectNoEvent(firstClient, 'state');
    await expectNoEvent(secondClient, 'state');

    await wait(25);
  });
});
