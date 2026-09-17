import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeOutcome,
  fetchQuote,
  parseStooqCsv,
  parseStooqDailyCsv,
  parseYahooChart,
  probe,
  PROVIDERS,
  refreshQuotes,
  resetPreferred,
  stooqSymbol,
  STALE_MS,
} from './quotes';
import type { Quote } from './types';
import type { IsoDate } from './dates';

const TODAY: IsoDate = '2026-09-17';
const QUOTE_HEADER = 'Symbol,Date,Time,Open,High,Low,Close,Volume';
const DAILY_HEADER = 'Date,Open,High,Low,Close,Volume';

beforeEach(() => {
  resetPreferred();
});

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
    expect(parseStooqCsv(`${QUOTE_HEADER}\nAAPL.US,2026-09-16,22:00:07,245.10,246.80,244.00,245.50,50123456`)).toEqual(
      { ok: true, priceCents: 24_550 },
    );
  });

  it('tolerates CRLF line endings', () => {
    expect(parseStooqCsv(`${QUOTE_HEADER}\r\nAAPL.US,2026-09-16,22:00:07,1,1,1,12.34,1\r\n`)).toEqual({
      ok: true,
      priceCents: 1234,
    });
  });

  it('treats an unknown ticker as an error, not as a price of zero', () => {
    expect(parseStooqCsv(`${QUOTE_HEADER}\nNOPE.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D`)).toEqual({
      ok: false,
      error: 'unknown ticker',
    });
  });

  it('refuses a body with no data row', () => {
    expect(parseStooqCsv(QUOTE_HEADER).ok).toBe(false);
    expect(parseStooqCsv('').ok).toBe(false);
  });
});

describe('parseStooqDailyCsv', () => {
  it('takes the last row — the history comes back oldest first', () => {
    const csv = [
      DAILY_HEADER,
      '2026-09-14,240.00,241.00,239.00,240.50,1000',
      '2026-09-15,241.00,242.00,240.00,241.75,1000',
      '2026-09-16,245.10,246.80,244.00,245.50,50123456',
    ].join('\n');
    expect(parseStooqDailyCsv(csv)).toEqual({ ok: true, priceCents: 24_550 });
  });

  it('ignores a trailing blank line rather than reading it as the latest day', () => {
    const csv = `${DAILY_HEADER}\n2026-09-16,1,1,1,99.99,1\n\n`;
    expect(parseStooqDailyCsv(csv)).toEqual({ ok: true, priceCents: 9999 });
  });

  it('refuses a header-only body', () => {
    expect(parseStooqDailyCsv(DAILY_HEADER)).toEqual({ ok: false, error: 'no rows returned' });
  });
});

describe('parseYahooChart', () => {
  it('reads regularMarketPrice out of the chart metadata', () => {
    const body = JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 245.5 } }], error: null } });
    expect(parseYahooChart(body)).toEqual({ ok: true, priceCents: 24_550 });
  });

  it("surfaces Yahoo's own error description", () => {
    const body = JSON.stringify({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } });
    expect(parseYahooChart(body)).toEqual({ ok: false, error: 'No data found, symbol may be delisted' });
  });

  it('refuses an HTML error page served with a 200', () => {
    expect(parseYahooChart('<!doctype html><html>nope</html>')).toEqual({
      ok: false,
      error: 'response was not JSON',
    });
  });

  it('refuses a well-formed response with no price in it', () => {
    expect(parseYahooChart(JSON.stringify({ chart: { result: [{ meta: {} }] } }))).toEqual({
      ok: false,
      error: 'no regularMarketPrice in response',
    });
  });
});

describe('provider URLs', () => {
  const urlFor = (id: string) => PROVIDERS.find((p) => p.id === id)!.url('AAPL', TODAY);

  it('qualifies the symbol for stooq and not for Yahoo', () => {
    expect(urlFor('stooq-quote')).toContain('s=aapl.us');
    expect(urlFor('yahoo-1')).toContain('/chart/AAPL');
  });

  it('bounds the daily request to a short window instead of pulling all history', () => {
    const url = urlFor('stooq-daily');
    expect(url).toContain('d1=20260907');
    expect(url).toContain('d2=20260917');
  });

  it('gives every source a distinct id and host', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * A fetch stub keyed by URL substring. `null` makes the request throw, which is
 * how the browser reports a CORS refusal; a number makes it that HTTP status.
 */
const stubFetch = (routes: { match: string; body?: string; status?: number | null }[]) => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    const route = routes.find((r) => url.includes(r.match));
    if (!route || route.status === null) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({
      ok: (route.status ?? 200) < 400,
      status: route.status ?? 200,
      text: () => Promise.resolve(route.body ?? ''),
    });
  });
  return calls;
};

