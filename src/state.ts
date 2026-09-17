import type { Bucket, CashInflow, Inflow, RsuInflow } from './types';
import type { IsoDate } from './dates';
import { nextFreeSlot } from './palette';

export type Derived = {
  allocated: number;
  unallocated: number;
  isOverAllocated: boolean;
  /** Denominator for the bar: the bar always fills 100% of its track. */
  denominator: number;
};

/**
 * The split of a balance across buckets. Takes the two numbers rather than the
 * whole state so the timeline can run it on a *projected* balance and a subset
 * of buckets — the arithmetic is identical, only the inputs move.
 */
export function derive(balance: number, buckets: readonly Bucket[]): Derived {
  const allocated = buckets.reduce((sum, b) => sum + b.amount, 0);
  const unallocated = balance - allocated;
  return {
    allocated,
    unallocated,
    isOverAllocated: unallocated < 0,
    denominator: Math.max(balance, allocated),
  };
}

/** Share of `denominator` as a 0-100 number. Guards the empty/zero case. */
export function percentOf(amount: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (amount / denominator) * 100;
}

export function createBucket(
  existing: readonly Bucket[],
  name: string,
  amount: number,
  date: IsoDate | null = null,
): Bucket {
  return {
    id: crypto.randomUUID(),
    name,
    amount,
    note: '',
    date,
    colorSlot: nextFreeSlot(existing.map((b) => b.colorSlot)),
    colorOverride: null,
  };
}

export function createCashInflow(name: string, date: IsoDate, amount: number): CashInflow {
  return { kind: 'cash', id: crypto.randomUUID(), name, date, amount };
}

export function createRsuInflow(
  name: string,
  date: IsoDate,
  ticker: string,
  units: number,
  taxRateBps: number,
): RsuInflow {
  return { kind: 'rsu', id: crypto.randomUUID(), name, date, ticker: normalizeTicker(ticker), units, taxRateBps };
}

/** Tickers are matched case-insensitively against the quote cache. */
export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/** Every distinct ticker an RSU row references, in first-seen order. */
export function tickersIn(inflows: readonly Inflow[]): string[] {
  const seen: string[] = [];
  for (const inflow of inflows) {
    if (inflow.kind !== 'rsu' || inflow.ticker === '') continue;
    if (!seen.includes(inflow.ticker)) seen.push(inflow.ticker);
  }
  return seen;
}

export function moveBucket(buckets: readonly Bucket[], index: number, delta: number): Bucket[] {
  const target = index + delta;
  if (index < 0 || index >= buckets.length || target < 0 || target >= buckets.length) {
    return [...buckets];
  }
  const next = [...buckets];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}
