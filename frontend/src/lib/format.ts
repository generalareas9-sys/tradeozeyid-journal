/**
 * Presentation-only formatting for money and percentages.
 *
 * Rules that this module deliberately obeys:
 *
 * - **No floating-point arithmetic.** Values arrive from the API as decimal
 *   strings (`api-spec.md` §4: "Every `numeric` column is serialized as a
 *   decimal string"). They are validated and handed to `Intl.NumberFormat` as
 *   strings, never as `Number`. This matters: `format("99999999999999.99")`
 *   yields `$99,999,999,999,999.99`, whereas `format(Number(value))` yields
 *   `$99,999,999,999,999.98` — a one-cent error from float conversion alone.
 * - **No financial calculation.** Rounding here is presentation only. P&L, R
 *   multiples and lot sizing live in `database-schema.md` §5 and are
 *   implemented once on the backend. This module must never grow a second
 *   implementation of them (`AGENTS.md` §3).
 * - **React-free.** Components add the `font-numeric` utility
 *   (`styles/index.css`) when they render the result.
 */

/**
 * Rendered in place of a value that is absent or unusable. This is the
 * documented convention: "The frontend renders an em dash"
 * (`database-schema.md` §5.4, for a null `profit_factor`).
 */
export const NULL_PLACEHOLDER = '—';

/** Widest scale the schema can produce: `numeric(20,10)` for all money. */
export const MAX_DECIMAL_PLACES = 10;

/** Default displayed decimals for money, as approved for Phase 2. */
export const DEFAULT_MONEY_PRECISION = 2;

/** Default displayed decimals for percentages, matching `numeric(6,3)`. */
export const DEFAULT_PERCENT_PRECISION = 3;

const CURRENCY_CODE = /^[A-Za-z]{3}$/;

/**
 * A plain decimal literal: optional leading `-`, integer part, and an
 * optional fraction of 1-10 digits. Exponent notation, thousands separators and
 * currency symbols are rejected rather than silently reinterpreted.
 */
const DECIMAL = /^-?\d+(?:\.\d{1,10})?$/;

export type DecimalInput = string | number | null | undefined;
export type SignDisplay = 'auto' | 'always' | 'never' | 'exceptZero';

export interface FormatOptions {
  /** BCP-47 tag. Defaults to the runtime locale. */
  locale?: string;
  /** Controls the `+`/`-` sign. Defaults to `'auto'`. */
  signDisplay?: SignDisplay;
}

export interface MoneyFormatOptions extends FormatOptions {
  /** Displayed decimal places. Defaults to 2. Capped at 10. */
  precision?: number;
}

export interface PercentFormatOptions extends FormatOptions {
  /** Displayed decimal places. Defaults to 3, matching `numeric(6,3)`. Capped at 10. */
  precision?: number;
}

/**
 * Validates input and returns a value safe to hand to `Intl.NumberFormat`, or
 * `null` when the input cannot be displayed faithfully.
 *
 * Numbers are accepted because `api-spec.md` §4 serialises percentages as JSON
 * numbers. They are passed straight through; no arithmetic is performed on them.
 */
function toDisplayable(value: DecimalInput): string | number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  return DECIMAL.test(trimmed) ? trimmed : null;
}

function clampPrecision(precision: number | undefined, fallback: number): number {
  if (precision === undefined || !Number.isInteger(precision) || precision < 0) {
    return fallback;
  }

  return Math.min(precision, MAX_DECIMAL_PLACES);
}

/**
 * `Intl.NumberFormat#format` accepts a decimal string at runtime: ECMA-402
 * resolves a string argument with `ToIntlMathematicalValue`, which reads the
 * digits exactly. The TypeScript lib declares only `number | bigint`, so the
 * spec-accurate signature is stated here once. Nothing is claimed that the
 * runtime does not do — passing a string is exactly the behaviour that keeps
 * values beyond 2^53 intact, which is why this module never calls `Number()`.
 */
type ExactFormat = (value: string | number) => string;

function formatExact(formatter: Intl.NumberFormat, value: string | number): string {
  return (formatter.format as ExactFormat)(value);
}

/**
 * Formats a decimal string as an amount of money in `currency`.
 *
 * Returns {@link NULL_PLACEHOLDER} when the value is absent or malformed, and
 * falls back to an unlabelled decimal when `currency` is not a usable ISO 4217
 * code, so a bad code cannot blank out a value.
 *
 * Rounding is done by `Intl.NumberFormat` (half away from zero) straight from
 * the exact decimal string; no intermediate number is created.
 */
export function formatMoney(
  value: DecimalInput,
  currency: string,
  options: MoneyFormatOptions = {},
): string {
  const displayable = toDisplayable(value);
  if (displayable === null) return NULL_PLACEHOLDER;

  const precision = clampPrecision(options.precision, DEFAULT_MONEY_PRECISION);
  const locale = options.locale;
  const signDisplay = options.signDisplay ?? 'auto';

  if (CURRENCY_CODE.test(currency)) {
    try {
      return formatExact(
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: currency.toUpperCase(),
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
          signDisplay,
        }),
        displayable,
      );
    } catch {
      // Well-formed code this runtime does not know: fall through to the
      // unlabelled rendering below rather than losing the value.
    }
  }

  return formatExact(
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      signDisplay,
    }),
    displayable,
  );
}

/**
 * Formats a percentage. The value is the percentage itself (`62.5` means
 * 62.5%), matching how the API serialises it, so `%` is appended as a suffix
 * rather than using `Intl`'s `style: 'percent'`, which would multiply by 100
 * and require a division — floating-point arithmetic this module must not do.
 *
 * Returns {@link NULL_PLACEHOLDER} when the value is absent or malformed.
 */
export function formatPercent(value: DecimalInput, options: PercentFormatOptions = {}): string {
  const displayable = toDisplayable(value);
  if (displayable === null) return NULL_PLACEHOLDER;

  const precision = clampPrecision(options.precision, DEFAULT_PERCENT_PRECISION);

  return `${formatExact(
    new Intl.NumberFormat(options.locale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      signDisplay: options.signDisplay ?? 'auto',
    }),
    displayable,
  )}%`;
}