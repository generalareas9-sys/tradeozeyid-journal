import { ValidationError } from '../../lib/errors.js';
import { writeAudit } from '../audit/audit.service.js';
import * as repo from './trade-reviews.repository.js';
import type { Request } from 'express';

/**
 * Trade review business logic (engineering-contract.md §5, api-spec.md §9.4).
 */
export interface TradeReviewResource {
  tradeId: string;
  confidenceBefore: number | null;
  fearBefore: number | null;
  fomoBefore: number | null;
  patienceBefore: number | null;
  followedPlan: boolean | null;
  brokeRules: boolean | null;
  revengeTrade: boolean | null;
  overtraded: boolean | null;
  enteredEarly: boolean | null;
  movedStop: boolean | null;
  rulesFollowed: number | null;
  rating: number | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
}

function toResource(review: repo.TradeReviewRow): TradeReviewResource {
  return {
    tradeId: review.tradeId,
    confidenceBefore: review.confidenceBefore ?? null,
    fearBefore: review.fearBefore ?? null,
    fomoBefore: review.fomoBefore ?? null,
    patienceBefore: review.patienceBefore ?? null,
    followedPlan: review.followedPlan ?? null,
    brokeRules: review.brokeRules ?? null,
    revengeTrade: review.revengeTrade ?? null,
    overtraded: review.overtraded ?? null,
    enteredEarly: review.enteredEarly ?? null,
    movedStop: review.movedStop ?? null,
    rulesFollowed: review.rulesFollowed ?? null,
    rating: review.rating ?? null,
    body: review.body ?? null,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}

export async function getTradeReview(userId: string, tradeId: string): Promise<TradeReviewResource | null> {
  const review = await repo.getTradeReview(userId, tradeId);
  if (!review) return null;
  return toResource(review);
}

export async function upsertTradeReview(
  userId: string,
  tradeId: string,
  input: {
    confidenceBefore?: number | null;
    fearBefore?: number | null;
    fomoBefore?: number | null;
    patienceBefore?: number | null;
    followedPlan?: boolean | null;
    brokeRules?: boolean | null;
    revengeTrade?: boolean | null;
    overtraded?: boolean | null;
    enteredEarly?: boolean | null;
    movedStop?: boolean | null;
    rulesFollowed?: number | null;
    rating?: number | null;
    body?: string | null;
  },
  req: Request,
): Promise<TradeReviewResource> {
  // Validate 1-5 scales
  const scaleFields = ['confidenceBefore', 'fearBefore', 'fomoBefore', 'patienceBefore'] as const;
  for (const field of scaleFields) {
    const value = input[field];
    if (value !== undefined && value !== null && (value < 1 || value > 5)) {
      throw new ValidationError([{ path: field, message: 'Must be between 1 and 5' }]);
    }
  }

  // Validate rulesFollowed 0-100
  if (input.rulesFollowed !== undefined && input.rulesFollowed !== null && (input.rulesFollowed < 0 || input.rulesFollowed > 100)) {
    throw new ValidationError([{ path: 'rulesFollowed', message: 'Must be between 0 and 100' }]);
  }

  // Validate rating 1-5
  if (input.rating !== undefined && input.rating !== null && (input.rating < 1 || input.rating > 5)) {
    throw new ValidationError([{ path: 'rating', message: 'Must be between 1 and 5' }]);
  }

  const review = await repo.upsertTradeReview(userId, tradeId, input);

  await writeAudit({
    actorUserId: userId,
    action: 'trade.review.upsert',
    entityType: 'trade_review',
    entityId: review.id,
    req,
  });

  return toResource(review);
}