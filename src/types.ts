import type { IsoDate } from './dates';

export type Bucket = {
  id: string;
  name: string;
  /** Whole dollars. Always a non-negative integer — never fractional. */
  amount: number;
  note: string;
  /**
   * The day the money actually leaves the account, or null for an open-ended
   * reserve (an emergency fund is never "spent", it is held forever). A dated
   * bucket is reserved until its date and gone from every snapshot after it.
   */
  date: IsoDate | null;
  /** 0-7 index into the categorical palette. Assigned at creation and never
   *  recomputed, so reordering or deleting never repaints the survivors. */
  colorSlot: number;
  /** Hex from the color picker; null means "use the palette slot". */
  colorOverride: string | null;
};

/** A fixed sum landing on a known day — a deposit refund, a tax refund. */
export type CashInflow = {
  kind: 'cash';
  id: string;
  name: string;
  date: IsoDate;
  /** Whole dollars, non-negative integer. */
  amount: number;
};

/**
 * A vest, valued at the latest price rather than stored as a dollar figure —
 * the whole point is that it is worth something different every time you look.
 */
export type RsuInflow = {
  kind: 'rsu';
  id: string;
  name: string;
  date: IsoDate;
  /** Uppercase, e.g. `AAPL`. */
  ticker: string;
  /** Shares vesting. Fractional allowed — brokers do hand out partial shares. */
  units: number;
  /** Withholding, in basis points (2500 = 25%). Integer, 0-10000. */
  taxRateBps: number;
};

export type Inflow = CashInflow | RsuInflow;

/** Last known share price for a ticker. Cents, so no float drift in the cache. */
export type Quote = {
  priceCents: number;
  /** ISO timestamp of when this price was captured. */
  asOf: string;
  /** `manual` prices are never overwritten by the automatic refresh. */
  source: 'stooq' | 'manual';
};

export type AppState = {
  version: 2;
  /** Whole dollars, non-negative integer. */
  balance: number;
  buckets: Bucket[];
  inflows: Inflow[];
  /** Keyed by uppercase ticker. A cache, not user data — safe to lose. */
  quotes: Record<string, Quote>;
};

export const emptyState = (): AppState => ({
  version: 2,
  balance: 0,
  buckets: [],
  inflows: [],
  quotes: {},
});
