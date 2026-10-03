import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getEnv } from '../config/index.js';

const TOKEN_BYTES = 32;
const HASH_ALGORITHM = 'sha256';

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashToken(token: string): string {
  return createHash(HASH_ALGORITHM).update(token).digest('hex');
}

export function verifyToken(token: string, tokenHash: string): boolean {
  const computedHash = hashToken(token);
  return timingSafeEqual(Buffer.from(computedHash), Buffer.from(tokenHash));
}

export function generateFamilyId(): string {
  return randomBytes(16).toString('hex');
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

const getJwtConfig = () => {
  const env = getEnv();
  return {
    accessSecret: new TextEncoder().encode(env.JWT_ACCESS_SECRET),
    refreshSecret: new TextEncoder().encode(env.JWT_REFRESH_SECRET),
    issuer: 'tradeozeyid',
    audience: 'tradeozeyid-client',
  };
}

interface AccessTokenPayload extends JWTPayload {
  sub: string;
  sid: string;
  role: string;
  jti: string;
}

interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  fid: string;
  jti: string;
}

export async function signAccessToken(
  userId: string,
  sessionId: string,
  role: string = 'user'
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

export async function signRefreshToken(
  userId: string,
  familyId: string
): Promise<string> {
  const { refreshSecret, issuer, audience } = getJwtConfig();
  const jwtId = randomBytes(16).toString('hex');

  return new SignJWT({ sub: userId, fid: familyId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setJti(jwtId)
    .setExpirationTime(getEnv().REFRESH_TOKEN_TTL)
    .sign(refreshSecret);
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { refreshSecret, issuer, audience } = getJwtConfig();

  const { payload } = await jwtVerify<RefreshTokenPayload>(token, refreshSecret, {
    issuer,
    audience,
  });

  return payload as RefreshTokenPayload;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

interface AccessTokenPayload extends JWTPayload {
  sub: string;
  sid: string;
  role: string;
  jti: string;
}

interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  fid: string;
  jti: string;
}