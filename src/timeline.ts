import type { AppState, Bucket, Inflow, Quote } from './types';
import type { IsoDate } from './dates';
import { derive, type Derived } from './state';
import { rsuNetDollars } from './money';

/**
 * Projects cash on hand forward through a set of dated events.
 *
 * The model is the app's existing one, run once per future date:
 *
 *   cash on hand   = today's balance + everything deposited on or before D
 *                                    − every dated bucket spent on or before D
 *   still reserved = undated buckets + dated buckets whose date is after D
 *   free           = cash on hand − still reserved
 *
 * So a bucket is reserved right up to its spend date and then disappears — the
 * money left with it. An undated bucket is an open-ended reserve and is held in
 * every snapshot, forever.
 */

/** An inflow with its dollar value resolved; null when an RSU has no price. */
export type ValuedInflow = { inflow: Inflow; value: number | null };

export type Milestone = {
  /** Stable React key — the date, or `today`. */
  key: string;
  date: IsoDate;
  isToday: boolean;
  /** Money arriving on this date. On the Today row, anything back-dated. */
  arrivals: ValuedInflow[];
  /** Buckets spent on this date. On the Today row, anything back-dated. */
  departures: Bucket[];
  /** Cash on hand at the end of this day. */
  cash: number;
  /** Buckets still held after this day, in the user's own row order. */
  pending: Bucket[];
  /** `allocated` is what's still reserved; `unallocated` is what's free. */
  derived: Derived;
};

export type Projection = {
  milestones: Milestone[];
  /** Tickers referenced by a vest but with no price yet — counted as $0. */
  unpricedTickers: string[];
  /** Dated entries at or before today, folded into the Today row. */
  backdatedCount: number;
};

/** Post-tax dollars for an inflow, or null when the price is still unknown. */
export function valueInflow(inflow: Inflow, quotes: Record<string, Quote>): number | null {
  if (inflow.kind === 'cash') return inflow.amount;
  const quote = quotes[inflow.ticker];
  if (!quote) return null;
  return rsuNetDollars(inflow.units, quote.priceCents, inflow.taxRateBps);
}

/** Gross (pre-tax) dollars for a vest, for the row's own breakdown. */
export function grossInflow(inflow: Inflow, quotes: Record<string, Quote>): number | null {
  if (inflow.kind === 'cash') return inflow.amount;
  const quote = quotes[inflow.ticker];
  if (!quote) return null;
  return rsuNetDollars(inflow.units, quote.priceCents, 0);
}

export function projectTimeline(state: AppState, today: IsoDate): Projection {
  const valued: ValuedInflow[] = state.inflows.map((inflow) => ({
    inflow,
    value: valueInflow(inflow, state.quotes),
  }));

  const dated = state.buckets.filter((b): b is Bucket & { date: IsoDate } => b.date !== null);

  // Every future date that changes the picture, plus today as the baseline.
  const futureDates = new Set<IsoDate>();
  for (const { inflow } of valued) if (inflow.date > today) futureDates.add(inflow.date);
  for (const bucket of dated) if (bucket.date > today) futureDates.add(bucket.date);

  const dates: IsoDate[] = [today, ...[...futureDates].sort()];

  const milestones = dates.map((date, index) => {
    const isToday = index === 0;
    // The Today row absorbs anything back-dated: money that has already moved is
    // already in the balance the user typed, so it can't also sit in the future.
    const landedHere = (eventDate: IsoDate) => (isToday ? eventDate <= date : eventDate === date);

    const received = valued
      .filter(({ inflow }) => inflow.date <= date)
      .reduce((sum, { value }) => sum + (value ?? 0), 0);
    const spent = dated
      .filter((bucket) => bucket.date <= date)
      .reduce((sum, bucket) => sum + bucket.amount, 0);

    const cash = state.balance + received - spent;
    const pending = state.buckets.filter((bucket) => bucket.date === null || bucket.date > date);

    return {
      key: isToday ? 'today' : date,
      date,
      isToday,
      arrivals: valued.filter(({ inflow }) => landedHere(inflow.date)),
      departures: dated.filter((bucket) => landedHere(bucket.date)),
      cash,
      pending,
      derived: derive(cash, pending),
    } satisfies Milestone;
  });

  const unpricedTickers = [
    ...new Set(
      valued
        .filter(({ inflow, value }) => inflow.kind === 'rsu' && value === null)
        .map(({ inflow }) => (inflow.kind === 'rsu' ? inflow.ticker : '')),
    ),
  ].filter((ticker) => ticker !== '');

  const backdatedCount =
    valued.filter(({ inflow }) => inflow.date <= today).length +
    dated.filter((bucket) => bucket.date <= today).length;

  return { milestones, unpricedTickers, backdatedCount };
}
