import tokens from '../../docs/art-style/tokens.json';

/** Converts a CSS hex color ("#1B1A2B") to a number Three.js accepts (0x1b1a2b). */
export function hexToNumber(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return parseInt(match[1], 16);
}

type PaletteKey = keyof typeof tokens.palet;
type UiKey = keyof typeof tokens.ui;

/** Palette colors from the art style guide (docs/art-style/tokens.json), as numbers. */
export const palette = Object.fromEntries(
  Object.entries(tokens.palet).map(([key, value]) => [key, hexToNumber(value.hex)]),
) as Record<PaletteKey, number>;

/** UI role colors from the art style guide, as numbers. */
export const uiColors = Object.fromEntries(
  Object.entries(tokens.ui).map(([key, value]) => [key, hexToNumber(value)]),
) as Record<UiKey, number>;
