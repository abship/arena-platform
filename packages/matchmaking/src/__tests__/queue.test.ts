import { describe, it, expect } from 'vitest';
import type { UserId, GameId, Money } from '@arena/shared';
import { ValidationError } from '@arena/shared';
import { MatchQueue } from '../queue.js';

const user1 = 'user-1' as UserId;
const user2 = 'user-2' as UserId;
const game1 = 'agario' as GameId;
const game2 = 'poker' as GameId;
const fee100 = 100 as Money;
const fee500 = 500 as Money;

describe('MatchQueue', () => {
  it('add then hasPlayer → true', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    expect(q.hasPlayer(user1, game1)).toBe(true);
  });

  it('add, remove, hasPlayer → false', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.remove(user1, game1);
    expect(q.hasPlayer(user1, game1)).toBe(false);
  });

  it('add same user twice to same bucket → throws ValidationError', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    expect(() => q.add(user1, game1, fee100)).toThrow(ValidationError);
  });

  it('add same user to different games → allowed', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.add(user1, game2, fee100);
    expect(q.hasPlayer(user1, game1)).toBe(true);
    expect(q.hasPlayer(user1, game2)).toBe(true);
  });

  it('add same user to different fee tiers → allowed', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.add(user1, game1, fee500);
    expect(q.size(game1, fee100)).toBe(1);
    expect(q.size(game1, fee500)).toBe(1);
  });

  it('remove without prior add → no-op, no throw', () => {
    const q = new MatchQueue();
    expect(() => q.remove(user1, game1)).not.toThrow();
  });

  it('getBucket returns players in add-order', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.add(user2, game1, fee100);
    const bucket = q.getBucket(game1, fee100);
    expect(bucket).toEqual([user1, user2]);
  });

  it('getBucket returns empty array for nonexistent bucket', () => {
    const q = new MatchQueue();
    expect(q.getBucket(game1, fee100)).toEqual([]);
  });

  it('size returns 0 for nonexistent bucket', () => {
    const q = new MatchQueue();
    expect(q.size(game1, fee100)).toBe(0);
  });

  it('remove with specific entryFeeCents only removes from that bucket', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.add(user1, game1, fee500);
    q.remove(user1, game1, fee100);
    expect(q.size(game1, fee100)).toBe(0);
    expect(q.size(game1, fee500)).toBe(1);
  });

  it('remove without entryFeeCents removes from all buckets for that game', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.add(user1, game1, fee500);
    q.remove(user1, game1);
    expect(q.hasPlayer(user1, game1)).toBe(false);
  });

  it('removing the last player prunes the empty bucket', () => {
    const q = new MatchQueue();
    q.add(user1, game1, fee100);
    q.remove(user1, game1, fee100);

    const buckets = (q as unknown as { buckets: Map<string, readonly UserId[]> }).buckets;
    expect(buckets.size).toBe(0);
  });
});
