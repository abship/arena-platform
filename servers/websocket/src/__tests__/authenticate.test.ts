import { afterEach, describe, expect, it } from 'vitest';
import type { UserId } from '@arena/shared';
import {
  cleanupTestContext,
  connectClient,
  connectExpectingError,
  createTestGatewayContext,
  signTestToken,
} from './helpers.js';

const USER_ID = 'user-auth' as UserId;

describe('authenticate middleware', () => {
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

  it('accepts a valid JWT from handshake.auth.token', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);

    const client = await connectClient(context.port, {
      token: signTestToken(USER_ID),
    });
    clients.push(client);

    expect(client.connected).toBe(true);
  });

  it('rejects an invalid JWT', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);

    const error = await connectExpectingError(context.port, {
      token: 'not-a-jwt',
    });

    expect(error.message).toBe('UNAUTHORIZED');
  });

  it('rejects an expired JWT', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);

    const error = await connectExpectingError(context.port, {
      token: signTestToken(USER_ID, { expiresIn: -1 }),
    });

    expect(error.message).toBe('UNAUTHORIZED');
  });

  it('rejects a missing token', async () => {
    const context = await createTestGatewayContext();
    contexts.push(context);

    const error = await connectExpectingError(context.port, {});

    expect(error.message).toBe('UNAUTHORIZED');
  });
});
