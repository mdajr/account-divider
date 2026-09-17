import { emptyState, type AppState, type Bucket, type Inflow, type Quote } from './types';
import { isValidAmount, isValidUnits } from './money';
import { isIsoDate } from './dates';
import { SLOT_COUNT } from './palette';
import { normalizeTicker } from './state';

const KEY = 'account-divider:v1';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseBucket(raw: unknown, index: number): Bucket | null {
  if (!isRecord(raw)) return null;
  if (!isValidAmount(raw.amount)) return null;
  if (typeof raw.name !== 'string') return null;
  // A malformed date would silently reschedule money, so it invalidates the row.
  if (raw.date != null && !isIsoDate(raw.date)) return null;

  const slot = typeof raw.colorSlot === 'number' && Number.isInteger(raw.colorSlot) ? raw.colorSlot : index;
  const override = typeof raw.colorOverride === 'string' && HEX.test(raw.colorOverride) ? raw.colorOverride : null;

  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : crypto.randomUUID(),
    name: raw.name,
    amount: raw.amount,
    note: typeof raw.note === 'string' ? raw.note : '',
    // v1 data has no date — an existing bucket is an open-ended reserve, which
    // is exactly what the app did before dates existed.
    date: isIsoDate(raw.date) ? raw.date : null,
    colorSlot: ((slot % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT,
    colorOverride: override,
  };
}

function parseInflow(raw: unknown): Inflow | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.name !== 'string') return null;
  if (!isIsoDate(raw.date)) return null;

  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : crypto.randomUUID();

  if (raw.kind === 'rsu') {
    if (typeof raw.ticker !== 'string' || raw.ticker.trim() === '') return null;
    if (!isValidUnits(raw.units)) return null;
    if (
      typeof raw.taxRateBps !== 'number' ||
      !Number.isInteger(raw.taxRateBps) ||
      raw.taxRateBps < 0 ||
      raw.taxRateBps > 10_000
    ) {
      return null;
    }
    return {
      kind: 'rsu',
      id,
      name: raw.name,
      date: raw.date,
      ticker: normalizeTicker(raw.ticker),
      units: raw.units,
      taxRateBps: raw.taxRateBps,
    };
  }

  if (raw.kind === 'cash') {
    if (!isValidAmount(raw.amount)) return null;
    return { kind: 'cash', id, name: raw.name, date: raw.date, amount: raw.amount };
  }

  return null;
}

/**
 * Quotes are a *cache*, not user data. A junk entry is dropped rather than
 * failing the import: the worst case is one refetch, whereas refusing the whole
 * file over a stale price would throw away real buckets.
 */
function parseQuotes(raw: unknown): Record<string, Quote> {
  if (!isRecord(raw)) return {};
  const quotes: Record<string, Quote> = {};
  for (const [ticker, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const { priceCents, asOf, source, via } = value;
    if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents <= 0) continue;
    if (typeof asOf !== 'string' || Number.isNaN(Date.parse(asOf))) continue;
    // `stooq` is the pre-multi-source spelling of `fetched`.
    const tag = source === 'stooq' ? 'fetched' : source;
    if (tag !== 'fetched' && tag !== 'manual') continue;
    quotes[normalizeTicker(ticker)] = {
      priceCents,
      asOf,
      source: tag,
      via: typeof via === 'string' && via !== '' ? via : null,
    };
  }
  return quotes;
}

/**
 * Validate an unknown value (a stale localStorage blob or an imported file)
 * into AppState. Returns null when the shape is unusable, so callers can refuse
 * an import rather than silently wiping good data with junk.
 *
 * A bucket with a fractional or negative amount invalidates the whole payload —
 * dropping it quietly would change the totals without saying so. The same goes
 * for an inflow: a vest that vanished on import would understate future cash.
 *
 * v1 payloads (no dates, no inflows) load unchanged and upgrade in place.
 */
export function parseState(raw: unknown): AppState | null {
  if (!isRecord(raw)) return null;
  if (!isValidAmount(raw.balance)) return null;
  if (!Array.isArray(raw.buckets)) return null;
  if (raw.inflows !== undefined && !Array.isArray(raw.inflows)) return null;

  const buckets: Bucket[] = [];
  for (const [index, entry] of raw.buckets.entries()) {
    const bucket = parseBucket(entry, index);
    if (!bucket) return null;
    buckets.push(bucket);
  }

  const inflows: Inflow[] = [];
  for (const entry of raw.inflows ?? []) {
    const inflow = parseInflow(entry);
    if (!inflow) return null;
    inflows.push(inflow);
  }

  return {
    version: 2,
    balance: raw.balance,
    buckets,
    inflows,
    quotes: parseQuotes(raw.quotes),
    // Absent means an older file, which predates the setting; the relay is the
    // default so a restored backup keeps fetching as it did.
    useRelay: raw.useRelay !== false,
  };
}

/** Never throws: a corrupt or absent key yields a clean empty state. */
export function load(): AppState {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return emptyState();
    return parseState(JSON.parse(stored)) ?? emptyState();
  } catch {
    return emptyState();
  }
}

/** Never throws: private-mode or quota failures must not break the UI. */
export function save(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — the app keeps working in memory */
  }
}
