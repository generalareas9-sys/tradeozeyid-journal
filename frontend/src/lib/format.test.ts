import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MONEY_PRECISION,
  DEFAULT_PERCENT_PRECISION,
  formatMoney,
  formatPercent,
  MAX_DECIMAL_PLACES,
  NULL_PLACEHOLDER,
} from './format';

/**
 * Every expected value below is hand-computed from the documented contract:
 *   - money travels as a decimal string with up to 10 decimal places
 *     (`engineering-contract.md` §5.2, `api-spec.md` §4);
 *   - percentages travel as 3-decimal values (`numeric(6,3)`);
 *   - an unusable value renders as an em dash (`database-schema.md` §5.4).
 * No expected value is produced by running financial arithmetic.
 *
 * Every case pins `locale`. Without it the helper follows the runtime locale,
 * and this machine resolves to `en-GB`, which renders USD as `US$` — a correct
 * result, but not a deterministic one to assert on.
 */

/** U+00A0 NO-BREAK SPACE, which de-DE places between amount and symbol. */
const NBSP = '\u00a0';

const EN = { locale: 'en-US' } as const;

describe('formatMoney — defaults', () => {
  it('renders positive, negative and zero values at two decimals', () => {
    expect(formatMoney('245.2000000000', 'USD', EN)).toBe('$245.20');
    expect(formatMoney('-245.2000000000', 'USD', EN)).toBe('-$245.20');
    expect(formatMoney('0', 'USD', EN)).toBe('$0.00');
  });

  it('defaults to exactly two decimal places', () => {
    expect(DEFAULT_MONEY_PRECISION).toBe(2);
    expect(formatMoney('1', 'USD', EN)).toBe('$1.00');
    expect(formatMoney('1.5', 'USD', EN)).toBe('$1.50');
    expect(formatMoney('1.005', 'USD', EN)).toBe('$1.01');
  });

  it('rounds a half away from zero in both directions', () => {
    expect(formatMoney('2.345', 'USD', EN)).toBe('$2.35');
    expect(formatMoney('-2.345', 'USD', EN)).toBe('-$2.35');
  });

  it('pads a bare integer and groups thousands', () => {
    expect(formatMoney('1000000', 'USD', EN)).toBe('$1,000,000.00');
  });
});

describe('formatMoney — currency codes', () => {
  it('uses each currency symbol', () => {
    expect(formatMoney('1234.5', 'USD', EN)).toBe('$1,234.50');
    expect(formatMoney('1234.5', 'EUR', EN)).toBe('€1,234.50');
    expect(formatMoney('1234.5', 'GBP', EN)).toBe('£1,234.50');
  });

  it('accepts a lowercase code and normalises it', () => {
    expect(formatMoney('10', 'usd', EN)).toBe(formatMoney('10', 'USD', EN));
  });

  it('falls back to an unlabelled decimal when the code is unusable', () => {
    expect(formatMoney('1234.5', 'US', EN)).toBe('1,234.50');
    expect(formatMoney('1234.5', 'DOLLARS', EN)).toBe('1,234.50');
    expect(formatMoney('1234.5', '', EN)).toBe('1,234.50');
    expect(formatMoney('1234.5', '$', EN)).toBe('1,234.50');
  });

  it('applies the requested precision even where a currency has another minor unit', () => {
    // JPY conventionally has 0 minor units; the approved default forces 2.
    expect(formatMoney('1234.5', 'JPY', EN)).toBe('¥1,234.50');
    expect(formatMoney('1234.5', 'JPY', { locale: 'en-US', precision: 0 })).toBe('¥1,235');
  });
});

describe('formatMoney — display precision', () => {
  it('honours additional precision up to the 10 the schema can carry', () => {
    expect(formatMoney('0.0000000001', 'USD', { locale: 'en-US', precision: 10 })).toBe(
      '$0.0000000001',
    );
    expect(formatMoney('1.2345678901', 'USD', { locale: 'en-US', precision: 10 })).toBe(
      '$1.2345678901',
    );
  });

  it('supports fewer decimals, including none', () => {
    expect(formatMoney('1234.5678', 'USD', { locale: 'en-US', precision: 4 })).toBe('$1,234.5678');
    expect(formatMoney('1234.5678', 'USD', { locale: 'en-US', precision: 0 })).toBe('$1,235');
  });

  it('caps precision at the schema maximum', () => {
    expect(MAX_DECIMAL_PLACES).toBe(10);
    expect(formatMoney('1.5', 'USD', { locale: 'en-US', precision: 25 })).toBe('$1.5000000000');
  });

  it('ignores a nonsensical precision instead of throwing', () => {
    expect(formatMoney('1.5', 'USD', { locale: 'en-US', precision: -2 })).toBe('$1.50');
    expect(formatMoney('1.5', 'USD', { locale: 'en-US', precision: 1.5 })).toBe('$1.50');
  });
});

describe('formatMoney — precision beyond IEEE-754 doubles', () => {
  it('does not corrupt a value a float cannot represent', () => {
    // Number('99999999999999.99') rounds to ...999.98 and renders one cent low.
    expect(formatMoney('99999999999999.99', 'USD', EN)).toBe('$99,999,999,999,999.99');
  });

  it('keeps every digit of a value far beyond double precision', () => {
    expect(formatMoney('123456789012345678901234567890.5', 'USD', EN)).toBe(
      '$123,456,789,012,345,678,901,234,567,890.50',
    );
  });

  it('renders the smallest amount the schema can carry, in both directions', () => {
    expect(formatMoney('0.0000000001', 'USD', { locale: 'en-US', precision: 10 })).toBe(
      '$0.0000000001',
    );
    expect(formatMoney('-0.0000000001', 'USD', { locale: 'en-US', precision: 10 })).toBe(
      '-$0.0000000001',
    );
  });
});

