import { describe, expect, it } from 'vitest';
import {
  colorTokens,
  hexToNumber,
  lightColors,
  palette,
  resolveColorToken,
  terrainColors,
  uiColors,
} from './palette';

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

describe('color tokens', () => {
  it('resolves palette and terrain names', () => {
    expect(resolveColorToken('schemerviolet')).toBe(palette.schemerviolet);
    expect(resolveColorToken('mosgroen')).toBe(terrainColors.mosgroen);
    expect(() => resolveColorToken('neon')).toThrow();
  });

  it('keeps palette, terrain and light names unique', () => {
    expect(colorTokens.size).toBe(
      Object.keys(palette).length +
        Object.keys(terrainColors).length +
        Object.keys(lightColors).length,
    );
  });

  it('never contains pure black or pure white light colors (night is never pitch black)', () => {
    for (const color of Object.values(lightColors)) {
      expect(color).not.toBe(0x000000);
      expect(color).not.toBe(0xffffff);
    }
  });

  it('never contains pure black or pure white terrain', () => {
    for (const color of Object.values(terrainColors)) {
      expect(color).not.toBe(0x000000);
      expect(color).not.toBe(0xffffff);
    }
  });
});
