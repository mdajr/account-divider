import { describe, expect, it } from 'vitest';
import { createBucket, derive, moveBucket, percentOf } from './state';
import { nextFreeSlot } from './palette';
import type { AppState, Bucket } from './types';

const bucket = (name: string, amount: number, colorSlot = 0): Bucket => ({
  id: name,
  name,
  amount,
  note: '',
  colorSlot,
  colorOverride: null,
});

const state = (balance: number, buckets: Bucket[]): AppState => ({ version: 1, balance, buckets });

describe('derive', () => {
  it('computes the remainder under-allocated', () => {
    const result = derive(state(20000, [bucket('Kitchen', 5000), bucket('Roof', 10000)]));
    expect(result).toEqual({
      allocated: 15000,
      unallocated: 5000,
      isOverAllocated: false,
      denominator: 20000,
    });
  });

  it('goes negative and flags over-allocation, widening the bar denominator', () => {
    const result = derive(state(10000, [bucket('Kitchen', 8000), bucket('Roof', 5000)]));
    expect(result.allocated).toBe(13000);
    expect(result.unallocated).toBe(-3000);
    expect(result.isOverAllocated).toBe(true);
    // Bar still fills 100%, scaled to the larger of the two.
    expect(result.denominator).toBe(13000);
  });

  it('treats an exactly-spent balance as not over-allocated', () => {
    const result = derive(state(15000, [bucket('Kitchen', 15000)]));
    expect(result.unallocated).toBe(0);
    expect(result.isOverAllocated).toBe(false);
  });

  it('handles the empty case without dividing by zero', () => {
    expect(derive(state(0, []))).toEqual({
      allocated: 0,
      unallocated: 0,
      isOverAllocated: false,
      denominator: 0,
    });
  });

  it('stays exact across many buckets — no float drift', () => {
    const buckets = Array.from({ length: 100 }, (_, i) => bucket(`b${i}`, 1));
    expect(derive(state(100, buckets)).unallocated).toBe(0);
  });
});

describe('percentOf', () => {
  it('returns a 0-100 share', () => {
    expect(percentOf(5000, 20000)).toBe(25);
  });

  it('returns 0 rather than NaN when there is nothing to divide by', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(100, 0)).toBe(0);
  });
});

describe('color slot assignment', () => {
  it('hands out the lowest free slot', () => {
    expect(nextFreeSlot([])).toBe(0);
    expect(nextFreeSlot([0, 1, 2])).toBe(3);
  });

  it('reuses a slot freed by a deletion', () => {
    expect(nextFreeSlot([0, 2, 3])).toBe(1);
  });

  it('cycles once all eight are in use', () => {
    expect(nextFreeSlot([0, 1, 2, 3, 4, 5, 6, 7])).toBe(0);
  });

  it('gives new buckets distinct slots', () => {
    const first = createBucket([], 'Kitchen', 5000);
    const second = createBucket([first], 'Roof', 10000);
    expect(second.colorSlot).not.toBe(first.colorSlot);
  });
});

describe('moveBucket', () => {
  const list = [bucket('a', 1, 0), bucket('b', 2, 1), bucket('c', 3, 2)];

  it('moves a row up and down', () => {
    expect(moveBucket(list, 2, -1).map((b) => b.name)).toEqual(['a', 'c', 'b']);
    expect(moveBucket(list, 0, 1).map((b) => b.name)).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op at the ends', () => {
    expect(moveBucket(list, 0, -1).map((b) => b.name)).toEqual(['a', 'b', 'c']);
    expect(moveBucket(list, 2, 1).map((b) => b.name)).toEqual(['a', 'b', 'c']);
  });

  it('never repaints survivors — colors follow the bucket, not the row', () => {
    const moved = moveBucket(list, 0, 1);
    expect(moved.map((b) => [b.name, b.colorSlot])).toEqual([
      ['b', 1],
      ['a', 0],
      ['c', 2],
    ]);
  });
});
