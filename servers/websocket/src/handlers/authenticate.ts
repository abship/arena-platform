import type { GatewaySocket } from '../types.js';
import { verifyToken } from '../lib/verify-token.js';

type MiddlewareNext = (error?: Error) => void;

export interface CreateAuthenticateHandlerDependencies {
  readonly jwtSecret: string;
}

/**
 * Create the Socket.io authentication middleware for handshake JWT validation.
 *
 * @param dependencies - Middleware dependencies
 * @returns A Socket.io middleware function
 */
export function createAuthenticateHandler(
  dependencies: CreateAuthenticateHandlerDependencies,
): (socket: GatewaySocket, next: MiddlewareNext) => void {
  return (socket, next) => {
    try {
      const token = readHandshakeToken(socket);
      const { userId } = verifyToken(token, dependencies.jwtSecret);

      socket.data.userId = userId;
      socket.data.joinedMatchIds = new Set();

      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  };
}

function readHandshakeToken(socket: GatewaySocket): string {
  const authToken = socket.handshake.auth['token'];
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }

  const queryToken = socket.handshake.query['token'];
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }

  throw new Error('Missing token');
}
