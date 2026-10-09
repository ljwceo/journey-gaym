import tokens from '../../docs/art-style/tokens.json';

/** Converts a CSS hex color ("#1B1A2B") to a number Three.js accepts (0x1b1a2b). */
export function hexToNumber(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return parseInt(match[1], 16);
}

/** Converts a color number (0x1b1a2b) back to CSS hex ("#1b1a2b"), e.g. for HTML swatches. */
export function numberToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
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

type TerrainKey = keyof typeof tokens.terrein;

/** Muted terrain colors for zone placeholders, as numbers. */
export const terrainColors = Object.fromEntries(
  Object.entries(tokens.terrein).map(([key, value]) => [key, hexToNumber(value.hex)]),
) as Record<TerrainKey, number>;

/**
 * Every color name data files may use (`"terrainColor": "mosgroen"`), mapped to its number.
 * Palette and terrain tokens share one namespace; names must stay unique across both groups.
 */
export const colorTokens: ReadonlyMap<string, number> = new Map([
  ...Object.entries(palette),
  ...Object.entries(terrainColors),
]);

/** Resolves a color token name from data to a number, or throws for unknown names. */
export function resolveColorToken(name: string): number {
  const color = colorTokens.get(name);
  if (color === undefined) throw new Error(`Unknown color token: ${name}`);
  return color;
}
