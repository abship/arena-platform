/**
 * In-memory matchmaking queue for the Arena.gg platform.
 *
 * Organizes players into buckets keyed by `${gameId}:${entryFeeCents}`.
 * Double-queue prevention: a player cannot be in the same bucket twice,
 * but can be queued for different games or fee tiers simultaneously.
 *
 * NOTE: This is an in-memory-only data structure. It does NOT survive server
 * restarts. Acceptable for Phase 1 through beta.
 *
 * TODO: Swap to Redis/Upstash-backed queue when in-memory queue limitations
 * become a problem (multi-server deployments, persistence across restarts).
 * The swap point is this file — implement a RedisMatchQueue with the same
 * public interface and inject it via the factory.
 */

import type { UserId } from '@arena/shared';
import type { GameId, Money } from '@arena/shared';
import { ValidationError } from '@arena/shared';

/**
 * In-memory matchmaking queue with per-(gameId, entryFeeCents) buckets.
 */
export class MatchQueue {
  private readonly buckets = new Map<string, UserId[]>();

  private bucketKey(gameId: GameId, entryFeeCents: Money): string {
    return `${gameId}:${entryFeeCents}`;
  }

  private pruneBucketIfEmpty(key: string, bucket: UserId[]): void {
    if (bucket.length === 0) {
      this.buckets.delete(key);
    }
  }

  /**
   * Add a player to a queue bucket.
   * @throws ValidationError if the player is already in this exact bucket
   */
  add(userId: UserId, gameId: GameId, entryFeeCents: Money): void {
    const key = this.bucketKey(gameId, entryFeeCents);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }

    if (bucket.includes(userId)) {
      throw new ValidationError(
        `Player ${userId} is already queued for ${gameId} at ${entryFeeCents}¢`,
        { userId, gameId, entryFeeCents },
      );
    }

    bucket.push(userId);
  }

  /**
   * Remove a player from queue buckets for a game.
   * If entryFeeCents is provided, removes from that specific bucket only.
   * Otherwise, removes from ALL fee-tier buckets for the given game.
   * Idempotent: removing a player who is not queued is a no-op.
   */
  remove(userId: UserId, gameId: GameId, entryFeeCents?: Money): void {
    if (entryFeeCents !== undefined) {
      const key = this.bucketKey(gameId, entryFeeCents);
      const bucket = this.buckets.get(key);
      if (bucket) {
        const idx = bucket.indexOf(userId);
        if (idx !== -1) {
          bucket.splice(idx, 1);
          this.pruneBucketIfEmpty(key, bucket);
        }
      }
      return;
    }

    // Remove from all fee-tier buckets for this game
    const prefix = `${gameId}:`;
    for (const [key, bucket] of this.buckets) {
      if (key.startsWith(prefix)) {
        const idx = bucket.indexOf(userId);
        if (idx !== -1) {
          bucket.splice(idx, 1);
          this.pruneBucketIfEmpty(key, bucket);
        }
      }
    }
  }

  /**
   * Get all players in a specific bucket.
   * @returns A copy of the player array in add-order, or empty array if bucket doesn't exist
   */
  getBucket(gameId: GameId, entryFeeCents: Money): readonly UserId[] {
    return [...(this.buckets.get(this.bucketKey(gameId, entryFeeCents)) ?? [])];
  }

  /**
   * Check if a player is queued for a specific game (any fee tier).
   */
  hasPlayer(userId: UserId, gameId: GameId): boolean {
    const prefix = `${gameId}:`;
    for (const [key, bucket] of this.buckets) {
      if (key.startsWith(prefix) && bucket.includes(userId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the number of players in a specific bucket.
   */
  size(gameId: GameId, entryFeeCents: Money): number {
    return this.buckets.get(this.bucketKey(gameId, entryFeeCents))?.length ?? 0;
  }
}
