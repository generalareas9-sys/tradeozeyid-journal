import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { tradeReviews } from '../../db/schema/trading.js';
import { NotFoundError } from '../../lib/errors.js';
import { generateId } from '../../lib/ids.js';

export type TradeReviewRow = typeof tradeReviews.$inferSelect;

/**
 * Trade reviews data access.
 */
export async function getTradeReview(
  userId: string,
  tradeId: string,
): Promise<TradeReviewRow | undefined> {
  const rows = await getDb()
    .select()
    .from(tradeReviews)
    .where(and(eq(tradeReviews.tradeId, tradeId), eq(tradeReviews.userId, userId)))
    .limit(1);

  return rows[0];
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
): Promise<TradeReviewRow> {
  const existing = await getTradeReview(userId, tradeId);
  const now = new Date();

  if (existing) {
    const patchValues = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    );

    const rows = await getDb()
      .update(tradeReviews)
      .set({ ...patchValues, updatedAt: now })
      .where(and(eq(tradeReviews.tradeId, tradeId), eq(tradeReviews.userId, userId)))
      .returning();

    const updated = rows[0];
    if (!updated) throw new NotFoundError('Trade review not found');
    return updated;
  } else {
    const rows = await getDb()
      .insert(tradeReviews)
      .values({
        ...input,
        id: generateId(),
        tradeId,
        userId,
        createdAt: now,
        updatedAt: now,
      } as unknown as typeof tradeReviews.$inferInsert)
      .returning();

    const created = rows[0];
    if (!created) throw new Error('Trade review insert returned no row');
    return created;
  }
}