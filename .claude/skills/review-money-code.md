---
name: review-money-code
description: Checklist for reviewing any code that touches money, wallets, payments, or entry fees
---

# Review Money Code Skill

Run through this checklist for any code touching money:

## Database Transaction Safety
- All balance changes wrapped in prisma.$transaction with isolation: Serializable
- Optimistic locking: version field checked and incremented on every balance update
- No balance reads outside of the transaction that are used for decisions inside it

## Double-Entry Verification
- Every credit has a corresponding debit (or vice versa)
- Transaction records include: walletId, type (DEBIT/CREDIT), amount, reference, matchId
- Sum of all debits = sum of all credits for any given match

## Entry Fee Flow
- Balance checked INSIDE the transaction, not before it
- Entry fee deducted atomically (check + deduct in same transaction)
- If match creation fails after fee deduction, fee is refunded
- Player cannot enter two matches if combined fees exceed balance

## Prize Distribution Flow
- Prize pool = sum of entry fees - rake
- All prizes distributed in a single transaction
- If distribution partially fails, entire transaction rolls back
- Winner placement verified by game server before distribution

## Rake Calculation
- Correct tier applied: under $1 = 10%, $1-$10 = 8%, over $10 = 5%
- Rake credited to platform wallet
- Rake amount recorded in transaction reference

## Edge Cases
- What if player disconnects mid-match? Is their money safe?
- What if server crashes? Are in-progress transactions rolled back?
- What if two requests to cash-out arrive simultaneously?
- What if entry fee currency differs from prize currency?
