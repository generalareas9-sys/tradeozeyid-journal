import { z } from 'zod';

/**
 * Request validation for trade reviews (engineering-contract.md §7.7, api-spec.md §9.4).
 */
const smallint1to5 = z.number().int().min(1).max(5).optional().nullable();
const smallint0to100 = z.number().int().min(0).max(100).optional().nullable();
const smallint1to5rating = z.number().int().min(1).max(5).optional().nullable();
const bodyText = z.string().max(20000).optional().nullable();

/**
 * PUT /trades/:id/review schema (upsert).
 * All fields optional per api-spec.md.
 */
export const tradeReviewSchema = z
  .object({
    confidenceBefore: smallint1to5,
    fearBefore: smallint1to5,
    fomoBefore: smallint1to5,
    patienceBefore: smallint1to5,
    followedPlan: z.boolean().optional().nullable(),
    brokeRules: z.boolean().optional().nullable(),
    revengeTrade: z.boolean().optional().nullable(),
    overtraded: z.boolean().optional().nullable(),
    enteredEarly: z.boolean().optional().nullable(),
    movedStop: z.boolean().optional().nullable(),
    rulesFollowed: smallint0to100,
    rating: smallint1to5rating,
    body: bodyText,
  })
  .strict();

export type TradeReviewInput = z.infer<typeof tradeReviewSchema>;