import { describe, expect, it } from 'vitest';
import { projectTimeline, valueInflow } from './timeline';
import type { AppState, Bucket, Inflow, Quote } from './types';
import type { IsoDate } from './dates';

const TODAY: IsoDate = '2026-09-17';

const bucket = (name: string, amount: number, date: IsoDate | null = null, slot = 0): Bucket => ({
  id: name,
  name,
  amount,
  note: '',
  date,
  colorSlot: slot,
  colorOverride: null,
});

const cash = (name: string, date: IsoDate, amount: number): Inflow => ({
  kind: 'cash',
  id: name,
  name,
  date,
  amount,
});

const vest = (name: string, date: IsoDate, ticker: string, units: number, taxRateBps: number): Inflow => ({
  kind: 'rsu',
  id: name,
  name,
  date,
  ticker,
  units,
  taxRateBps,
});

const quote = (priceCents: number): Quote => ({
  priceCents,
  asOf: '2026-09-17T12:00:00.000Z',
  source: 'fetched',
  via: 'Stooq · daily',
});

const state = (over: Partial<AppState> = {}): AppState => ({
  version: 2,
  balance: 0,
  buckets: [],
  inflows: [],
  quotes: {},
  ...over,
});

describe('valueInflow', () => {
  it('takes cash at face value', () => {
    expect(valueInflow(cash('Refund', '2027-04-15', 3200), {})).toBe(3200);
  });

  it('values a vest at the latest price, net of withholding', () => {
    // 120 × $245.50 = $29,460 gross; 22% withheld leaves $22,978.80 → $22,979.
    expect(valueInflow(vest('Q1', '2027-02-15', 'AAPL', 120, 2200), { AAPL: quote(24550) })).toBe(22_979);
  });

  it('returns null — not zero — when the price is unknown, so the UI can say so', () => {
    expect(valueInflow(vest('Q1', '2027-02-15', 'AAPL', 120, 2200), {})).toBeNull();
  });

  it('lands on the dollar for fractional units and odd rates', () => {
    // 1 × $0.99 = 99¢ gross; 50% withheld leaves 49.5¢, which rounds to $0.
    expect(valueInflow(vest('Odd', '2027-01-01', 'X', 1, 5000), { X: quote(99) })).toBe(0);
    // 1337.5 × $187.33 = $250,553.875 gross; 37.12% withheld leaves $157,548.28.
    expect(valueInflow(vest('Big', '2027-01-01', 'X', 1337.5, 3712), { X: quote(18_733) })).toBe(157_548);
  });

  it('handles a zero tax rate and a 100% one', () => {
    expect(valueInflow(vest('Gross', '2027-01-01', 'X', 10, 0), { X: quote(10_000) })).toBe(1000);
    expect(valueInflow(vest('AllTax', '2027-01-01', 'X', 10, 10_000), { X: quote(10_000) })).toBe(0);
  });
});

