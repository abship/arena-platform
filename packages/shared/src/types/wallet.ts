/**
 * Wallet and transaction types for the Arena.gg platform.
 * All monetary values are represented as integer cents (USD) via the branded Money type.
 */

import type { UserId } from './user.js';
import type { MatchId } from './match.js';

/**
 * Branded number type representing USD cents as an integer.
 * NEVER use floating-point for money. All monetary values flow through this type.
 */
export type Money = number & { readonly __brand: 'Money' };

/** Branded string type for wallet IDs. */
export type WalletId = string & { readonly __brand: 'WalletId' };

/** The type of a wallet transaction. */
export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ENTRY_FEE = 'ENTRY_FEE',
  PRIZE = 'PRIZE',
  RAKE = 'RAKE',
  ADJUSTMENT = 'ADJUSTMENT',
}

/** The current status of a transaction. */
export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

/** A user's wallet holding their balance. */
export interface Wallet {
  /** Unique wallet identifier. */
  readonly id: WalletId;
  /** Owner of this wallet. */
  readonly userId: UserId;
  /** Current balance in USD cents. */
  readonly balanceCents: Money;
  /** Currency code (always "USD" for now). */
  readonly currency: string;
  /** Optimistic locking version — incremented on every update. */
  readonly version: number;
  /** When the wallet was created. */
  readonly createdAt: Date;
}

/** A financial transaction against a wallet. */
export interface Transaction {
  /** Unique transaction identifier. */
  readonly id: string;
  /** The wallet this transaction belongs to. */
  readonly walletId: WalletId;
  /** What kind of transaction this is. */
  readonly type: TransactionType;
  /** Amount in USD cents. */
  readonly amountCents: Money;
  /** Current status of the transaction. */
  readonly status: TransactionStatus;
  /** Associated match, if this is an entry fee or prize. */
  readonly matchId: MatchId | null;
  /** External reference (e.g. payment provider transaction ID). */
  readonly reference: string | null;
  /** When the transaction was created. */
  readonly createdAt: Date;
}

/**
 * A double-entry ledger entry. Every transaction creates both a debit and a credit entry
 * to maintain accounting integrity.
 */
export interface LedgerEntry {
  /** Unique ledger entry identifier. */
  readonly id: string;
  /** The transaction this entry belongs to. */
  readonly transactionId: string;
  /** The wallet being debited or credited. */
  readonly walletId: WalletId;
  /** Debit amount in USD cents (0 if this is a credit entry). */
  readonly debitCents: Money;
  /** Credit amount in USD cents (0 if this is a debit entry). */
  readonly creditCents: Money;
  /** When this entry was created. */
  readonly createdAt: Date;
}
