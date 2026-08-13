export type Bucket = {
  id: string;
  name: string;
  /** Whole dollars. Always a non-negative integer — never fractional. */
  amount: number;
  note: string;
  /** 0-7 index into the categorical palette. Assigned at creation and never
   *  recomputed, so reordering or deleting never repaints the survivors. */
  colorSlot: number;
  /** Hex from the color picker; null means "use the palette slot". */
  colorOverride: string | null;
};

export type AppState = {
  version: 1;
  /** Whole dollars, non-negative integer. */
  balance: number;
  buckets: Bucket[];
};

export const emptyState = (): AppState => ({
  version: 1,
  balance: 0,
  buckets: [],
});
