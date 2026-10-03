/**
 * Money utilities for handling numeric values as strings to avoid floating-point precision loss.
 * All monetary values are stored as decimal strings with fixed precision.
 */

const MONEY_PRECISION = 10;
const R_MULTIPLE_PRECISION = 4;
const RISK_PERCENT_PRECISION = 3;

/**
 * Rounds a numeric string to the specified precision using half-up rounding.
 */
export function roundToPrecision(value: string, precision: number): string {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const sign = integerPart.startsWith('-') ? '-' : '';
  const absInteger = integerPart.replace('-', '');

  if (fractionalPart.length <= precision) {
    return value;
  }

  const keep = fractionalPart.slice(0, precision);
  const nextDigit = parseInt(fractionalPart[precision] || '0', 10);
  const remaining = fractionalPart.slice(precision + 1);

  // Check for exact half (e.g., .5000...)
  const isExactHalf = nextDigit === 5 && remaining.split('').every(d => d === '0');

  let roundedFraction = keep;
  if (nextDigit > 5 || (isExactHalf && parseInt(keep[keep.length - 1] || '0', 10) % 2 === 1)) {
    // Round up
    const fractionAsInt = BigInt(keep || '0') + 1n;
    const newFraction = fractionAsInt.toString().padStart(precision, '0');
    if (newFraction.length > precision) {
      // Carry over to integer part
      return `${sign}${(BigInt(absInteger) + 1n).toString()}.${'0'.repeat(precision)}`;
    }
    roundedFraction = newFraction;
  }

  return `${sign}${absInteger}.${roundedFraction}`;
}

/**
 * Rounds a money value to 10 decimal places.
 */
export function roundMoney(value: string): string {
  return roundToPrecision(value, MONEY_PRECISION);
}

/**
 * Rounds an R multiple to 4 decimal places.
 */
export function roundRMultiple(value: string): string {
  return roundToPrecision(value, R_MULTIPLE_PRECISION);
}

/**
 * Rounds a risk percent to 3 decimal places.
 */
export function roundRiskPercent(value: string): string {
  return roundToPrecision(value, RISK_PERCENT_PRECISION);
}

/**
 * Ensures a numeric string has exactly the specified number of decimal places.
 */
export function toFixedDecimals(value: string, decimals: number): string {
  const [integerPart, fractionalPart = ''] = value.split('.');
  const sign = integerPart.startsWith('-') ? '-' : '';
  const absInteger = integerPart.replace('-', '');
  const fraction = (fractionalPart + '0'.repeat(decimals)).slice(0, decimals);
  return `${sign}${absInteger}.${fraction}`;
}

/**
 * Formats a numeric string for API output (ensures consistent decimal places).
 * Money values always have 10 decimal places.
 */
export function formatMoney(value: string): string {
  return toFixedDecimals(roundMoney(value), MONEY_PRECISION);
}

/**
 * Formats an R multiple for API output (4 decimal places).
 */
export function formatRMultiple(value: string): string {
  return toFixedDecimals(roundRMultiple(value), R_MULTIPLE_PRECISION);
}

/**
 * Formats a risk percent for API output (3 decimal places).
 */
export function formatRiskPercent(value: string): string {
  return toFixedDecimals(roundRiskPercent(value), RISK_PERCENT_PRECISION);
}

/**
 * Adds two numeric strings safely.
 */
export function add(a: string, b: string): string {
  const [intA, fracA = ''] = a.split('.');
  const [intB, fracB = ''] = b.split('.');

  const maxFracLen = Math.max(fracA.length, fracB.length);
  const factor = BigInt(10) ** BigInt(maxFracLen);

  const aScaled = BigInt(intA.replace('-', '')) * factor + BigInt((fracA + '0'.repeat(maxFracLen)).slice(0, maxFracLen));
  const bScaled = BigInt(intB.replace('-', '')) * factor + BigInt((fracB + '0'.repeat(maxFracLen)).slice(0, maxFracLen));

  const signA = intA.startsWith('-') ? -1n : 1n;
  const signB = intB.startsWith('-') ? -1n : 1n;

  const result = aScaled * signA + bScaled * signB;
  const resultSign = result < 0 ? '-' : '';
  const absResult = result < 0 ? -result : result;

  const integerPart = (absResult / factor).toString();
  const fractionalPart = (absResult % factor).toString().padStart(maxFracLen, '0');

  return `${resultSign}${integerPart}.${fractionalPart}`;
}

