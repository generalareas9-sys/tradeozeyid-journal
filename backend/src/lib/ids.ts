import { randomBytes } from 'node:crypto';

const ID_BYTES = 16;
const UUID_VERSION = 7;
const UUID_VARIANT_MASK = 0x3f;
const VARIANT_RFC4122 = 0x80;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Generates a UUIDv7 (time-ordered UUID) — ADR-008.
 *
 * Layout: 48 bits of Unix epoch milliseconds, the 4-bit version, 12 bits of
 * randomness, the 2-bit RFC 4122 variant, then 62 bits of randomness. Being
 * time-ordered is the whole point: it keeps primary-key inserts close together
 * in the index.
 */
export function generateId(): string {
  const bytes = randomBytes(ID_BYTES);

  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = UUID_VERSION << 4 | (bytes[6] & 0x0f);
  bytes[8] = VARIANT_RFC4122 | (bytes[8] & UUID_VARIANT_MASK);

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Generates `count` distinct UUIDv7 identifiers. */
export function generateIds(count: number): string[] {
  return Array.from({ length: count }, () => generateId());
}

/** True when `id` is a syntactically valid UUID of any RFC 4122 version. */
export function isValidId(id: string): boolean {
  return UUID_PATTERN.test(id);
}