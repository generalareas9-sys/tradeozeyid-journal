import { describe, expect, it } from 'vitest';
import { generateId, generateIds, isValidId } from '../../src/lib/ids.js';

/** Reads the 48-bit Unix millisecond timestamp out of a UUIDv7. */
function embeddedTimestamp(id: string): number {
  return Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}

describe('generateId (ADR-008, UUIDv7)', () => {
  it('produces a syntactically valid UUID', () => {
    expect(isValidId(generateId())).toBe(true);
  });

  it('sets the version nibble to 7 and the RFC 4122 variant', () => {
    const id = generateId();

    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('embeds the current time in the leading 48 bits', () => {
    const before = Date.now();
    const id = generateId();
    const after = Date.now();

    expect(embeddedTimestamp(id)).toBeGreaterThanOrEqual(before);
    expect(embeddedTimestamp(id)).toBeLessThanOrEqual(after);
  });

  it('never moves backwards in time', () => {
    const ids = Array.from({ length: 200 }, () => generateId());
    const timestamps = ids.map(embeddedTimestamp);

    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it('sorts lexicographically across millisecond boundaries', async () => {
    // Within a single millisecond the 62 trailing bits are random, so UUIDv7
    // does not promise lexical order there. The ordering guarantee is time
    // order across milliseconds, which is what keeps index inserts local.
    const earlier = generateId();
    const earlierMs = embeddedTimestamp(earlier);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const later = generateId();

    expect(embeddedTimestamp(later)).toBeGreaterThan(earlierMs);
    expect(earlier < later).toBe(true);
  });

  it('does not repeat', () => {
    expect(new Set(generateIds(1000)).size).toBe(1000);
  });

  it('rejects malformed identifiers', () => {
    expect(isValidId('not-a-uuid')).toBe(false);
    expect(isValidId('')).toBe(false);
  });
});