import { describe, expect, it } from 'vitest';
import { hexToNumber, palette, uiColors } from './palette';

describe('hexToNumber', () => {
  it('converts hex strings to numbers', () => {
    expect(hexToNumber('#1B1A2B')).toBe(0x1b1a2b);
    expect(hexToNumber('#e39b3e')).toBe(0xe39b3e);
  });

  it('rejects invalid colors', () => {
    expect(() => hexToNumber('1B1A2B')).toThrow();
    expect(() => hexToNumber('#FFF')).toThrow();
  });
});

describe('palette', () => {
  it('exposes the style guide colors', () => {
    expect(palette.nachtinkt).toBe(0x1b1a2b);
    expect(palette.lantaarnamber).toBe(0xe39b3e);
    expect(uiColors.bg).toBe(0x14131d);
  });

  it('never contains pure black (style rule K1)', () => {
    for (const color of [...Object.values(palette), ...Object.values(uiColors)]) {
      expect(color).not.toBe(0x000000);
    }
  });
});
