import type { UserResource } from '@tradeozeyid/contracts';
import { getJson, patchJson, postJson } from '../../lib/api';

/**
 * Auth API bindings (api-spec.md §9.2).
 *
 * Only serialisation lives here. Tokens are never touched: the backend sets and
 * clears the cookies, and this module has no way to read them.
 */

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  timezone: string;
  baseCurrency: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export type AuthResult = UserResource;

export function register(input: RegisterInput): Promise<AuthResult> {
  return postJson<AuthResult>('/auth/register', input);
}

export function login(input: LoginInput): Promise<AuthResult> {
  return postJson<AuthResult>('/auth/login', input);
}

/**
 * Rotates the session.
 *
 * `allowRefresh: false` is not needed here — this is the refresh call — but it is
 * deliberately a POST that bypasses the generic silent-refresh path, so a failing
 * refresh surfaces as a failure instead of recursing.
 */
export function refreshSession(): Promise<{ ok: boolean }> {
  return postJson<{ ok: boolean }>('/auth/refresh', undefined);
}

export function logout(): Promise<void> {
  return postJson<void>('/auth/logout');
}

export function logoutAll(): Promise<void> {
  return postJson<void>('/auth/logout-all');
}

/** `GET /auth/me`. A GET, so the client will attempt one silent refresh on 401. */
export function currentUser(): Promise<AuthResult> {
  return getJson<AuthResult>('/auth/me');
}

export async function requestPasswordReset(email: string): Promise<string> {
  const result = await postJson<{ message: string }>('/auth/forgot-password', { email });
  return result.message;
}

export function resetPassword(input: ResetPasswordInput): Promise<void> {
  return postJson<void>('/auth/reset-password', input);
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return postJson<void>('/auth/change-password', input);
}

export type UserPatch = Partial<
  Pick<UserResource, 'displayName' | 'timezone' | 'locale' | 'baseCurrency' | 'defaultRiskPercent'>
>;

export function fetchMe(): Promise<AuthResult> {
  return getJson<AuthResult>('/users/me');
}

export function updateMe(patch: UserPatch): Promise<AuthResult> {
  return patchJson<AuthResult>('/users/me', patch);
}