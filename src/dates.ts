/**
 * Dates are plain `YYYY-MM-DD` strings, never `Date` objects.
 *
 * Every comparison in this app is a string comparison, which is correct for
 * zero-padded ISO dates and — unlike `new Date('2027-01-18')` — cannot shift a
 * day across a timezone boundary. A vest dated the 18th must never render as
 * the 17th because the browser sits west of UTC.
 */

export type IsoDate = string;

const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in `YYYY-MM-DD` form — rejects 2027-02-31. */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !SHAPE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Today in the browser's own timezone, which is the one the user lives in. */
export function todayIso(now: Date = new Date()): IsoDate {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const monthName = (iso: IsoDate) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? '???';

/** `2027-01-18` → `Jan 18, 2027`. */
export function formatDate(iso: IsoDate): string {
  return `${monthName(iso)} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

/** `2027-01-18` → `Jan 2027` — the timeline rail's coarse heading. */
export function formatMonth(iso: IsoDate): string {
  return `${monthName(iso)} ${iso.slice(0, 4)}`;
}

/** Whole months from `from` to `to`, floored. Negative when `to` is earlier. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const months =
    (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
    (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
  return Number(to.slice(8, 10)) < Number(from.slice(8, 10)) ? months - 1 : months;
}

/** "in 4 months" / "in 18 days" — relative distance for a timeline heading. */
export function describeDistance(from: IsoDate, to: IsoDate): string {
  if (to <= from) return 'now';
  const months = monthsBetween(from, to);
  if (months >= 24) return `in ${Math.floor(months / 12)} years`;
  if (months >= 1) return `in ${months} ${months === 1 ? 'month' : 'months'}`;
  const days = Math.round((Date.UTC(
    Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)),
  ) - Date.UTC(
    Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)),
  )) / 86_400_000);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}
