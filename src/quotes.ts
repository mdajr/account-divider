import type { Quote } from './types';

/**
 * Share prices come from stooq.com's CSV endpoint: no API key, no account, and
 * permissive CORS, which is the whole requirement for a static site with no
 * backend of its own. Prices are end-of-day or ~15 minutes delayed — fine for
 * "roughly what will this vest be worth", not a trading screen.
 *
 * Every path here degrades to manual entry rather than failing the app: if the
 * fetch is blocked, the ticker is unknown, or the user is offline, the last
 * cached price stands and they can type one in.
 */

const ENDPOINT = 'https://stooq.com/q/l/';

/** Refetch anything older than this when the app opens. */
export const STALE_MS = 15 * 60 * 1000;

const TIMEOUT_MS = 10_000;

export type QuoteResult = { ok: true; priceCents: number } | { ok: false; error: string };

/**
 * Stooq namespaces its symbols by exchange; bare US tickers need `.us`. A
 * ticker the user already qualified (`bp.uk`) is passed through untouched.
 */
export function stooqSymbol(ticker: string): string {
  const clean = ticker.trim().toLowerCase();
  return clean.includes('.') ? clean : `${clean}.us`;
}

/** Cents from a CSV price field. External data, so rounding is right here. */
function toCents(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Pull the close out of stooq's two-line CSV. An unknown symbol comes back as
 * `N/D` in every column rather than as an HTTP error, so that case is checked
 * explicitly — otherwise it would read as a price of zero.
 */
export function parseStooqCsv(csv: string): QuoteResult {
  const rows = csv.trim().split(/\r?\n/);
  const row = rows[1];
  if (!row) return { ok: false, error: 'No price data returned' };

  const columns = row.split(',');
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = columns[6]?.trim();
  if (!close || close === 'N/D') return { ok: false, error: 'Unknown ticker' };

  const priceCents = toCents(close);
  if (priceCents === null) return { ok: false, error: `Unreadable price "${close}"` };
  return { ok: true, priceCents };
}

export async function fetchQuote(ticker: string): Promise<QuoteResult> {
  const url = `${ENDPOINT}?s=${encodeURIComponent(stooqSymbol(ticker))}&f=sd2t2ohlcv&h&e=csv`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ok: false, error: `Price service returned ${response.status}` };
    return parseStooqCsv(await response.text());
  } catch {
    // Offline, blocked by an extension, or CORS-refused — all look the same here.
    return { ok: false, error: "Couldn't reach the price service" };
  } finally {
    clearTimeout(timer);
  }
}

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
    wanted.map(async (ticker) => ({ ticker, result: await fetchQuote(ticker) })),
  );

  for (const { ticker, result } of results) {
    if (result.ok) {
      quotes[ticker] = {
        priceCents: result.priceCents,
        asOf: new Date(now).toISOString(),
        source: 'stooq',
      };
      updated.push(ticker);
    } else {
      failed.push({ ticker, error: result.error });
    }
  }

  return { quotes, updated, failed, skipped };
}