/**
 * Subtracts b from a safely.
 */
export function subtract(a: string, b: string): string {
  return add(a, b.startsWith('-') ? b.slice(1) : `-${b}`);
}

/**
 * Multiplies two numeric strings safely.
 */
export function multiply(a: string, b: string): string {
  const [intA, fracA = ''] = a.split('.');
  const [intB, fracB = ''] = b.split('.');

  const fracALen = fracA.length;
  const fracBLen = fracB.length;
  const totalFracLen = fracALen + fracBLen;

  const aScaled = BigInt(intA.replace('-', '')) * BigInt(10) ** BigInt(fracALen) + BigInt(fracA || '0');
  const bScaled = BigInt(intB.replace('-', '')) * BigInt(10) ** BigInt(fracBLen) + BigInt(fracB || '0');

  const signA = intA.startsWith('-') ? -1n : 1n;
  const signB = intB.startsWith('-') ? -1n : 1n;

  const result = aScaled * bScaled * signA * signB;
  const resultSign = result < 0 ? '-' : '';
  const absResult = result < 0 ? -result : result;

  const integerPart = (absResult / BigInt(10) ** BigInt(totalFracLen)).toString();
  const fractionalPart = (absResult % BigInt(10) ** BigInt(totalFracLen)).toString().padStart(totalFracLen, '0');

  return `${resultSign}${integerPart}.${fractionalPart}`;
}

/**
 * Divides a by b safely.
 */
export function divide(a: string, b: string, precision = MONEY_PRECISION): string {
  const [intA, fracA = ''] = a.split('.');
  const [intB, fracB = ''] = b.split('.');

  const fracALen = fracA.length;
  const fracBLen = fracB.length;

  const aScaled = BigInt(intA.replace('-', '')) * BigInt(10) ** BigInt(fracALen) + BigInt(fracA || '0');
  const bScaled = BigInt(intB.replace('-', '')) * BigInt(10) ** BigInt(fracBLen) + BigInt(fracB || '0');

  const signA = intA.startsWith('-') ? -1n : 1n;
  const signB = intB.startsWith('-') ? -1n : 1n;

  // Scale up for precision
  const scaleFactor = BigInt(10) ** BigInt(precision + fracBLen);
  const numerator = aScaled * scaleFactor * signA;
  const denominator = bScaled * signB;

  if (denominator === 0n) {
    throw new Error('Division by zero');
  }

  const result = numerator / denominator;
  const resultSign = result < 0 ? '-' : '';
  const absResult = result < 0 ? -result : result;

  const integerPart = (absResult / scaleFactor).toString();
  const fractionalPart = (absResult % scaleFactor).toString().padStart(precision, '0');

  return `${resultSign}${integerPart}.${fractionalPart}`;
}

/**
 * Absolute value of a numeric string.
 */
export function abs(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value;
}

/**
 * Compares two numeric strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compare(a: string, b: string): number {
  const [intA, fracA = ''] = a.split('.');
  const [intB, fracB = ''] = b.split('.');

  const signA = intA.startsWith('-') ? -1 : 1;
  const signB = intB.startsWith('-') ? -1 : 1;

  if (signA !== signB) {
    return signA < signB ? -1 : 1;
  }

  const absA = intA.replace('-', '');
  const absB = intB.replace('-', '');

  // Compare integer parts
  if (absA.length !== absB.length) {
    const cmp = absA.length - absB.length;
    return signA === 1 ? cmp : -cmp;
  }

  if (absA !== absB) {
    const cmp = absA.localeCompare(absB);
    return signA === 1 ? cmp : -cmp;
  }

  // Compare fractional parts
  const maxFrac = Math.max(fracA.length, fracB.length);
  const fracAPadded = (fracA + '0'.repeat(maxFrac)).slice(0, maxFrac);
  const fracBPadded = (fracB + '0'.repeat(maxFrac)).slice(0, maxFrac);

  const fracCmp = fracAPadded.localeCompare(fracBPadded);
  return signA === 1 ? fracCmp : -fracCmp;
}

/**
 * Checks if a numeric string is positive (> 0).
 */
export function isPositive(value: string): boolean {
  return compare(value, '0') > 0;
}

/**
 * Checks if a numeric string is negative (< 0).
 */
export function isNegative(value: string): boolean {
  return compare(value, '0') < 0;
}

/**
 * Checks if a numeric string is zero.
 */
export function isZero(value: string): boolean {
  return compare(value, '0') === 0;
}