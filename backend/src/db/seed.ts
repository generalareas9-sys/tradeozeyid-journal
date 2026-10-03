import { getDb, closeDb } from './index.js';
import { generateId } from '../lib/ids.js';
import { instrumentSpecs } from './schema/instrument.js';
import { and, eq, isNull } from 'drizzle-orm';

const SEED_BROKER = 'Exness';
const SEED_SYMBOL = 'XAUUSDc';

async function seed(): Promise<void> {
  const db = getDb();

  const existing = await db
    .select({ id: instrumentSpecs.id })
    .from(instrumentSpecs)
    .where(
      and(
        eq(instrumentSpecs.broker, SEED_BROKER),
        eq(instrumentSpecs.symbol, SEED_SYMBOL),
        eq(instrumentSpecs.accountType, 'live'),
        isNull(instrumentSpecs.userId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    console.log(`${SEED_BROKER} ${SEED_SYMBOL} seed already exists, skipping.`);
    return;
  }

  // ADR-008: identifiers are generated in the application layer, never by the
  // database, so the seed supplies its own id.
  await db.insert(instrumentSpecs).values({
    id: generateId(),
    broker: SEED_BROKER,
    symbol: SEED_SYMBOL,
    contractSize: '1',
    lotStep: '0.01',
    minLot: '0.01',
    maxLot: '100.00000000',
    currency: 'USD',
    accountType: 'live',
    isDefault: true,
    userId: null,
  });

  console.log(`Seeded ${SEED_BROKER} ${SEED_SYMBOL} (contract size 1, lot step 0.01).`);
}

seed()
  .then(closeDb)
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    await closeDb();
    process.exit(1);
  });