describe('formatPercent', () => {
  it('defaults to three decimals, matching numeric(6,3)', () => {
    expect(DEFAULT_PERCENT_PRECISION).toBe(3);
    expect(formatPercent('62.5', EN)).toBe('62.500%');
    expect(formatPercent('1', EN)).toBe('1.000%');
  });

  it('treats the value as the percentage itself, not a fraction', () => {
    // 0.625 must read as 0.625%, never 62.5%.
    expect(formatPercent('0.625', EN)).toBe('0.625%');
  });

  it('renders negatives and zero', () => {
    expect(formatPercent('-3.5', EN)).toBe('-3.500%');
    expect(formatPercent('0', EN)).toBe('0.000%');
  });

  it('honours a configurable precision', () => {
    expect(formatPercent('62.567', { locale: 'en-US', precision: 1 })).toBe('62.6%');
    expect(formatPercent('62.567', { locale: 'en-US', precision: 0 })).toBe('63%');
    expect(formatPercent('62.567', { locale: 'en-US', precision: 6 })).toBe('62.567000%');
  });

  it('accepts a JSON number, as api-spec.md §4 serialises percentages', () => {
    expect(formatPercent(62.5, EN)).toBe('62.500%');
  });

  it('appends % without a space, unlike a locale-native percent sign', () => {
    // de-DE would render "62,500 %"; the manual suffix keeps the value exact.
    expect(formatPercent('62.5', { locale: 'de-DE' })).toBe('62,500%');
  });
});

describe('sign display', () => {
  it('shows a plus sign only when asked', () => {
    expect(formatMoney('10', 'USD', EN)).toBe('$10.00');
    expect(formatMoney('10', 'USD', { locale: 'en-US', signDisplay: 'always' })).toBe('+$10.00');
    expect(formatMoney('-10', 'USD', { locale: 'en-US', signDisplay: 'always' })).toBe('-$10.00');
  });

  it('omits the negative sign when asked', () => {
    expect(formatMoney('-10', 'USD', { locale: 'en-US', signDisplay: 'never' })).toBe('$10.00');
    expect(formatPercent('-10', { locale: 'en-US', signDisplay: 'never' })).toBe('10.000%');
  });
});

describe('locale behaviour', () => {
  it('groups and separates per locale', () => {
    expect(formatMoney('1234567.5', 'USD', { locale: 'en-US' })).toBe('$1,234,567.50');
    expect(formatMoney('1234567.5', 'EUR', { locale: 'de-DE' })).toBe(`1.234.567,50${NBSP}€`);
    expect(formatMoney('1234.5', 'TRY', { locale: 'tr-TR' })).toBe('₺1.234,50');
  });

  it('keeps the exact digits under a different locale', () => {
    expect(formatMoney('99999999999999.99', 'USD', { locale: 'en-US' })).toBe(
      '$99,999,999,999,999.99',
    );
    expect(formatMoney('99999999999999.99', 'USD', { locale: 'de-DE' })).toBe(
      `99.999.999.999.999,99${NBSP}$`,
    );
  });

  it('follows the runtime locale when none is given', () => {
    // Asserted by comparison rather than a literal, because the runtime locale
    // differs per machine (this one resolves to `en-GB`, which writes `US$`).
    const runtimeLocale = Intl.DateTimeFormat().resolvedOptions().locale;

    expect(formatMoney('1234.5', 'USD')).toBe(formatMoney('1234.5', 'USD', { locale: runtimeLocale }));
    expect(formatPercent('62.5')).toBe(formatPercent('62.5', { locale: runtimeLocale }));
  });
});

describe('null, empty and invalid input', () => {
  it('renders the em dash placeholder for an absent value', () => {
    expect(NULL_PLACEHOLDER).toBe('—');
    expect(formatMoney(null, 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney(undefined, 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatPercent(null, EN)).toBe(NULL_PLACEHOLDER);
    expect(formatPercent(undefined, EN)).toBe(NULL_PLACEHOLDER);
  });

  it('renders the em dash placeholder for an empty or blank value', () => {
    expect(formatMoney('', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('   ', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatPercent('', EN)).toBe(NULL_PLACEHOLDER);
  });

  it('renders the em dash placeholder for malformed values', () => {
    expect(formatMoney('abc', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('1.2.3', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('1e5', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('$12.00', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('1,234.56', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('.5', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('12.', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatMoney('+12', 'USD', EN)).toBe(NULL_PLACEHOLDER);
    expect(formatPercent('n/a', EN)).toBe(NULL_PLACEHOLDER);
  });

  it('rejects a value carrying more precision than the schema allows', () => {
    expect(formatMoney('1.12345678901', 'USD', EN)).toBe(NULL_PLACEHOLDER);
  });

  it('never throws on hostile input', () => {
    const hostile: Array<string | number | null | undefined> = [
      NaN,
      Infinity,
      -Infinity,
      'NaN',
      '--1',
      'Infinity',
      '\u0000',
    ];

    for (const value of hostile) {
      expect(() => formatMoney(value, 'USD', EN)).not.toThrow();
      expect(() => formatPercent(value, EN)).not.toThrow();
      expect(formatMoney(value, 'USD', EN)).toBe(NULL_PLACEHOLDER);
      expect(formatPercent(value, EN)).toBe(NULL_PLACEHOLDER);
    }
  });

  it('keeps the sign on negative zero rather than dropping it', () => {
    expect(formatMoney('-0', 'USD', EN)).toBe('-$0.00');
  });
});