import { z } from 'zod';

/**
 * Risk calculator request validation (api-spec.md §9.9, database-schema.md §5.3).
 *
 * All numeric values are decimal strings. Unknown keys are rejected.
 */

const decimalString = z.string().regex(/^-?\d+(?:\.\d{1,10})?$/, 'Must be a decimal string');

const positiveDecimalString = z.string().regex(/^\d+(?:\.\d{1,10})?$/, 'Must be a positive decimal string').refine(
  (val) => parseFloat(val) > 0,
  'Must be greater than 0',
);

const riskPercentString = z.string().regex(/^\d+(?:\.\d{1,3})?$/, 'Must be a decimal string with up to 3 decimal places').refine(
  (val) => {
    const num = parseFloat(val);
    return num > 0 && num <= 100;
  },
  'Risk percent must be between 0 and 100',
);

const directionSchema = z.enum(['long', 'short']);

export const riskCalculateSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    balance: positiveDecimalString,
    riskPercent: riskPercentString.optional(),
    riskAmount: decimalString.nullable().optional(),
    direction: directionSchema,
    entryPrice: positiveDecimalString,
    stopLoss: positiveDecimalString,
    takeProfit: positiveDecimalString.optional(),
    broker: z.string().min(1).max(100).optional(),
    symbol: z.string().min(1).max(24).optional(),
    contractSize: positiveDecimalString.optional(),
    lotStep: positiveDecimalString.optional(),
    minLot: positiveDecimalString.optional(),
    maxLot: positiveDecimalString.optional(),
    pipValue: decimalString.nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      // Either riskPercent or riskAmount, not both
      const hasRiskPercent = data.riskPercent !== undefined;
      const hasRiskAmount = data.riskAmount !== undefined && data.riskAmount !== null;
      return hasRiskPercent !== hasRiskAmount;
    },
    {
      message: 'Exactly one of riskPercent or riskAmount must be provided',
      path: ['riskPercent'],
    },
  )
  .refine(
    (data) => {
      // Validate stop loss is on correct side of entry
      const entry = parseFloat(data.entryPrice);
      const sl = parseFloat(data.stopLoss);
      if (data.direction === 'long') {
        return sl < entry;
      }
      return sl > entry;
    },
    {
      message: 'Stop loss must be below entry price for long, above for short',
      path: ['stopLoss'],
    },
  )
  .refine(
    (data) => {
      // Validate take profit is on correct side of entry (if provided)
      if (!data.takeProfit) return true;
      const entry = parseFloat(data.entryPrice);
      const tp = parseFloat(data.takeProfit);
      if (data.direction === 'long') {
        return tp > entry;
      }
      return tp < entry;
    },
    {
      message: 'Take profit must be above entry price for long, below for short',
      path: ['takeProfit'],
    },
  );

export const riskPresetSchema = z
  .object({
    name: z.string().min(1).max(60),
    accountId: z.string().uuid().optional(),
    balance: positiveDecimalString.optional(),
    riskPercent: riskPercentString.optional(),
    riskAmount: decimalString.nullable().optional(),
    direction: directionSchema.optional(),
    entryPrice: positiveDecimalString.optional(),
    stopLoss: positiveDecimalString.optional(),
    takeProfit: positiveDecimalString.optional(),
    broker: z.string().min(1).max(100).optional(),
    symbol: z.string().min(1).max(24).optional(),
    contractSize: positiveDecimalString.optional(),
    lotStep: positiveDecimalString.optional(),
    minLot: positiveDecimalString.optional(),
    maxLot: positiveDecimalString.optional(),
    pipValue: decimalString.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 1, {
    message: 'At least one calculator field must be supplied besides name',
  });

export const patchRiskPresetSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    accountId: z.string().uuid().optional(),
    balance: positiveDecimalString.optional(),
    riskPercent: riskPercentString.optional(),
    riskAmount: decimalString.nullable().optional(),
    direction: directionSchema.optional(),
    entryPrice: positiveDecimalString.optional(),
    stopLoss: positiveDecimalString.optional(),
    takeProfit: positiveDecimalString.optional(),
    broker: z.string().min(1).max(100).optional(),
    symbol: z.string().min(1).max(24).optional(),
    contractSize: positiveDecimalString.optional(),
    lotStep: positiveDecimalString.optional(),
    minLot: positiveDecimalString.optional(),
    maxLot: positiveDecimalString.optional(),
    pipValue: decimalString.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be supplied',
  });

export type RiskCalculateInput = z.infer<typeof riskCalculateSchema>;
export type RiskPresetInput = z.infer<typeof riskPresetSchema>;
export type PatchRiskPresetInput = z.infer<typeof patchRiskPresetSchema>;