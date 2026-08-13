import { describe, expect, it } from 'vitest';
import { formatDollars, isValidAmount, parseDollars } from './money';

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
