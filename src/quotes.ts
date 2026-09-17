import type { Quote } from './types';
import { addDays, compactDate, type IsoDate } from './dates';

/**
 * Share prices, fetched straight from the browser — this site has no backend to
 * proxy through, which rules out anything needing a secret.
 *
 * None of these sources is a supported API. They are public endpoints that may
 * rate-limit, move, or refuse browser-origin requests without notice, so the
 * module treats "no price" as an ordinary outcome rather than an error state:
 * several sources are tried in order, the last known price survives a failure,
 * and typing one in by hand always works.
 *
 * `probe` exists because a failing source is otherwise invisible. It runs every
 * source and reports exactly what each one did, so a dead endpoint can be
 * identified from the page instead of from the Network tab.
 */

/** Refetch anything older than this when the app opens. */
export const STALE_MS = 15 * 60 * 1000;

const TIMEOUT_MS = 10_000;

export type QuoteResult = { ok: true; priceCents: number } | { ok: false; error: string };

export type ProviderId = 'stooq-quote' | 'stooq-daily' | 'yahoo-1' | 'yahoo-2';

export type Provider = {
  id: ProviderId;
  label: string;
  /** What this endpoint is, in one line, for the diagnostics table. */
  note: string;
  url: (ticker: string, today: IsoDate) => string;
  parse: (body: string) => QuoteResult;
};

/* ---------- symbol shapes ---------- */

/**
 * Stooq namespaces its symbols by exchange; bare US tickers need `.us`. A
 * ticker the user already qualified (`bp.uk`) is passed through untouched.
 */
export function stooqSymbol(ticker: string): string {
  const clean = ticker.trim().toLowerCase();
  return clean.includes('.') ? clean : `${clean}.us`;
}

/* ---------- parsers ---------- */

/** Cents from a price field. External data, so rounding is right here. */
function toCents(raw: string | number): number | null {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Stooq's one-line quote CSV. An unknown symbol comes back as `N/D` in every
 * column rather than as an HTTP error, so that case is checked explicitly —
 * otherwise it would read as a price of zero.
 */
export function parseStooqCsv(csv: string): QuoteResult {
  const rows = csv.trim().split(/\r?\n/);
  const row = rows[1];
  if (!row) return { ok: false, error: 'no price data returned' };

  const columns = row.split(',');
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = columns[6]?.trim();
  if (!close || close === 'N/D') return { ok: false, error: 'unknown ticker' };

  const priceCents = toCents(close);
  if (priceCents === null) return { ok: false, error: `unreadable price "${close}"` };
  return { ok: true, priceCents };
}

/**
 * Stooq's daily history CSV, oldest first — the last row is the latest close.
 * Header: Date,Open,High,Low,Close,Volume
 */
export function parseStooqDailyCsv(csv: string): QuoteResult {
  const rows = csv.trim().split(/\r?\n/).filter((row) => row.trim() !== '');
  if (rows.length < 2) return { ok: false, error: 'no rows returned' };

  const last = rows[rows.length - 1]!.split(',');
  const close = last[4]?.trim();
  if (!close || close === 'N/D') return { ok: false, error: 'unknown ticker' };

  const priceCents = toCents(close);
  if (priceCents === null) return { ok: false, error: `unreadable price "${close}"` };
  return { ok: true, priceCents };
}

/** Yahoo's chart JSON. The price sits in the metadata, not the series. */
export function parseYahooChart(body: string): QuoteResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: 'response was not JSON' };
  }

  const chart = (parsed as { chart?: { result?: unknown[]; error?: { description?: string } } }).chart;
  if (chart?.error?.description) return { ok: false, error: chart.error.description };

  const meta = (chart?.result?.[0] as { meta?: { regularMarketPrice?: unknown } } | undefined)?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number') return { ok: false, error: 'no regularMarketPrice in response' };

  const priceCents = toCents(price);
  if (priceCents === null) return { ok: false, error: `unreadable price "${price}"` };
  return { ok: true, priceCents };
}

/* ---------- the candidate sources ---------- */

/** Bound the daily request to a short window; the default is decades of rows. */
const DAILY_WINDOW_DAYS = 10;

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'stooq-quote',
    label: 'Stooq · quote',
    note: 'stooq.com/q/l — last quote, CSV',
    url: (ticker) => `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol(ticker))}&f=sd2t2ohlcv&h&e=csv`,
    parse: parseStooqCsv,
  },
  {
    id: 'stooq-daily',
    label: 'Stooq · daily',
    note: 'stooq.com/q/d/l — daily history, CSV',
    url: (ticker, today) =>
      `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol(ticker))}` +
      `&d1=${compactDate(addDays(today, -DAILY_WINDOW_DAYS))}&d2=${compactDate(today)}&i=d`,
    parse: parseStooqDailyCsv,
  },
  {
    id: 'yahoo-1',
    label: 'Yahoo · query1',
    note: 'query1.finance.yahoo.com — chart JSON',
    url: (ticker) =>
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.trim().toUpperCase())}?range=1d&interval=1d`,
    parse: parseYahooChart,
  },
  {
    id: 'yahoo-2',
    label: 'Yahoo · query2',
    note: 'query2.finance.yahoo.com — chart JSON',
    url: (ticker) =>
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.trim().toUpperCase())}?range=1d&interval=1d`,
    parse: parseYahooChart,
  },
];

