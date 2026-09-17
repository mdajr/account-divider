import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseStooqCsv, refreshQuotes, stooqSymbol, STALE_MS } from './quotes';
import type { Quote } from './types';

const HEADER = 'Symbol,Date,Time,Open,High,Low,Close,Volume';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stooqSymbol', () => {
  it('suffixes a bare ticker for the US market', () => {
    expect(stooqSymbol('AAPL')).toBe('aapl.us');
    expect(stooqSymbol('  msft ')).toBe('msft.us');
  });

  it('leaves an already-qualified symbol alone', () => {
    expect(stooqSymbol('bp.uk')).toBe('bp.uk');
  });
});

describe('parseStooqCsv', () => {
  it('reads the close price into cents', () => {
    const csv = `${HEADER}\nAAPL.US,2026-09-16,22:00:07,245.10,246.80,244.00,245.50,50123456`;
    expect(parseStooqCsv(csv)).toEqual({ ok: true, priceCents: 24_550 });
  });

  it('tolerates CRLF line endings', () => {
    const csv = `${HEADER}\r\nAAPL.US,2026-09-16,22:00:07,1,1,1,12.34,1\r\n`;
    expect(parseStooqCsv(csv)).toEqual({ ok: true, priceCents: 1234 });
  });

  it('rounds a price quoted to more than two decimals', () => {
    const csv = `${HEADER}\nX.US,2026-09-16,22:00:07,1,1,1,0.12345,1`;
    expect(parseStooqCsv(csv)).toEqual({ ok: true, priceCents: 12 });
  });

  it('treats an unknown ticker as an error, not as a price of zero', () => {
    const csv = `${HEADER}\nNOPE.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D`;
    expect(parseStooqCsv(csv)).toEqual({ ok: false, error: 'Unknown ticker' });
  });

  it('refuses a body with no data row', () => {
    expect(parseStooqCsv(HEADER).ok).toBe(false);
    expect(parseStooqCsv('').ok).toBe(false);
  });
});

/** A fetch stub that answers with a fixed close price per symbol. */
const stubFetch = (prices: Record<string, string>) => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    const symbol = new URL(url).searchParams.get('s') ?? '';
    const close = prices[symbol];
    if (close === undefined) return Promise.reject(new Error('network down'));
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(`${HEADER}\n${symbol.toUpperCase()},2026-09-16,22:00:07,1,1,1,${close},1`),
    });
  });
  return calls;
};

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const quote = (priceCents: number, source: Quote['source'], ageMs = 0): Quote => ({
  priceCents,
  source,
  asOf: new Date(NOW - ageMs).toISOString(),
});

describe('refreshQuotes', () => {
  it('fetches a ticker it has never seen', async () => {
    stubFetch({ 'aapl.us': '245.50' });
    const outcome = await refreshQuotes(['AAPL'], {}, { now: NOW });
    expect(outcome.updated).toEqual(['AAPL']);
    expect(outcome.quotes.AAPL).toEqual({
      priceCents: 24_550,
      asOf: '2026-09-17T12:00:00.000Z',
      source: 'stooq',
    });
  });

  it('skips a price that is still fresh', async () => {
    const calls = stubFetch({ 'aapl.us': '999.00' });
    const existing = { AAPL: quote(24_550, 'stooq', STALE_MS - 1000) };
    const outcome = await refreshQuotes(['AAPL'], existing, { now: NOW });
    expect(calls).toEqual([]);
    expect(outcome.skipped).toEqual(['AAPL']);
    expect(outcome.quotes.AAPL?.priceCents).toBe(24_550);
  });

  it('refetches a price once it has gone stale', async () => {
    stubFetch({ 'aapl.us': '999.00' });
    const existing = { AAPL: quote(24_550, 'stooq', STALE_MS + 1000) };
    const outcome = await refreshQuotes(['AAPL'], existing, { now: NOW });
    expect(outcome.quotes.AAPL?.priceCents).toBe(99_900);
  });

  it('leaves a price you typed yourself alone until you ask for a refresh', async () => {
    stubFetch({ 'aapl.us': '999.00' });
    const existing = { AAPL: quote(20_000, 'manual', STALE_MS * 10) };

    const automatic = await refreshQuotes(['AAPL'], existing, { now: NOW });
    expect(automatic.skipped).toEqual(['AAPL']);
    expect(automatic.quotes.AAPL).toEqual(existing.AAPL);

    const forced = await refreshQuotes(['AAPL'], existing, { now: NOW, force: true });
    expect(forced.quotes.AAPL).toEqual({
      priceCents: 99_900,
      asOf: '2026-09-17T12:00:00.000Z',
      source: 'stooq',
    });
  });

  it('keeps the last known price when a fetch fails, rather than blanking it', async () => {
    stubFetch({}); // every request rejects
    const existing = { AAPL: quote(24_550, 'stooq', STALE_MS * 2) };
    const outcome = await refreshQuotes(['AAPL'], existing, { now: NOW });
    expect(outcome.failed).toEqual([{ ticker: 'AAPL', error: "Couldn't reach the price service" }]);
    expect(outcome.quotes.AAPL?.priceCents).toBe(24_550);
  });

  it('reports per-ticker outcomes when some succeed and some do not', async () => {
    stubFetch({ 'aapl.us': '245.50' });
    const outcome = await refreshQuotes(['AAPL', 'NOPE'], {}, { now: NOW });
    expect(outcome.updated).toEqual(['AAPL']);
    expect(outcome.failed.map((f) => f.ticker)).toEqual(['NOPE']);
    expect(outcome.quotes.NOPE).toBeUndefined();
  });

  it('does nothing when there is nothing to fetch', async () => {
    const calls = stubFetch({});
    const outcome = await refreshQuotes([], {}, { now: NOW });
    expect(calls).toEqual([]);
    expect(outcome).toEqual({ quotes: {}, updated: [], failed: [], skipped: [] });
  });
});
