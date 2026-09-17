import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeOutcome,
  fetchQuote,
  parseStooqDailyCsv,
  parseYahooChart,
  probe,
  PROVIDERS,
  RELAY_NAMES,
  refreshQuotes,
  resetPreferred,
  stooqSymbol,
  STALE_MS,
} from './quotes';
import type { Quote } from './types';
import type { IsoDate } from './dates';

const TODAY: IsoDate = '2026-09-17';
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

describe('providers', () => {
  it('routes every source through a relay — nothing is fetched direct', () => {
    for (const provider of PROVIDERS) {
      const url = provider.url('AAPL', TODAY);
      expect(url.startsWith('https://stooq.com'), provider.id).toBe(false);
      expect(url.startsWith('https://query1'), provider.id).toBe(false);
      expect(RELAY_NAMES.some((name) => provider.label.startsWith(name)), provider.id).toBe(true);
    }
  });

  it('percent-encodes the upstream URL so its query string survives the relay', () => {
    const url = PROVIDERS.find((p) => p.id === 'allorigins+stooq')!.url('AAPL', TODAY);
    // The upstream's own `&` and `?` must not be read as the relay's parameters.
    expect(url).toContain('https%3A%2F%2Fstooq.com%2Fq%2Fd%2Fl%2F');
    expect(url).toContain('%26d1%3D20260907');
    expect(url.indexOf('&')).toBe(-1);
  });

  it('qualifies the symbol for stooq and not for Yahoo', () => {
    expect(decodeURIComponent(PROVIDERS.find((p) => p.id === 'codetabs+stooq')!.url('AAPL', TODAY))).toContain(
      's=aapl.us',
    );
    expect(decodeURIComponent(PROVIDERS.find((p) => p.id === 'codetabs+yahoo')!.url('AAPL', TODAY))).toContain(
      '/chart/AAPL',
    );
  });

  it('bounds the daily request to a short window instead of pulling all history', () => {
    const url = decodeURIComponent(PROVIDERS.find((p) => p.id === 'allorigins+stooq')!.url('AAPL', TODAY));
    expect(url).toContain('d1=20260907');
    expect(url).toContain('d2=20260917');
  });

  it('crosses every relay with every upstream, with distinct ids', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('allorigins+stooq');
    expect(ids).toContain('corsproxy+yahoo');
  });
});

/**
 * A fetch stub keyed by substrings of the DECODED url, so a route can match the
 * relay (`allorigins`) or the upstream it wraps (`s=aapl.us`) interchangeably.
 * `status: null` makes the request throw, which is how a browser reports a CORS
 * refusal; a number makes it that HTTP status.
 */
const stubFetch = (routes: { match: string; body?: string; status?: number | null }[]) => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url);
    const decoded = decodeURIComponent(url);
    const route = routes.find((r) => decoded.includes(r.match));
    if (!route || route.status === null) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({
      ok: (route.status ?? 200) < 400,
      status: route.status ?? 200,
      text: () => Promise.resolve(route.body ?? ''),
    });
  });
  return calls;
};

const dailyBody = (price: string) => `${DAILY_HEADER}\n2026-09-16,1,1,1,${price},1`;
const yahooBody = (price: number) => JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price } }] } });

describe('fetchQuote', () => {
  it('moves to the next relay when the first one is down', async () => {
    stubFetch([
      { match: 'allorigins', status: 503 },
      { match: 'codetabs', body: dailyBody('245.50') },
    ]);
    const report = await fetchQuote('AAPL', TODAY);
    expect(report.result).toEqual({ ok: true, priceCents: 24_550 });
    expect(report.via?.id).toBe('codetabs+stooq');
    expect(report.tried.map((t) => [t.provider.id, t.outcome.kind])).toEqual([
      ['allorigins+stooq', 'http'],
      ['allorigins+yahoo', 'http'],
      ['codetabs+stooq', 'ok'],
    ]);
  });

  it('keeps going when a relay works but the upstream it wrapped does not', async () => {
    stubFetch([
      // The relay answers 200 with stooq's "unknown symbol" body.
      { match: 's=nope.us', body: `${DAILY_HEADER}\n2026-09-16,N/D,N/D,N/D,N/D,N/D` },
      { match: '/chart/NOPE', body: yahooBody(12.5) },
    ]);
    const report = await fetchQuote('NOPE', TODAY);
    expect(report.tried[0]?.outcome).toMatchObject({ kind: 'parse', detail: 'unknown ticker' });
    expect(report.result).toEqual({ ok: true, priceCents: 1250 });
    expect(report.via?.id).toBe('allorigins+yahoo');
  });

  it('survives a relay that returns its own error page with a 200', async () => {
    stubFetch([
      { match: 'allorigins', body: '{"error":"upstream timed out"}' },
      { match: 'codetabs', body: dailyBody('10.00') },
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
    expect(report.tried.every((t) => t.outcome.kind === 'blocked')).toBe(true);
  });

  it('tries the source that last worked first, instead of walking the dead ones again', async () => {
    stubFetch([
      { match: 'allorigins', status: 429 },
      { match: 'codetabs', body: dailyBody('50.00') },
    ]);
    await fetchQuote('AAPL', TODAY);

    const calls = stubFetch([{ match: 'codetabs', body: dailyBody('50.00') }]);
    const second = await fetchQuote('AAPL', TODAY);
    expect(second.result).toEqual({ ok: true, priceCents: 5000 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('codetabs');
  });
});

describe('probe', () => {
  it('reports one row per source, including the ones that fail', async () => {
    stubFetch([
      { match: 'allorigins', body: dailyBody('245.50') },
      { match: 'codetabs', status: 429 },
      { match: 'corsproxy', status: null },
    ]);
    const rows = await probe('AAPL', TODAY);
    expect(rows).toHaveLength(PROVIDERS.length);
    expect(rows.map((r) => [r.provider.id, r.outcome.kind])).toEqual([
      ['allorigins+stooq', 'ok'],
      // Same relay, but Yahoo's JSON parser can't read stooq's CSV.
      ['allorigins+yahoo', 'parse'],
      ['codetabs+stooq', 'http'],
      ['codetabs+yahoo', 'http'],
      ['corsproxy+stooq', 'blocked'],
      ['corsproxy+yahoo', 'blocked'],
    ]);
  });

  it('does not let a probe change which source a later fetch prefers', async () => {
    stubFetch([{ match: 'codetabs', body: dailyBody('1.00') }]);
    await probe('AAPL', TODAY);
    const calls = stubFetch([{ match: 'codetabs', body: dailyBody('1.00') }]);
    await fetchQuote('AAPL', TODAY);
    // Still starts at the top of the list, not at whatever the probe found.
    expect(calls[0]).toContain('allorigins');
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
  via: source === 'manual' ? null : 'AllOrigins → Stooq',
  asOf: new Date(NOW - ageMs).toISOString(),
});

const workingDaily = [{ match: 'allorigins', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,999.00,1` }];

describe('refreshQuotes', () => {
  it('records which source supplied the price', async () => {
    stubFetch(workingDaily);
    const outcome = await refreshQuotes(['AAPL'], {}, TODAY, { now: NOW });
    expect(outcome.updated).toEqual(['AAPL']);
    expect(outcome.quotes.AAPL).toEqual({
      priceCents: 99_900,
      asOf: '2026-09-17T12:00:00.000Z',
      source: 'fetched',
      via: 'AllOrigins → Stooq',
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
    stubFetch([{ match: 's=aapl.us', body: `${DAILY_HEADER}\n2026-09-16,1,1,1,245.50,1` }]);
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
