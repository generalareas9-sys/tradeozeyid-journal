import { describe, expect, it } from 'vitest';
import {
  extractBearerToken,
  generateCsrfToken,
  generateFamilyId,
  generateToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyToken,
} from '../../src/lib/crypto.js';

/**
 * Token material and digests (engineering-contract.md §7.3, ADR-006, ADR-007).
 *
 * §7.3 is canonical: the access token is a JWT, the refresh token is an opaque
 * 256-bit random string that is "not a JWT", and only its SHA-256 hash is stored.
 */

describe('generateToken', () => {
  it('produces 256 bits of entropy as hex', () => {
    const token = generateToken();

    // 32 bytes rendered as hex is 64 characters.
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateToken()));

    expect(tokens.size).toBe(500);
  });

  it('is not a JWT', () => {
    // A compact JWS always has exactly two dots separating three base64url parts.
    expect(generateToken().split('.')).toHaveLength(1);
  });
});

describe('hashToken', () => {
  it('is the lowercase SHA-256 hex digest', () => {
    // `echo -n "abc" | sha256sum`
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('is deterministic, so a digest can be used as the lookup key', () => {
    expect(hashToken('repeatable')).toBe(hashToken('repeatable'));
  });

  it('never returns the token itself', () => {
    const token = generateToken();

    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).toHaveLength(64);
  });

  it('separates two tokens that differ by one character', () => {
    const a = hashToken('aaaaaaaa');
    const b = hashToken('aaaaaaab');

    expect(a).not.toBe(b);
  });
});

describe('verifyToken', () => {
  it('accepts the token that produced the digest', () => {
    const token = generateToken();

    expect(verifyToken(token, hashToken(token))).toBe(true);
  });

  it('rejects a different token against a stored digest', () => {
    expect(verifyToken(generateToken(), hashToken(generateToken()))).toBe(false);
  });

  it('returns false instead of raising on a digest of the wrong length', () => {
    // `timingSafeEqual` throws when the buffers differ in length, so a corrupt row
    // must fail verification rather than crash the request.
    expect(verifyToken(generateToken(), 'abcd')).toBe(false);
  });

  it('returns false for an empty digest', () => {
    expect(verifyToken(generateToken(), '')).toBe(false);
  });
});

describe('generateFamilyId', () => {
  it('is a UUIDv7, matching the family_id column and ADR-008', () => {
    const familyId = generateFamilyId();

    expect(familyId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 500 }, () => generateFamilyId())).size).toBe(500);
  });
});

describe('generateCsrfToken', () => {
  it('is base64url and safe to put in a cookie', () => {
    const token = generateCsrfToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain('=');
  });

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 500 }, () => generateCsrfToken())).size).toBe(500);
  });
});

describe('access tokens', () => {
  const userId = '9a1c3f52-6d4e-4a1b-9c77-2f6b0e5d8a31';
  const sessionId = '3d7f9e21-55c4-4c0e-9a10-77b2c4d6e8f9';

  it('carries exactly the claims engineering-contract.md §7.2 requires', async () => {
    const token = await signAccessToken(userId, sessionId, 'user');
    const payload = await verifyAccessToken(token);

    expect(payload.sub).toBe(userId);
    expect(payload.sid).toBe(sessionId);
    expect(payload.role).toBe('user');
    expect(payload.iss).toBe('tradeozeyid');
    expect(payload.aud).toBe('tradeozeyid-client');
    expect(payload.jti).toBeTruthy();
  });

  it('expires in fifteen minutes', async () => {
    const token = await signAccessToken(userId, sessionId);
    const payload = await verifyAccessToken(token);

    const issuedAt = payload.iat ?? 0;
    const expiresAt = payload.exp ?? 0;

    expect(expiresAt - issuedAt).toBe(15 * 60);
  });

  it('never carries the password or any token material', async () => {
    const token = await signAccessToken(userId, sessionId);
    const payload = await verifyAccessToken(token);

    expect(Object.keys(payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'sid', 'sub'].sort(),
    );
  });

  it('gives each signing a distinct jti', async () => {
    const first = await verifyAccessToken(await signAccessToken(userId, sessionId));
    const second = await verifyAccessToken(await signAccessToken(userId, sessionId));

    expect(first.jti).not.toBe(second.jti);
  });

  it('rejects a token that is not a JWT at all', async () => {
    await expect(verifyAccessToken(generateToken())).rejects.toThrow();
  });
});

describe('extractBearerToken', () => {
  it('returns the token after the Bearer prefix', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('returns null for a missing header', () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('returns null for another scheme', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
  });

  it('does not accept a case variant of the scheme', () => {
    // The check is exact on purpose; accepting `bearer` would widen the header.
    expect(extractBearerToken('bearer abc')).toBeNull();
  });
});
