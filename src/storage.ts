import { emptyState, type AppState, type Bucket } from './types';
import { isValidAmount } from './money';
import { SLOT_COUNT } from './palette';

const KEY = 'account-divider:v1';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseBucket(raw: unknown, index: number): Bucket | null {
  if (!isRecord(raw)) return null;
  if (!isValidAmount(raw.amount)) return null;
  if (typeof raw.name !== 'string') return null;

  const slot = typeof raw.colorSlot === 'number' && Number.isInteger(raw.colorSlot) ? raw.colorSlot : index;
  const override = typeof raw.colorOverride === 'string' && HEX.test(raw.colorOverride) ? raw.colorOverride : null;

  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : crypto.randomUUID(),
    name: raw.name,
    amount: raw.amount,
    note: typeof raw.note === 'string' ? raw.note : '',
    colorSlot: ((slot % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT,
    colorOverride: override,
  };
}

/**
 * Validate an unknown value (a stale localStorage blob or an imported file)
 * into AppState. Returns null when the shape is unusable, so callers can refuse
 * an import rather than silently wiping good data with junk.
 *
 * A bucket with a fractional or negative amount invalidates the whole payload —
 * dropping it quietly would change the totals without saying so.
 */
export function parseState(raw: unknown): AppState | null {
  if (!isRecord(raw)) return null;
  if (!isValidAmount(raw.balance)) return null;
  if (!Array.isArray(raw.buckets)) return null;

  const buckets: Bucket[] = [];
  for (const [index, entry] of raw.buckets.entries()) {
    const bucket = parseBucket(entry, index);
    if (!bucket) return null;
    buckets.push(bucket);
  }

  return { version: 1, balance: raw.balance, buckets };
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
