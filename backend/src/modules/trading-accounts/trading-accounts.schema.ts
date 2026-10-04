import { z } from 'zod';

/**
 * Request validation for trading accounts (engineering-contract.md §7.7, api-spec.md §9.3).
 *
 * Every schema is `.strict()`, so an unknown key is rejected with
 * `VALIDATION_ERROR` as §1 requires.
 */

const name = z.string().min(1).max(60);

const broker = z.string().max(80).optional().nullable();

const type = z.enum(['live', 'demo', 'prop']).default('live');

const currency = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 currency code');

const startingBalance = z
  .string()
  .regex(/^\d+(\.\d{1,10})?$/, 'Must be a decimal string with up to 10 places')
  .transform((value) => value)
  .refine((value) => parseFloat(value) >= 0, 'Must be non-negative');

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
).optional().nullable();

const defaultRiskPercent = z
  .number()
  .positive()
  .max(100)
  .default(1);

const notes = z.string().max(2000).optional().nullable();

const isDefault = z.boolean().default(false);

const includeArchived = z
  .coerce
  .boolean()
  .default(false);

const statusFilter = z.enum(['active', 'archived']).optional();

export const createAccountSchema = z
  .object({
    name,
    broker,
    type,
    currency,
    startingBalance,
    timezone,
    defaultRiskPercent,
    isDefault,
    notes,
  })
  .strict();

export const patchAccountSchema = z
  .object({
    name: name.optional(),
    broker: broker.optional(),
    type: type.optional(),
    currency: currency.optional(),
    startingBalance: startingBalance.optional(),
    timezone: timezone.optional(),
    defaultRiskPercent: defaultRiskPercent.optional(),
    isDefault: isDefault.optional(),
    notes: notes.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

export const listAccountsQuerySchema = z
  .object({
    includeArchived,
    status: statusFilter,
  })
  .strict();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type PatchAccountInput = z.infer<typeof patchAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;