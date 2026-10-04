import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../../lib/password.js';

/**
 * Request validation (engineering-contract.md §7.7, api-spec.md §9.2).
 *
 * Every schema is `.strict()`, so an unknown key is rejected with
 * `VALIDATION_ERROR` as §1 requires. Password length is enforced here as well as
 * in the hashing module, so an invalid password is rejected before any Argon2
 * work is requested.
 */

const email = z.string().email().max(254).transform((value) => value.trim().toLowerCase());

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200);

/** database-schema.md §3.1: `ck_users_display_name` is 1–80. */
const displayName = z.string().min(1).max(80);

/** ISO 4217, upper-case three letters — `ck_users_base_currency`. */
const baseCurrency = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 currency code');

/**
 * IANA zone. `Intl.DateTimeFormat` throws on an unknown zone, which is the
 * cheapest available check and needs no dependency.
 */
const timezone = z.string().min(1).max(64).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a valid IANA timezone' },
);

export const registerSchema = z
  .object({
    email,
    password,
    displayName,
    timezone: timezone.default('UTC'),
    baseCurrency: baseCurrency.default('USD'),
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(200),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({ email })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password,
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: password,
  })
  .strict();

export const patchUserSchema = z
  .object({
    displayName: displayName.optional(),
    timezone: timezone.optional(),
    locale: z.string().min(2).max(16).optional(),
    baseCurrency: baseCurrency.optional(),
    // `ck_users_default_risk`: > 0 and <= 100.
    defaultRiskPercent: z.number().positive().max(100).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type PatchUserInput = z.infer<typeof patchUserSchema>;