/* ---------- fetching ---------- */

export type Outcome =
  | { kind: 'ok'; priceCents: number; ms: number }
  /** The server answered and the browser let us read the status. */
  | { kind: 'http'; status: number; ms: number }
  /** 200, but the body wasn't a price we could read. */
  | { kind: 'parse'; detail: string; ms: number }
  /**
   * `fetch` threw. This is CORS refusal *or* a transport failure *or* an error
   * response with no CORS headers — the browser deliberately hides which, so
   * the real status is only visible in the Network tab.
   */
  | { kind: 'blocked'; ms: number };

export function describeOutcome(outcome: Outcome): string {
  switch (outcome.kind) {
    case 'ok':
      return `worked — $${(outcome.priceCents / 100).toFixed(2)}`;
    case 'http':
      return `HTTP ${outcome.status}`;
    case 'parse':
      return `answered, but ${outcome.detail}`;
    case 'blocked':
      return 'blocked — CORS or network';
  }
}

async function fetchFrom(provider: Provider, ticker: string, today: IsoDate): Promise<Outcome> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(provider.url(ticker, today), { signal: controller.signal });
    const ms = Date.now() - started;
    if (!response.ok) return { kind: 'http', status: response.status, ms };
    const parsed = provider.parse(await response.text());
    return parsed.ok
      ? { kind: 'ok', priceCents: parsed.priceCents, ms }
      : { kind: 'parse', detail: parsed.error, ms };
  } catch {
    return { kind: 'blocked', ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The source that last worked in this session, tried first next time. Held in
 * memory rather than in saved state: it is a hint, not user data, and starting
 * over on reload costs one request.
 */
let preferred: ProviderId | null = null;

/** Exposed for tests — the module's only mutable state. */
export function resetPreferred(): void {
  preferred = null;
}

function ordered(): Provider[] {
  if (!preferred) return [...PROVIDERS];
  const first = PROVIDERS.filter((p) => p.id === preferred);
  return [...first, ...PROVIDERS.filter((p) => p.id !== preferred)];
}

export type FetchReport = {
  result: QuoteResult;
  /** The source that supplied the price, when one did. */
  via: Provider | null;
  tried: { provider: Provider; outcome: Outcome }[];
};

/** Try each source in turn and stop at the first that returns a real price. */
export async function fetchQuote(ticker: string, today: IsoDate): Promise<FetchReport> {
  const tried: { provider: Provider; outcome: Outcome }[] = [];

  for (const provider of ordered()) {
    const outcome = await fetchFrom(provider, ticker, today);
    tried.push({ provider, outcome });
    if (outcome.kind === 'ok') {
      preferred = provider.id;
      return { result: { ok: true, priceCents: outcome.priceCents }, via: provider, tried };
    }
  }

  return { result: { ok: false, error: 'no source returned a price' }, via: null, tried };
}

/** Run every source against one ticker, in parallel, and report each result. */
export async function probe(
  ticker: string,
  today: IsoDate,
): Promise<{ provider: Provider; outcome: Outcome }[]> {
  return Promise.all(
    PROVIDERS.map(async (provider) => ({ provider, outcome: await fetchFrom(provider, ticker, today) })),
  );
}

/* ---------- the cache ---------- */

export type RefreshOutcome = {
  quotes: Record<string, Quote>;
  updated: string[];
  failed: { ticker: string; error: string }[];
  skipped: string[];
};

/**
 * Refresh a set of tickers against an existing cache.
 *
 * A `manual` price is the user overriding the feed, so the automatic pass leaves
 * it alone; only an explicit refresh (`force`) replaces it. Fetches that fail
 * leave the previous price in place rather than blanking it.
 */
export async function refreshQuotes(
  tickers: readonly string[],
  existing: Record<string, Quote>,
  today: IsoDate,
  options: { force?: boolean; now?: number } = {},
): Promise<RefreshOutcome> {
  const { force = false, now = Date.now() } = options;
  const quotes = { ...existing };
  const updated: string[] = [];
  const failed: { ticker: string; error: string }[] = [];
  const skipped: string[] = [];

  const wanted = tickers.filter((ticker) => {
    if (force) return true;
    const quote = existing[ticker];
    if (!quote) return true;
    if (quote.source === 'manual') return false;
    return now - Date.parse(quote.asOf) >= STALE_MS;
  });
  for (const ticker of tickers) if (!wanted.includes(ticker)) skipped.push(ticker);

  const results = await Promise.all(
    wanted.map(async (ticker) => ({ ticker, report: await fetchQuote(ticker, today) })),
  );

  for (const { ticker, report } of results) {
    if (report.result.ok) {
      quotes[ticker] = {
        priceCents: report.result.priceCents,
        asOf: new Date(now).toISOString(),
        source: 'fetched',
        via: report.via?.label ?? null,
      };
      updated.push(ticker);
    } else {
      failed.push({ ticker, error: report.result.error });
    }
  }

  return { quotes, updated, failed, skipped };
}
