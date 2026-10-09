import { Mesh, MeshLambertMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { validateGameData } from '../data/DataValidator';
import { hexToNumber } from '../render/palette';
import { readAllData } from '../test/loadPublic';
import { CharacterModel, hasPlaceholderModel } from './PlaceholderFactory';

const { data } = validateGameData(readAllData());
if (!data) throw new Error('data invalid');
const appearance = data.appearance;

describe('PlaceholderFactory', () => {
  it('has a placeholder for every model named in appearance.json', () => {
    const keys = [...appearance.bodyTypes, ...appearance.hairstyles].map((entry) => entry.model);
    for (const key of keys) expect(hasPlaceholderModel(key), key).toBe(true);
  });

  it('builds every body type and hairstyle and recolors live', () => {
    const model = new CharacterModel(appearance);
    for (const style of appearance.hairstyles) {
      model.setAppearance({
        ...appearance.defaults,
        bodyType: style.bodyType,
        hairstyle: style.id,
      });
    }
    const hair = appearance.hairColors[0];
    if (!hair) throw new Error('no hair colors');
    model.setAppearance({ ...appearance.defaults, hairColor: hair.id });
    const colors = new Set<number>();
    model.root.traverse((child) => {
      if (child instanceof Mesh) colors.add((child.material as MeshLambertMaterial).color.getHex());
    });
    expect(colors.has(hexToNumber(hair.hex))).toBe(true);
    // Exactly one body and one hairstyle attached: head, mantle, sword, body, hair.
    expect(model.root.children).toHaveLength(5);
    model.dispose();
    expect(model.root.children).toHaveLength(0);
  });
});
