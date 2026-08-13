import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load, parseState, save } from './storage';
import { emptyState } from './types';

const valid = {
  version: 1 as const,
  balance: 20000,
  buckets: [
    { id: 'a', name: 'Kitchen', amount: 5000, note: 'quote pending', colorSlot: 0, colorOverride: null },
  ],
};

describe('parseState', () => {
  it('accepts well-formed data unchanged', () => {
    expect(parseState(valid)).toEqual(valid);
  });

  it('fills in optional fields that are missing', () => {
    const parsed = parseState({ version: 1, balance: 100, buckets: [{ name: 'X', amount: 10 }] });
    expect(parsed?.buckets[0]).toMatchObject({ name: 'X', amount: 10, note: '', colorOverride: null });
    expect(typeof parsed?.buckets[0]?.id).toBe('string');
  });

  it('rejects fractional amounts instead of rounding them', () => {
    expect(parseState({ ...valid, balance: 100.5 })).toBeNull();
    expect(parseState({ version: 1, balance: 100, buckets: [{ name: 'X', amount: 10.25 }] })).toBeNull();
  });

  it('rejects negative amounts', () => {
    expect(parseState({ version: 1, balance: 100, buckets: [{ name: 'X', amount: -5 }] })).toBeNull();
  });

  it('rejects structurally wrong payloads', () => {
    expect(parseState(null)).toBeNull();
    expect(parseState('nope')).toBeNull();
    expect(parseState({ balance: 100 })).toBeNull();
    expect(parseState({ balance: '100', buckets: [] })).toBeNull();
    expect(parseState({ balance: 100, buckets: {} })).toBeNull();
  });

  it('rejects the whole payload when one bucket is bad, rather than silently dropping it', () => {
    const parsed = parseState({
      version: 1,
      balance: 100,
      buckets: [{ name: 'good', amount: 10 }, { name: 'bad', amount: 'lots' }],
    });
    expect(parsed).toBeNull();
  });

  it('normalizes an out-of-range color slot into the palette', () => {
    const parsed = parseState({ version: 1, balance: 0, buckets: [{ name: 'X', amount: 0, colorSlot: 42 }] });
    expect(parsed?.buckets[0]?.colorSlot).toBe(2);
  });

  it('drops a malformed color override rather than emitting invalid CSS', () => {
    const parsed = parseState({
      version: 1,
      balance: 0,
      buckets: [{ name: 'X', amount: 0, colorOverride: 'red; background: url(x)' }],
    });
    expect(parsed?.buckets[0]?.colorOverride).toBeNull();
  });
});

describe('load / save', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });

  it('round-trips through storage', () => {
    save(valid);
    expect(load()).toEqual(valid);
  });

  it('returns an empty state when nothing is stored', () => {
    expect(load()).toEqual(emptyState());
  });

  it('survives a corrupt key instead of throwing', () => {
    localStorage.setItem('account-divider:v1', '{not json');
    expect(load()).toEqual(emptyState());
  });

  it('survives a valid-JSON-but-wrong-shape key', () => {
    localStorage.setItem('account-divider:v1', '{"balance":"lots"}');
    expect(load()).toEqual(emptyState());
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => save(valid)).not.toThrow();
    expect(load()).toEqual(emptyState());
  });
});
