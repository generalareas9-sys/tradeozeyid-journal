import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getEnv } from '../config/index.js';
import { generateId } from './ids.js';

/**
 * Token and digest helpers (engineering-contract.md §7.2, §7.3).
 *
 * §7.3 is canonical: the **access** token is a JWT, the **refresh** token is an
 * opaque 256-bit random string and is explicitly "not a JWT". Only the SHA-256
 * hash of the refresh token is ever stored.
 */
const TOKEN_BYTES = 32;
const HASH_ALGORITHM = 'sha256';

/**
 * Opaque token material for `http_rt` and password-reset tokens.
 * 32 random bytes = 256 bits of entropy, per §7.3.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/** SHA-256 hex digest. This, and never the token itself, is what is stored. */
export function hashToken(token: string): string {
  return createHash(HASH_ALGORITHM).update(token).digest('hex');
}

/**
 * Constant-time comparison of a presented token against a stored digest.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, so the length
 * is compared first and a mismatch returns false instead of raising. A corrupt or
 * legacy `token_hash` row must fail verification, not crash the request.
 */
export function verifyToken(token: string, tokenHash: string): boolean {
  const computed = Buffer.from(hashToken(token), 'hex');

  let stored: Buffer;
  try {
    stored = Buffer.from(tokenHash, 'hex');
  } catch {
    return false;
  }

  if (stored.length !== computed.length || stored.length === 0) {
    return false;
  }

  return timingSafeEqual(computed, stored);
}

/**
 * A refresh-token family identifier.
 *
 * `refresh_tokens.family_id` is a `uuid` column and ADR-008 requires UUIDv7
 * generated in the application layer, so this uses the same generator as every
 * other id rather than emitting a bare hex string.
 */
export function generateFamilyId(): string {
  return generateId();
}

/** Random CSRF token, readable by JavaScript by design (§7.5). */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

const getJwtConfig = () => {
  const env = getEnv();
  return {
    accessSecret: new TextEncoder().encode(env.JWT_ACCESS_SECRET),
    issuer: 'tradeozeyid',
    audience: 'tradeozeyid-client',
  };
};

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  sid: string;
  role: string;
  jti: string;
}

/**
 * Signs the short-lived access token. §7.2: claims `sub`, `sid`, `role`, `iat`,
 * `exp`, `jti`, lifetime 15 minutes.
 */
export async function signAccessToken(
  userId: string,
  sessionId: string,
  role: string = 'user',
): Promise<string> {
  const { accessSecret, issuer, audience } = getJwtConfig();
  const jwtId = randomBytes(16).toString('hex');

  return new SignJWT({ sub: userId, sid: sessionId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(jwtId)
    .setExpirationTime(getEnv().ACCESS_TOKEN_TTL)
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { accessSecret, issuer, audience } = getJwtConfig();

  const { payload } = await jwtVerify<AccessTokenPayload>(token, accessSecret, {
    issuer,
    audience,
  });

  return payload as AccessTokenPayload;
}

/**
 * Bearer tokens are accepted **only** in `NODE_ENV=test`
 * (engineering-contract.md §7.1). Browsers authenticate with cookies.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7);
}