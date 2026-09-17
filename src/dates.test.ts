import { describe, expect, it } from 'vitest';
import { describeDistance, formatDate, formatMonth, isIsoDate, monthsBetween, todayIso } from './dates';

describe('isIsoDate', () => {
  it('accepts real calendar dates', () => {
    expect(isIsoDate('2027-01-18')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects days that do not exist', () => {
    expect(isIsoDate('2027-02-29')).toBe(false); // not a leap year
    expect(isIsoDate('2027-02-31')).toBe(false);
    expect(isIsoDate('2027-04-31')).toBe(false);
    expect(isIsoDate('2027-13-01')).toBe(false);
    expect(isIsoDate('2027-00-10')).toBe(false);
  });

  it('rejects anything that is not the exact shape', () => {
    expect(isIsoDate('2027-1-18')).toBe(false);
    expect(isIsoDate('18/01/2027')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate(20270118)).toBe(false);
  });

  it('handles the century leap rule', () => {
    expect(isIsoDate('2000-02-29')).toBe(true);
    expect(isIsoDate('2100-02-29')).toBe(false);
  });
});

describe('ordering', () => {
  it('sorts correctly as plain strings, which is what the timeline relies on', () => {
    const dates = ['2027-10-01', '2027-02-15', '2028-01-01', '2027-02-09'];
    expect([...dates].sort()).toEqual(['2027-02-09', '2027-02-15', '2027-10-01', '2028-01-01']);
  });
});

describe('todayIso', () => {
  it('uses local calendar fields, not UTC — a late-evening date must not roll forward', () => {
    // 23:30 local on the 17th. Reading UTC parts would give the 18th east of UTC.
    const local = new Date(2026, 8, 17, 23, 30, 0);
    expect(todayIso(local)).toBe('2026-09-17');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayIso(new Date(2027, 0, 5))).toBe('2027-01-05');
  });
});

describe('formatting', () => {
  it('renders the stored day, never a timezone-shifted one', () => {
    expect(formatDate('2027-01-18')).toBe('Jan 18, 2027');
    expect(formatDate('2027-12-01')).toBe('Dec 1, 2027');
    expect(formatMonth('2027-04-09')).toBe('Apr 2027');
  });
});

describe('monthsBetween', () => {
  it('floors to whole months', () => {
    expect(monthsBetween('2026-09-17', '2027-01-18')).toBe(4);
    // One day short of four months.
    expect(monthsBetween('2026-09-17', '2027-01-16')).toBe(3);
    expect(monthsBetween('2026-09-17', '2026-09-17')).toBe(0);
  });
});

describe('describeDistance', () => {
  it('scales the unit to the distance', () => {
    expect(describeDistance('2026-09-17', '2026-09-18')).toBe('in 1 day');
    expect(describeDistance('2026-09-17', '2026-10-01')).toBe('in 14 days');
    expect(describeDistance('2026-09-17', '2027-01-18')).toBe('in 4 months');
    expect(describeDistance('2026-09-17', '2029-01-18')).toBe('in 2 years');
  });

  it('collapses anything in the past to now', () => {
    expect(describeDistance('2026-09-17', '2026-09-17')).toBe('now');
    expect(describeDistance('2026-09-17', '2020-01-01')).toBe('now');
  });
});
