import request from 'supertest';
import { Prisma } from '@arena/database';
import { describe, expect, it } from 'vitest';
import { hashPassword } from '../lib/auth.js';
import { createTestContext, TEST_USER_ID } from './helpers.js';

function makeUniqueConstraintError(target: 'email' | 'username'): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed',
    {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: [target] },
    },
  );
}

describe('auth routes', () => {
  it('POST /auth/register creates a user and returns a token', async () => {
    const context = createTestContext();
    context.prisma.transactionClient.user.create.mockResolvedValue({
      id: TEST_USER_ID,
      email: 'player@example.com',
      username: 'player1',
    });
    context.prisma.transactionClient.wallet.create.mockResolvedValue({
      id: 'wallet-1',
    });

    const response = await request(context.app)
      .post('/auth/register')
      .send({
        email: 'Player@Example.com',
        username: 'player1',
        password: 'password123',
      });

    expect(response.status).toBe(201);
    expect(response.body.userId).toBe(TEST_USER_ID);
    expect(response.body.token).toEqual(expect.any(String));
    expect(context.prisma.transactionClient.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'player@example.com',
        username: 'player1',
        country: 'US',
      }),
    });
    expect(context.prisma.transactionClient.wallet.create).toHaveBeenCalledWith({
      data: {
        userId: TEST_USER_ID,
        balanceCents: 0n,
        currency: 'USD',
      },
    });
  });

  it('POST /auth/register maps duplicate email to VALIDATION_ERROR', async () => {
    const context = createTestContext();
    context.prisma.transactionClient.user.create.mockRejectedValue(
      makeUniqueConstraintError('email'),
    );

    const response = await request(context.app)
      .post('/auth/register')
      .send({
        email: 'player@example.com',
        username: 'player1',
        password: 'password123',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Email already exists');
  });

  it('POST /auth/login returns a token on valid credentials', async () => {
    const context = createTestContext();
    const passwordHash = await hashPassword('password123');
    context.prisma.user.findUnique.mockResolvedValue({
      id: TEST_USER_ID,
      email: 'player@example.com',
      passwordHash,
    });

    const response = await request(context.app)
      .post('/auth/login')
      .send({
        email: 'player@example.com',
        password: 'password123',
      });

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe(TEST_USER_ID);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it('POST /auth/login returns the same error for unknown email and wrong password', async () => {
    const unknownUserContext = createTestContext();
    unknownUserContext.prisma.user.findUnique.mockResolvedValue(null);

    const wrongPasswordContext = createTestContext();
    wrongPasswordContext.prisma.user.findUnique.mockResolvedValue({
      id: TEST_USER_ID,
      email: 'player@example.com',
      passwordHash: await hashPassword('different-password'),
    });

    const [unknownEmailResponse, wrongPasswordResponse] = await Promise.all([
      request(unknownUserContext.app)
        .post('/auth/login')
        .send({
          email: 'missing@example.com',
          password: 'password123',
        }),
      request(wrongPasswordContext.app)
        .post('/auth/login')
        .send({
          email: 'player@example.com',
          password: 'password123',
        }),
    ]);

    expect(unknownEmailResponse.status).toBe(400);
    expect(wrongPasswordResponse.status).toBe(400);
    expect(unknownEmailResponse.body).toEqual(wrongPasswordResponse.body);
    expect(unknownEmailResponse.body).toEqual({
      error: 'VALIDATION_ERROR',
      message: 'Invalid credentials',
    });
  });

  it('POST /auth/register validates the request body', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .post('/auth/register')
      .send({
        email: 'not-an-email',
        username: 'ab',
        password: 'short',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.context.issues).toEqual(expect.any(Array));
  });
});
