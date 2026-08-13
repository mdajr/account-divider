import type { AppState, Bucket } from './types';
import { nextFreeSlot } from './palette';

export type Derived = {
  allocated: number;
  unallocated: number;
  isOverAllocated: boolean;
  /** Denominator for the bar: the bar always fills 100% of its track. */
  denominator: number;
};

export function derive(state: AppState): Derived {
  const allocated = state.buckets.reduce((sum, b) => sum + b.amount, 0);
  const unallocated = state.balance - allocated;
  return {
    allocated,
    unallocated,
    isOverAllocated: unallocated < 0,
    denominator: Math.max(state.balance, allocated),
  };
}

/** Share of `denominator` as a 0-100 number. Guards the empty/zero case. */
export function percentOf(amount: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (amount / denominator) * 100;
}

export function createBucket(existing: readonly Bucket[], name: string, amount: number): Bucket {
  return {
    id: crypto.randomUUID(),
    name,
    amount,
    note: '',
    colorSlot: nextFreeSlot(existing.map((b) => b.colorSlot)),
    colorOverride: null,
  };
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
