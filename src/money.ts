/**
 * Whole dollars only. Every amount in this app is a non-negative integer, so
 * there is no float arithmetic and no rounding drift anywhere in the totals.
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

export type ParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'not-a-number' | 'fractional' | 'negative' };

/**
 * Parse user input into whole dollars. Tolerant of `$`, commas and surrounding
 * whitespace. Fractional input is REJECTED rather than truncated — silently
 * turning a pasted `1500.75` into `1500` loses money without telling anyone.
 */
export function parseDollars(input: string): ParseResult {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (cleaned === '') return { ok: false, reason: 'empty' };

  // Reject anything that isn't a plain decimal number (no `1e5`, no `--`, no text).
  if (!/^-?\d*\.?\d*$/.test(cleaned) || !/\d/.test(cleaned)) {
    return { ok: false, reason: 'not-a-number' };
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, reason: 'not-a-number' };
  if (!Number.isInteger(value)) return { ok: false, reason: 'fractional' };
  if (value < 0) return { ok: false, reason: 'negative' };

  return { ok: true, value };
}

export function parseErrorMessage(reason: Exclude<ParseResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'empty':
      return 'Enter an amount';
    case 'not-a-number':
      return 'Numbers only';
    case 'fractional':
      return 'Whole dollars only — no cents';
    case 'negative':
      return "Can't be negative";
  }
}

/** True for values safe to store: non-negative whole dollars. */
export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