const yahooBody = (price: number) => JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price } }] } });

describe('fetchQuote', () => {
  it('falls through to the next source when one 404s', async () => {
    stubFetch([
      { match: 'stooq.com/q/l', status: 404 },
      { match: 'stooq.com/q/d/l', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,245.50,1` },
    ]);
    const report = await fetchQuote('AAPL', TODAY);
    expect(report.result).toEqual({ ok: true, priceCents: 24_550 });
    expect(report.via?.id).toBe('stooq-daily');
    expect(report.tried.map((t) => [t.provider.id, t.outcome.kind])).toEqual([
      ['stooq-quote', 'http'],
      ['stooq-daily', 'ok'],
    ]);
  });

  it('falls through a CORS refusal too — a thrown fetch is not the end of the line', async () => {
    stubFetch([
      { match: 'stooq.com', status: null },
      { match: 'query1.finance.yahoo.com', body: yahooBody(99) },
    ]);
    const report = await fetchQuote('AAPL', TODAY);
    expect(report.result).toEqual({ ok: true, priceCents: 9900 });
    expect(report.via?.id).toBe('yahoo-1');
    expect(report.tried.map((t) => t.outcome.kind)).toEqual(['blocked', 'blocked', 'ok']);
  });

  it('keeps going when a source answers 200 with an unusable body', async () => {
    stubFetch([
      { match: 'stooq.com/q/l', body: '<html>go away</html>' },
      { match: 'stooq.com/q/d/l', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,10.00,1` },
    ]);
    const report = await fetchQuote('AAPL', TODAY);
    expect(report.tried[0]?.outcome.kind).toBe('parse');
    expect(report.result).toEqual({ ok: true, priceCents: 1000 });
  });

  it('reports every source it tried when they all fail', async () => {
    stubFetch([]);
    const report = await fetchQuote('AAPL', TODAY);
    expect(report.result).toEqual({ ok: false, error: 'no source returned a price' });
    expect(report.via).toBeNull();
    expect(report.tried).toHaveLength(PROVIDERS.length);
  });

  it('tries the source that last worked first, instead of walking the dead ones again', async () => {
    stubFetch([
      { match: 'stooq.com', status: 404 },
      { match: 'query1.finance.yahoo.com', body: yahooBody(50) },
    ]);
    await fetchQuote('AAPL', TODAY);

    const calls = stubFetch([{ match: 'query1.finance.yahoo.com', body: yahooBody(50) }]);
    const second = await fetchQuote('AAPL', TODAY);
    expect(second.result).toEqual({ ok: true, priceCents: 5000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('query1.finance.yahoo.com');
  });
});

describe('probe', () => {
  it('reports one row per source, including the ones that fail', async () => {
    stubFetch([
      { match: 'stooq.com/q/l', status: 404 },
      { match: 'stooq.com/q/d/l', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,245.50,1` },
      { match: 'query1', status: null },
      { match: 'query2', body: '<html>' },
    ]);
    const rows = await probe('AAPL', TODAY);
    expect(rows.map((r) => [r.provider.id, r.outcome.kind])).toEqual([
      ['stooq-quote', 'http'],
      ['stooq-daily', 'ok'],
      ['yahoo-1', 'blocked'],
      ['yahoo-2', 'parse'],
    ]);
  });

  it('does not let a probe change which source a later fetch prefers', async () => {
    stubFetch([{ match: 'stooq.com/q/d/l', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,1.00,1` }]);
    await probe('AAPL', TODAY);
    const calls = stubFetch([{ match: 'stooq.com/q/d/l', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,1.00,1` }]);
    await fetchQuote('AAPL', TODAY);
    // Still starts at the top of the list, not at whatever the probe found.
    expect(calls[0]).toContain('stooq.com/q/l');
  });
});

describe('describeOutcome', () => {
  it('names the real status when the browser let us see it', () => {
    expect(describeOutcome({ kind: 'http', status: 404, ms: 12 })).toBe('HTTP 404');
    expect(describeOutcome({ kind: 'ok', priceCents: 24_550, ms: 12 })).toBe('worked — $245.50');
    expect(describeOutcome({ kind: 'parse', detail: 'unknown ticker', ms: 12 })).toBe(
      'answered, but unknown ticker',
    );
  });

  it('does not claim to know why a thrown fetch failed', () => {
    expect(describeOutcome({ kind: 'blocked', ms: 12 })).toBe('blocked — CORS or network');
  });
});

const NOW = Date.parse('2026-09-17T12:00:00.000Z');
const quote = (priceCents: number, source: Quote['source'], ageMs = 0): Quote => ({
  priceCents,
  source,
  via: source === 'manual' ? null : 'Stooq · daily',
  asOf: new Date(NOW - ageMs).toISOString(),
});

const workingDaily = [{ match: 'stooq.com/q/d/l', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,999.00,1` }];

describe('refreshQuotes', () => {
  it('records which source supplied the price', async () => {
    stubFetch([{ match: 'stooq.com/q/l', status: 404 }, ...workingDaily]);
    const outcome = await refreshQuotes(['AAPL'], {}, TODAY, { now: NOW });
    expect(outcome.updated).toEqual(['AAPL']);
    expect(outcome.quotes.AAPL).toEqual({
      priceCents: 99_900,
      asOf: '2026-09-17T12:00:00.000Z',
      source: 'fetched',
      via: 'Stooq · daily',
    });
  });

  it('skips a price that is still fresh', async () => {
    const calls = stubFetch(workingDaily);
    const existing = { AAPL: quote(24_550, 'fetched', STALE_MS - 1000) };
    const outcome = await refreshQuotes(['AAPL'], existing, TODAY, { now: NOW });
    expect(calls).toEqual([]);
    expect(outcome.skipped).toEqual(['AAPL']);
    expect(outcome.quotes.AAPL?.priceCents).toBe(24_550);
  });

  it('refetches a price once it has gone stale', async () => {
    stubFetch(workingDaily);
    const existing = { AAPL: quote(24_550, 'fetched', STALE_MS + 1000) };
    const outcome = await refreshQuotes(['AAPL'], existing, TODAY, { now: NOW });
    expect(outcome.quotes.AAPL?.priceCents).toBe(99_900);
  });

  it('leaves a price you typed yourself alone until you ask for a refresh', async () => {
    stubFetch(workingDaily);
    const existing = { AAPL: quote(20_000, 'manual', STALE_MS * 10) };

    const automatic = await refreshQuotes(['AAPL'], existing, TODAY, { now: NOW });
    expect(automatic.skipped).toEqual(['AAPL']);
    expect(automatic.quotes.AAPL).toEqual(existing.AAPL);

    const forced = await refreshQuotes(['AAPL'], existing, TODAY, { now: NOW, force: true });
    expect(forced.quotes.AAPL?.priceCents).toBe(99_900);
    expect(forced.quotes.AAPL?.source).toBe('fetched');
  });

  it('keeps the last known price when every source fails, rather than blanking it', async () => {
    stubFetch([]);
    const existing = { AAPL: quote(24_550, 'fetched', STALE_MS * 2) };
    const outcome = await refreshQuotes(['AAPL'], existing, TODAY, { now: NOW });
    expect(outcome.failed).toEqual([{ ticker: 'AAPL', error: 'no source returned a price' }]);
    expect(outcome.quotes.AAPL?.priceCents).toBe(24_550);
  });

  it('reports per-ticker outcomes when some succeed and some do not', async () => {
    stubFetch([
      { match: 's=aapl.us&d1', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,245.50,1` },
      { match: 's=nope.us', status: 404 },
    ]);
    const outcome = await refreshQuotes(['AAPL', 'NOPE'], {}, TODAY, { now: NOW });
    expect(outcome.updated).toEqual(['AAPL']);
    expect(outcome.failed.map((f) => f.ticker)).toEqual(['NOPE']);
    expect(outcome.quotes.NOPE).toBeUndefined();
  });

  it('does nothing when there is nothing to fetch', async () => {
    const calls = stubFetch([]);
    const outcome = await refreshQuotes([], {}, TODAY, { now: NOW });
    expect(calls).toEqual([]);
    expect(outcome).toEqual({ quotes: {}, updated: [], failed: [], skipped: [] });
  });
});
