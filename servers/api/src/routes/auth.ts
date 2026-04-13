import { Router } from 'express';
import { Prisma } from '@arena/database';
import { ValidationError } from '@arena/shared';
import type { UserId } from '@arena/shared';
import type { AppDependencies } from '../types/app-dependencies.js';
import {
  hashPassword,
  signToken,
  verifyPassword,
} from '../lib/auth.js';
import {
  loginBodySchema,
  registerBodySchema,
} from '../validators/auth.js';
import { parseWithSchema } from '../validators/parse.js';

function toDuplicateCredentialError(error: unknown): ValidationError | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = Array.isArray(error.meta?.['target'])
      ? error.meta?.['target']
      : [];

    if (target.includes('email')) {
      return new ValidationError('Email already exists');
    }

    if (target.includes('username')) {
      return new ValidationError('Username already exists');
    }

    return new ValidationError('Email or username already exists');
  }

  return null;
}

/**
 * Create auth routes for user registration and login.
 *
 * @param dependencies - Application dependencies
 * @returns An Express router mounted at /auth
 */
export function createAuthRouter(
  dependencies: Pick<AppDependencies, 'prisma'>,
): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const body = parseWithSchema(registerBodySchema, req.body);
    const passwordHash = await hashPassword(body.password);

    try {
      const user = await dependencies.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: body.email,
            passwordHash,
            username: body.username,
            country: 'US',
            region: null,
          },
        });

        await tx.wallet.create({
          data: {
            userId: createdUser.id,
            balanceCents: 0n,
            currency: 'USD',
          },
        });

        return createdUser;
      });

      res.status(201).json({
        userId: user.id,
        token: signToken(user.id as UserId),
      });
    } catch (error) {
      const duplicateCredentialError = toDuplicateCredentialError(error);
      if (duplicateCredentialError) {
        throw duplicateCredentialError;
      }

      throw error;
    }
  });

  router.post('/login', async (req, res) => {
    const body = parseWithSchema(loginBodySchema, req.body);
    const user = await dependencies.prisma.user.findUnique({
      where: { email: body.email },
    });

    if (!user) {
      throw new ValidationError('Invalid credentials');
    }

    const passwordMatches = await verifyPassword(body.password, user.passwordHash);
    if (!passwordMatches) {
      throw new ValidationError('Invalid credentials');
    }

    res.json({
      userId: user.id,
      token: signToken(user.id as UserId),
    });
  });

  return router;
}
