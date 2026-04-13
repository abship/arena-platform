import type { UserId } from '@arena/shared';
import type { RequestContext } from '../middleware/request-context.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: UserId;
      };
      requestContext?: RequestContext;
    }
  }
}

export {};
