import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load, parseState, save } from './storage';
import { emptyState } from './types';

const valid = {
  version: 2 as const,
  balance: 20000,
  buckets: [
    {
      id: 'a',
      name: 'Kitchen',
      amount: 5000,
      note: 'quote pending',
      date: '2027-01-18',
      colorSlot: 0,
      colorOverride: null,
    },
  ],
  inflows: [
    { kind: 'cash' as const, id: 'r', name: 'Tax refund', date: '2027-04-15', amount: 3200 },
    {
      kind: 'rsu' as const,
      id: 'v',
      name: 'Q1 vest',
      date: '2027-02-15',
      ticker: 'AAPL',
      units: 120,
      taxRateBps: 2200,
    },
  ],
  quotes: {
    AAPL: {
      priceCents: 24550,
      asOf: '2026-09-17T12:00:00.000Z',
      source: 'fetched' as const,
      via: 'Yahoo · query1',
    },
  },
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

  it('upgrades a v1 payload: no dates, no inflows, no quotes', () => {
    const parsed = parseState({
      version: 1,
      balance: 100,
      buckets: [{ id: 'a', name: 'Emergency fund', amount: 100, colorSlot: 0 }],
    });
    expect(parsed).toEqual({
      version: 2,
      balance: 100,
      // An existing bucket becomes an open-ended reserve, which is what the app
      // did before dates existed.
      buckets: [
        { id: 'a', name: 'Emergency fund', amount: 100, note: '', date: null, colorSlot: 0, colorOverride: null },
      ],
      inflows: [],
      quotes: {},
    });
  });

  it('rejects an impossible bucket date rather than rescheduling money silently', () => {
    expect(
      parseState({ version: 2, balance: 0, buckets: [{ name: 'X', amount: 0, date: '2027-02-31' }] }),
    ).toBeNull();
    expect(
      parseState({ version: 2, balance: 0, buckets: [{ name: 'X', amount: 0, date: 'someday' }] }),
    ).toBeNull();
  });

  it('rejects the payload when one inflow is bad, rather than losing a vest', () => {
    const base = { version: 2, balance: 0, buckets: [] };
    expect(parseState({ ...base, inflows: [{ kind: 'cash', name: 'X', date: 'nope', amount: 1 }] })).toBeNull();
    expect(parseState({ ...base, inflows: [{ kind: 'cash', name: 'X', date: '2027-01-01' }] })).toBeNull();
    expect(parseState({ ...base, inflows: [{ kind: 'wat', name: 'X', date: '2027-01-01' }] })).toBeNull();
    expect(
      parseState({
        ...base,
        inflows: [{ kind: 'rsu', name: 'X', date: '2027-01-01', ticker: 'AAPL', units: 1, taxRateBps: 20_000 }],
      }),
    ).toBeNull();
  });

  it('normalizes an inflow ticker to uppercase', () => {
    const parsed = parseState({
      version: 2,
      balance: 0,
      buckets: [],
      inflows: [{ kind: 'rsu', name: 'X', date: '2027-01-01', ticker: ' aapl ', units: 1.5, taxRateBps: 2200 }],
    });
    expect(parsed?.inflows[0]).toMatchObject({ ticker: 'AAPL', units: 1.5 });
  });

  it('drops a junk quote instead of failing the whole import — it is only a cache', () => {
    const parsed = parseState({
      version: 2,
      balance: 100,
      buckets: [],
      quotes: {
        AAPL: { priceCents: 24550, asOf: '2026-09-17T12:00:00.000Z', source: 'fetched', via: 'Yahoo · query1' },
        BAD: { priceCents: -1, asOf: '2026-09-17T12:00:00.000Z', source: 'fetched' },
        WHEN: { priceCents: 100, asOf: 'never', source: 'fetched' },
        WHO: { priceCents: 100, asOf: '2026-09-17T12:00:00.000Z', source: 'hearsay' },
      },
    });
    expect(Object.keys(parsed?.quotes ?? {})).toEqual(['AAPL']);
    expect(parsed?.balance).toBe(100);
  });

  it('migrates the old single-source `stooq` tag to `fetched`', () => {
    const parsed = parseState({
      version: 2,
      balance: 0,
      buckets: [],
      quotes: { AAPL: { priceCents: 24550, asOf: '2026-09-17T12:00:00.000Z', source: 'stooq' } },
    });
    expect(parsed?.quotes.AAPL).toEqual({
      priceCents: 24550,
      asOf: '2026-09-17T12:00:00.000Z',
      source: 'fetched',
      via: null,
    });
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
