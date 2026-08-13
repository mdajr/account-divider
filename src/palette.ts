/**
 * Categorical palette — the eight-slot fixed order from the dataviz reference,
 * with dark steps selected for the dark surface (not a flipped light palette).
 *
 * Validated with the skill's validate_palette.js against the exact surfaces this
 * app renders on (light #fcfcfb, dark #1a1a19):
 *   light — all checks pass; contrast WARN on aqua/yellow/magenta (<3:1), which
 *           the relief rule covers via the always-visible bucket table.
 *   dark  — all checks pass, all eight >= 3:1.
 *
 * The ORDER is the colorblind-safety mechanism, not cosmetics. Don't reorder
 * these without re-running the validator.
 */

export type ColorMode = 'light' | 'dark';

export const PALETTE: Record<ColorMode, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

export const SLOT_COUNT = PALETTE.light.length;

/** Neutral gray for the Unallocated remainder — deliberately not a categorical
 *  slot, so it reads as "nothing here yet" rather than as another bucket. */
export const UNALLOCATED_COLOR: Record<ColorMode, string> = {
  light: '#c3c2b7',
  dark: '#383835',
};

export function slotColor(slot: number, mode: ColorMode): string {
  const ramp = PALETTE[mode];
  return ramp[((slot % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT]!;
}

/**
 * Lowest palette slot not already taken, so early buckets get distinct colors
 * and a deleted bucket's color becomes available again. Past eight buckets the
 * slots cycle; identity is carried by the table's swatch+name rows and the
 * inline labels, and every color is user-overridable.
 */
export function nextFreeSlot(used: readonly number[]): number {
  const taken = new Set(used.map((s) => ((s % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT));
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    if (!taken.has(slot)) return slot;
  }
  return used.length % SLOT_COUNT;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const r = srgbToLinear(parseInt(full.slice(0, 2), 16));
  const g = srgbToLinear(parseInt(full.slice(2, 4), 16));
  const b = srgbToLinear(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const LIGHT_INK = '#ffffff';
const DARK_INK = '#0b0b0b';

function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for a label sitting INSIDE a colored fill — the one place text may not
 * wear a text token, because it must clear contrast against the fill itself.
 * Picks whichever of the two inks actually measures higher contrast rather than
 * guessing from a lightness threshold, which gets mid-tones (yellow, aqua)
 * wrong in exactly the cases that matter.
 */
export function inkOn(fill: string): string {
  const fillLuminance = relativeLuminance(fill);
  const onLight = contrast(fillLuminance, relativeLuminance(LIGHT_INK));
  const onDark = contrast(fillLuminance, relativeLuminance(DARK_INK));
  return onDark > onLight ? DARK_INK : LIGHT_INK;
}
