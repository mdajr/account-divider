/**
 * Whole dollars only. Every *amount* in this app is a non-negative integer, so
 * there is no float arithmetic and no rounding drift anywhere in the totals.
 *
 * Two quantities genuinely need sub-dollar precision — a share price and a
 * withholding rate — so they are stored as scaled integers too: prices in cents,
 * rates in basis points. The scaling happens in `parseScaled` by string surgery
 * rather than by multiplying a float, so `245.50` becomes exactly 24550 and
 * never 24549.999999999996.
 */

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** `1234` → `"$1,234"`. Negatives render as `-$1,234`. */
export function formatDollars(amount: number): string {
  return formatter.format(amount);
}

const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `24550` → `"$245.50"`. Prices are the one place cents are shown. */
export function formatPriceCents(cents: number): string {
  return priceFormatter.format(cents / 100);
}

/** `2250` → `"22.5%"`. Trailing zeros are trimmed. */
export function formatPercentBps(bps: number): string {
  return `${trimZeros((bps / 100).toFixed(2))}%`;
}

/** `12.5` → `"12.5"`, `12` → `"12"`. Share counts are rarely round. */
export function formatUnits(units: number): string {
  return trimZeros(units.toFixed(4));
}

const trimZeros = (text: string) => (text.includes('.') ? text.replace(/\.?0+$/, '') : text);

export type ParseReason = 'empty' | 'not-a-number' | 'fractional' | 'negative' | 'too-precise' | 'too-large';

export type ParseResult = { ok: true; value: number } | { ok: false; reason: ParseReason };

/** Field kind, purely so the error message can name the right rule. */
export type FieldKind = 'dollars' | 'price' | 'percent' | 'units';

/**
 * Parse into an integer scaled by 10^`decimals`, without ever touching a float.
 * `max` is checked against the scaled value, so it is in the same units.
 */
function parseScaled(input: string, decimals: number, max: number): ParseResult {
  const cleaned = input.replace(/[$%,\s]/g, '');
  if (cleaned === '') return { ok: false, reason: 'empty' };

  // Reject anything that isn't a plain decimal number (no `1e5`, no `--`, no text).
  if (!/^-?\d*\.?\d*$/.test(cleaned) || !/\d/.test(cleaned)) {
    return { ok: false, reason: 'not-a-number' };
  }
  if (cleaned.startsWith('-')) return { ok: false, reason: 'negative' };

  const [whole = '', fraction = ''] = cleaned.split('.');
  const significant = fraction.replace(/0+$/, '');
  if (significant.length > decimals) {
    return { ok: false, reason: decimals === 0 ? 'fractional' : 'too-precise' };
  }

  const scaled = Number(`${whole || '0'}${fraction.padEnd(decimals, '0').slice(0, decimals)}`);
  if (!Number.isSafeInteger(scaled)) return { ok: false, reason: 'too-large' };
  if (scaled > max) return { ok: false, reason: 'too-large' };

  return { ok: true, value: scaled };
}

/**
 * Parse user input into whole dollars. Tolerant of `$`, commas and surrounding
 * whitespace. Fractional input is REJECTED rather than truncated — silently
 * turning a pasted `1500.75` into `1500` loses money without telling anyone.
 */
export function parseDollars(input: string): ParseResult {
  return parseScaled(input, 0, Number.MAX_SAFE_INTEGER);
}

/** Share price → integer cents. `"245.5"` → `24550`. */
export function parsePriceCents(input: string): ParseResult {
  return parseScaled(input, 2, 100_000_000);
}

/** Withholding rate → integer basis points. `"22.5"` → `2250`, capped at 100%. */
export function parsePercentBps(input: string): ParseResult {
  return parseScaled(input, 2, 10_000);
}

/** Share count. Kept as a plain number since units are not money. */
export function parseUnits(input: string): ParseResult {
  const result = parseScaled(input, 4, Number.MAX_SAFE_INTEGER);
  return result.ok ? { ok: true, value: result.value / 10_000 } : result;
}

export function parseErrorMessage(reason: ParseReason, kind: FieldKind = 'dollars'): string {
  switch (reason) {
    case 'empty':
      return kind === 'units' ? 'Enter a number of units' : 'Enter an amount';
    case 'not-a-number':
      return 'Numbers only';
    case 'fractional':
      return 'Whole dollars only — no cents';
    case 'negative':
      return "Can't be negative";
    case 'too-precise':
      return kind === 'units' ? 'At most 4 decimal places' : 'At most 2 decimal places';
    case 'too-large':
      return kind === 'percent' ? 'Must be between 0% and 100%' : "That's too large";
  }
}

/** True for values safe to store: non-negative whole dollars. */
export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** True for a finite, non-negative share count. */
export function isValidUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Post-tax dollars from a vest. Rounded exactly once, at the end: rounding the
 * gross first and then taxing it drifts by a dollar or two on a large vest.
 */
export function rsuNetDollars(units: number, priceCents: number, taxRateBps: number): number {
  const grossCents = units * priceCents;
  const netCents = (grossCents * (10_000 - taxRateBps)) / 10_000;
  return Math.round(netCents / 100);
}
