import { describe, expect, it } from 'vitest';
import { inkOn, PALETTE, relativeLuminance, slotColor, SLOT_COUNT } from './palette';

/** WCAG contrast ratio between two luminances. */
const ratio = (a: number, b: number) => {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

describe('inkOn', () => {
  it('picks dark ink on light-ish fills', () => {
    // Yellow is the case a naive lightness threshold gets wrong.
    expect(inkOn('#eda100')).toBe('#0b0b0b');
    expect(inkOn('#ffffff')).toBe('#0b0b0b');
  });

  it('picks light ink on dark fills', () => {
    expect(inkOn('#4a3aa7')).toBe('#ffffff');
    expect(inkOn('#000000')).toBe('#ffffff');
  });

  it('always picks the higher-contrast of the two inks', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const fill of PALETTE[mode]) {
        const fillL = relativeLuminance(fill);
        const chosen = ratio(fillL, relativeLuminance(inkOn(fill)));
        const rejected = ratio(fillL, relativeLuminance(inkOn(fill) === '#ffffff' ? '#0b0b0b' : '#ffffff'));
        expect(chosen, `${fill} (${mode})`).toBeGreaterThanOrEqual(rejected);
      }
    }
  });

  /* The fills are fixed by the validated palette, so 4.4 is the best any ink can
     do — white on slot-1 blue measures 4.46. The inline label is supplementary
     anyway; the table carries the authoritative value. */
  it('clears 4.4:1 on every palette slot in both modes', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const fill of PALETTE[mode]) {
        const contrast = ratio(relativeLuminance(fill), relativeLuminance(inkOn(fill)));
        expect(contrast, `${fill} (${mode})`).toBeGreaterThanOrEqual(4.4);
      }
    }
  });
});

describe('slotColor', () => {
  it('cycles past the eighth slot instead of returning undefined', () => {
    expect(slotColor(SLOT_COUNT, 'light')).toBe(PALETTE.light[0]);
    expect(slotColor(SLOT_COUNT + 2, 'dark')).toBe(PALETTE.dark[2]);
  });

  it('handles a negative slot defensively', () => {
    expect(slotColor(-1, 'light')).toBe(PALETTE.light[SLOT_COUNT - 1]);
  });
});
