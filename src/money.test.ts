import { describe, expect, it } from 'vitest';
import {
  formatDollars,
  formatPercentBps,
  formatPriceCents,
  formatUnits,
  isValidAmount,
  parseDollars,
  parseErrorMessage,
  parsePercentBps,
  parsePriceCents,
  parseUnits,
  rsuNetDollars,
} from './money';

describe('parseDollars', () => {
  it('accepts plain whole numbers', () => {
    expect(parseDollars('1500')).toEqual({ ok: true, value: 1500 });
    expect(parseDollars('0')).toEqual({ ok: true, value: 0 });
  });

  it('tolerates currency formatting', () => {
    expect(parseDollars('$1,500')).toEqual({ ok: true, value: 1500 });
    expect(parseDollars('  12,345 ')).toEqual({ ok: true, value: 12345 });
  });

  it('rejects cents rather than truncating them', () => {
    expect(parseDollars('1500.75')).toEqual({ ok: false, reason: 'fractional' });
    expect(parseDollars('0.5')).toEqual({ ok: false, reason: 'fractional' });
  });

  it('accepts a trailing decimal point mid-typing only when whole', () => {
    expect(parseDollars('1500.')).toEqual({ ok: true, value: 1500 });
  });

  it('rejects negatives, junk, and scientific notation', () => {
    expect(parseDollars('-5')).toEqual({ ok: false, reason: 'negative' });
    expect(parseDollars('abc')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDollars('1e5')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDollars('1..2')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parseDollars('.')).toEqual({ ok: false, reason: 'not-a-number' });
  });

  it('reports an empty field distinctly, so the UI can treat it as zero', () => {
    expect(parseDollars('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseDollars('  $ ')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('formatDollars', () => {
  it('formats without cents', () => {
    expect(formatDollars(1500)).toBe('$1,500');
    expect(formatDollars(0)).toBe('$0');
    expect(formatDollars(1234567)).toBe('$1,234,567');
  });

  it('formats negatives for the over-allocated case', () => {
    expect(formatDollars(-1250)).toBe('-$1,250');
  });

  it('round-trips through parseDollars', () => {
    for (const value of [0, 7, 1500, 1234567]) {
      expect(parseDollars(formatDollars(value))).toEqual({ ok: true, value });
    }
  });
});

describe('isValidAmount', () => {
  it('accepts non-negative integers only', () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(1500)).toBe(true);
    expect(isValidAmount(1500.5)).toBe(false);
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(NaN)).toBe(false);
    expect(isValidAmount('100')).toBe(false);
  });
});

describe('parsePriceCents', () => {
  it('scales to cents without float drift', () => {
    expect(parsePriceCents('245.50')).toEqual({ ok: true, value: 24550 });
    expect(parsePriceCents('245.5')).toEqual({ ok: true, value: 24550 });
    expect(parsePriceCents('245')).toEqual({ ok: true, value: 24500 });
    expect(parsePriceCents('$1,245.07')).toEqual({ ok: true, value: 124507 });
    expect(parsePriceCents('.5')).toEqual({ ok: true, value: 50 });
  });

  it('is exact on the values a float would fumble', () => {
    // 0.1 + 0.2 territory: 8.29 * 100 is 828.9999999999999 in floating point.
    expect(parsePriceCents('8.29')).toEqual({ ok: true, value: 829 });
    expect(parsePriceCents('1.005')).toEqual({ ok: false, reason: 'too-precise' });
  });

  it('ignores trailing zeros past two decimals rather than calling them precision', () => {
    expect(parsePriceCents('245.5000')).toEqual({ ok: true, value: 24550 });
  });

  it('rejects junk and negatives', () => {
    expect(parsePriceCents('abc')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(parsePriceCents('-1.00')).toEqual({ ok: false, reason: 'negative' });
    expect(parsePriceCents('')).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('parsePercentBps', () => {
  it('scales to basis points', () => {
    expect(parsePercentBps('22')).toEqual({ ok: true, value: 2200 });
    expect(parsePercentBps('22.5')).toEqual({ ok: true, value: 2250 });
    expect(parsePercentBps('37.12%')).toEqual({ ok: true, value: 3712 });
    expect(parsePercentBps('0')).toEqual({ ok: true, value: 0 });
    expect(parsePercentBps('100')).toEqual({ ok: true, value: 10000 });
  });

  it('caps at 100% — a withholding rate above that is a typo', () => {
    expect(parsePercentBps('101')).toEqual({ ok: false, reason: 'too-large' });
    expect(parseErrorMessage('too-large', 'percent')).toBe('Must be between 0% and 100%');
  });
});

describe('parseUnits', () => {
  it('accepts fractional shares', () => {
    expect(parseUnits('120')).toEqual({ ok: true, value: 120 });
    expect(parseUnits('1337.5')).toEqual({ ok: true, value: 1337.5 });
    expect(parseUnits('0.0001')).toEqual({ ok: true, value: 0.0001 });
  });

  it('stops at four decimal places', () => {
    expect(parseUnits('0.00001')).toEqual({ ok: false, reason: 'too-precise' });
    expect(parseErrorMessage('too-precise', 'units')).toBe('At most 4 decimal places');
  });
});

describe('formatting the scaled values', () => {
  it('shows cents on prices and trims zeros elsewhere', () => {
    expect(formatPriceCents(24550)).toBe('$245.50');
    expect(formatPriceCents(100)).toBe('$1.00');
    expect(formatPercentBps(2200)).toBe('22%');
    expect(formatPercentBps(2250)).toBe('22.5%');
    expect(formatUnits(120)).toBe('120');
    expect(formatUnits(1337.5)).toBe('1337.5');
  });

  it('round-trips back through its parser', () => {
    for (const cents of [1, 100, 24550, 124507]) {
      expect(parsePriceCents(formatPriceCents(cents))).toEqual({ ok: true, value: cents });
    }
    for (const bps of [0, 2200, 2250, 3712, 10000]) {
      expect(parsePercentBps(formatPercentBps(bps))).toEqual({ ok: true, value: bps });
    }
    for (const units of [0, 1, 120, 1337.5, 0.0001]) {
      expect(parseUnits(formatUnits(units))).toEqual({ ok: true, value: units });
    }
  });
});

describe('rsuNetDollars', () => {
  it('nets the gross down by the withholding rate', () => {
    expect(rsuNetDollars(120, 24550, 2200)).toBe(22979);
    expect(rsuNetDollars(120, 24550, 0)).toBe(29460);
    expect(rsuNetDollars(120, 24550, 10000)).toBe(0);
  });

  it('is zero when there are no units', () => {
    expect(rsuNetDollars(0, 24550, 2200)).toBe(0);
  });
});
