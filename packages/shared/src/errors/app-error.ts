/**
 * Base error class and concrete error subclasses for the Arena.gg platform.
 * All application errors extend AppError and carry a machine-readable code,
 * an HTTP status code, and optional structured context.
 */

/** Abstract base class for all application errors. */
export abstract class AppError extends Error {
  /** Machine-readable error code (e.g. "INSUFFICIENT_FUNDS"). */
  abstract readonly code: string;
  /** HTTP status code to return in API responses. */
  abstract readonly statusCode: number;
  /** Optional structured context for logging. */
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
  }
}

/** Error code for validation failures. */
export const VALIDATION_ERROR = 'VALIDATION_ERROR' as const;

/** Thrown when input validation fails (HTTP 400). */
export class ValidationError extends AppError {
  readonly code = VALIDATION_ERROR;
  readonly statusCode = 400;
}

/** Error code for resource not found. */
export const NOT_FOUND_ERROR = 'NOT_FOUND' as const;

/** Thrown when a requested resource does not exist (HTTP 404). */
export class NotFoundError extends AppError {
  readonly code = NOT_FOUND_ERROR;
  readonly statusCode = 404;
}

/** Error code for insufficient funds. */
export const INSUFFICIENT_FUNDS_ERROR = 'INSUFFICIENT_FUNDS' as const;

/** Thrown when a wallet does not have enough balance for an operation (HTTP 402). */
export class InsufficientFundsError extends AppError {
  readonly code = INSUFFICIENT_FUNDS_ERROR;
  readonly statusCode = 402;
}

/** Error code for unauthorized access. */
export const UNAUTHORIZED_ERROR = 'UNAUTHORIZED' as const;

/** Thrown when authentication is required but missing or invalid (HTTP 401). */
export class UnauthorizedError extends AppError {
  readonly code = UNAUTHORIZED_ERROR;
  readonly statusCode = 401;
}

/** Error code for forbidden access. */
export const FORBIDDEN_ERROR = 'FORBIDDEN' as const;

/** Thrown when the user does not have permission for the requested action (HTTP 403). */
export class ForbiddenError extends AppError {
  readonly code = FORBIDDEN_ERROR;
  readonly statusCode = 403;
}

/** Error code for conflict / optimistic locking failures. */
export const CONFLICT_ERROR = 'CONFLICT' as const;

/** Thrown when a write conflicts with existing state (e.g. version mismatch) (HTTP 409). */
export class ConflictError extends AppError {
  readonly code = CONFLICT_ERROR;
  readonly statusCode = 409;
}

/** Error code for jurisdiction restrictions. */
export const JURISDICTION_ERROR = 'JURISDICTION_BLOCKED' as const;

/** Thrown when an action is blocked due to jurisdiction/legal restrictions (HTTP 451). */
export class JurisdictionError extends AppError {
  readonly code = JURISDICTION_ERROR;
  readonly statusCode = 451;
}