describe('projectTimeline', () => {
  it('always has a Today row, even with nothing scheduled', () => {
    const { milestones } = projectTimeline(state({ balance: 20_000, buckets: [bucket('Fund', 5000)] }), TODAY);
    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({ key: 'today', date: TODAY, isToday: true, cash: 20_000 });
    expect(milestones[0]?.derived.unallocated).toBe(15_000);
  });

  it('adds a deposit to cash on its date and not before', () => {
    const projection = projectTimeline(
      state({ balance: 10_000, inflows: [cash('Deposit refund', '2027-03-01', 4000)] }),
      TODAY,
    );
    expect(projection.milestones.map((m) => [m.date, m.cash])).toEqual([
      [TODAY, 10_000],
      ['2027-03-01', 14_000],
    ]);
  });

  it("spends a dated bucket on its date — the day after, it's gone and so is the cash", () => {
    const projection = projectTimeline(
      state({ balance: 100_000, buckets: [bucket('Bathroom', 55_000, '2027-01-18')] }),
      TODAY,
    );
    const [today, jan18] = projection.milestones;

    // Reserved but still on hand until the 18th.
    expect(today).toMatchObject({ cash: 100_000 });
    expect(today?.derived.allocated).toBe(55_000);
    expect(today?.derived.unallocated).toBe(45_000);

    // On the 18th the money has left: nothing reserved, and what's left is free.
    expect(jan18).toMatchObject({ cash: 45_000 });
    expect(jan18?.pending).toHaveLength(0);
    expect(jan18?.derived.unallocated).toBe(45_000);
    expect(jan18?.departures.map((b) => b.name)).toEqual(['Bathroom']);
  });

  it('holds an undated bucket in every snapshot — that is what indefinite means', () => {
    const projection = projectTimeline(
      state({
        balance: 30_000,
        buckets: [bucket('Emergency fund', 20_000), bucket('Bathroom', 55_000, '2027-01-18', 1)],
        inflows: [cash('Refund', '2027-01-01', 50_000)],
      }),
      TODAY,
    );
    for (const milestone of projection.milestones) {
      expect(milestone.pending.map((b) => b.name)).toContain('Emergency fund');
    }
    const last = projection.milestones.at(-1);
    expect(last?.cash).toBe(30_000 + 50_000 - 55_000);
    expect(last?.derived.allocated).toBe(20_000);
    expect(last?.derived.unallocated).toBe(5000);
  });

  it('orders milestones by date regardless of entry order', () => {
    const projection = projectTimeline(
      state({
        inflows: [cash('c', '2028-01-01', 1), cash('a', '2027-02-09', 1), cash('b', '2027-10-01', 1)],
      }),
      TODAY,
    );
    expect(projection.milestones.map((m) => m.date)).toEqual([
      TODAY,
      '2027-02-09',
      '2027-10-01',
      '2028-01-01',
    ]);
  });

  it('collapses several events on one day into a single milestone', () => {
    const projection = projectTimeline(
      state({
        balance: 0,
        buckets: [bucket('Car', 5000, '2027-05-01')],
        inflows: [cash('a', '2027-05-01', 3000), cash('b', '2027-05-01', 4000)],
      }),
      TODAY,
    );
    expect(projection.milestones).toHaveLength(2);
    const day = projection.milestones[1];
    expect(day?.arrivals).toHaveLength(2);
    expect(day?.departures).toHaveLength(1);
    expect(day?.cash).toBe(2000);
  });

  it('folds back-dated entries into Today rather than hiding them in the past', () => {
    const projection = projectTimeline(
      state({
        balance: 1000,
        buckets: [bucket('Already paid', 400, '2026-01-01')],
        inflows: [cash('Already banked', '2026-06-01', 500)],
      }),
      TODAY,
    );
    expect(projection.milestones).toHaveLength(1);
    expect(projection.backdatedCount).toBe(2);
    expect(projection.milestones[0]?.cash).toBe(1000 + 500 - 400);
    expect(projection.milestones[0]?.arrivals).toHaveLength(1);
    expect(projection.milestones[0]?.departures).toHaveLength(1);
  });

  it('counts an unpriced vest as $0 and names the ticker so it can be fixed', () => {
    const projection = projectTimeline(
      state({ balance: 1000, inflows: [vest('Q1', '2027-02-15', 'AAPL', 120, 2200)] }),
      TODAY,
    );
    expect(projection.unpricedTickers).toEqual(['AAPL']);
    expect(projection.milestones[1]?.cash).toBe(1000);
    expect(projection.milestones[1]?.arrivals[0]?.value).toBeNull();
  });

  it('flags a snapshot where reservations outrun the cash on hand', () => {
    const projection = projectTimeline(
      state({
        balance: 60_000,
        buckets: [bucket('Emergency fund', 20_000), bucket('Bathroom', 55_000, '2027-01-18', 1)],
      }),
      TODAY,
    );
    // Today: $60k on hand against $75k reserved.
    expect(projection.milestones[0]?.derived.isOverAllocated).toBe(true);
    // After the bathroom is paid for, cash goes negative outright.
    expect(projection.milestones[1]?.cash).toBe(5000);
    expect(projection.milestones[1]?.derived.unallocated).toBe(-15_000);
  });

  it('runs a realistic plan end to end', () => {
    const projection = projectTimeline(
      state({
        balance: 40_000,
        quotes: { AAPL: quote(24_550) },
        buckets: [
          bucket('Emergency fund', 25_000),
          bucket('Bathroom reno', 55_000, '2027-01-18', 1),
        ],
        inflows: [
          cash('Security deposit refund', '2026-11-30', 4800),
          cash('Tax refund', '2027-04-15', 6200),
          vest('Feb vest', '2027-02-15', 'AAPL', 120, 2200),
        ],
      }),
      TODAY,
    );

    expect(projection.milestones.map((m) => [m.date, m.cash, m.derived.unallocated])).toEqual([
      [TODAY, 40_000, -40_000],
      ['2026-11-30', 44_800, -35_200],
      // Bathroom paid: cash drops $55k, but so does what's reserved.
      ['2027-01-18', -10_200, -35_200],
      ['2027-02-15', 12_779, -12_221],
      ['2027-04-15', 18_979, -6021],
    ]);
    expect(projection.unpricedTickers).toEqual([]);
    expect(projection.backdatedCount).toBe(0);
  });
});
