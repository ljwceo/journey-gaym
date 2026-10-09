import { describe, expect, it } from 'vitest';
import { flattenStrings } from '../i18n/I18n';
import { colorTokens } from '../render/palette';
import { readAllData, readPublicJson } from '../test/loadPublic';
import { formatIssue, validateGameData } from './DataValidator';
import type { DataFileName } from './schemas';

const textKeys = new Set(flattenStrings(readPublicJson('lang/en.json')).keys());
const options = { textKeys, colorTokens };

/** Fresh deep copy of the real data, as loose JSON so tests can break it on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function freshData(): Record<DataFileName, any> {
  return structuredClone(readAllData());
}

function messages(raw: Record<DataFileName, unknown>): string[] {
  return validateGameData(raw, options).issues.map(formatIssue);
}

describe('validateGameData on the real data in public/data', () => {
  it('finds no problems', () => {
    const { data, issues } = validateGameData(readAllData(), options);
    expect(issues.map(formatIssue)).toEqual([]);
    expect(data).not.toBeNull();
  });

  it('contains the player numbers from the concept', () => {
    const { data } = validateGameData(readAllData(), options);
    expect(data?.player.base).toEqual({ hp: 100, mana: 50, energy: 100 });
    expect(data?.player.perLevel).toEqual({ hp: 10, mana: 5 });
    expect(data?.player.xpToNextLevel).toEqual([100, 150, 220, 300, 400, 520, 660]);
    expect(data?.player.movement.walkSpeed).toBe(4);
    expect(data?.player.dash.energyCost).toBe(25);
    expect(data?.player.dash.cooldownSeconds).toBe(1);
    expect(data?.player.regen.energyPerSecond).toBe(20);
  });

  it('has the appearance option counts from the concept', () => {
    const { data } = validateGameData(readAllData(), options);
    const a = data?.appearance;
    expect(a?.bodyTypes).toHaveLength(2);
    for (const body of a?.bodyTypes ?? []) {
      expect(a?.hairstyles.filter((style) => style.bodyType === body.id)).toHaveLength(5);
    }
    expect(a?.hairColors).toHaveLength(19);
    expect(a?.skinTones).toHaveLength(6);
    expect(a?.mantleColors).toHaveLength(6);
    expect(a?.name.maxLength).toBe(16);
  });

  it('never uses pure black as a hair or skin color (style rule K1)', () => {
    const { data } = validateGameData(readAllData(), options);
    const hexes = [...(data?.appearance.hairColors ?? []), ...(data?.appearance.skinTones ?? [])];
    for (const entry of hexes) expect(entry.hex.toUpperCase()).not.toBe('#000000');
  });
});

describe('validateGameData catches broken data', () => {
  it('reports structural problems with file and path', () => {
    const raw = freshData();
    delete raw.npcs.npcs[0].zone;
    raw.player.movement.walkSpeed = -4;
    const found = messages(raw);
    expect(found.some((m) => m.startsWith('npcs.json → npcs[0].zone'))).toBe(true);
    expect(found.some((m) => m.startsWith('player.json → movement.walkSpeed'))).toBe(true);
  });

  it('rejects unknown (misspelled) fields', () => {
    const raw = freshData();
    raw.npcs.npcs[0].dialouge = [];
    expect(messages(raw).some((m) => m.includes('dialouge'))).toBe(true);
  });

  it('reports duplicate ids', () => {
    const raw = freshData();
    raw.items.items.push({ ...raw.items.items[0] });
    expect(messages(raw).some((m) => m.includes('duplicate id "gold"'))).toBe(true);
  });

  it('reports references to things that do not exist', () => {
    const raw = freshData();
    raw.npcs.npcs[0].role = 'dragon_tamer';
    raw.quests.quests[2].rewards.items[0].item = 'golden_spoon';
    raw.monsters.monsters.find((m: { drops: unknown[] }) => m.drops.length > 0).drops[0].item =
      'nothing';
    raw.zones.zones[1].scatter[0].prop = 'palm_tree';
    raw.zones.zones[0].spawns[0].monster = 'dragon';
    const found = messages(raw);
    expect(found).toContainEqual(expect.stringContaining('unknown monster "dragon"'));
    expect(found).toContainEqual(expect.stringContaining('unknown prop "palm_tree"'));
    expect(found).toContainEqual(expect.stringContaining('unknown role "dragon_tamer"'));
    expect(found).toContainEqual(expect.stringContaining('unknown item "golden_spoon"'));
    expect(found).toContainEqual(expect.stringContaining('unknown item "nothing"'));
  });

  it('reports NPCs placed outside their zone', () => {
    const raw = freshData();
    raw.npcs.npcs[0].position = { x: 1900, z: 0 };
    expect(messages(raw)).toContainEqual(expect.stringContaining('position lies outside zone'));
  });

  it('reports neighbors that are not mutual', () => {
    const raw = freshData();
    raw.zones.zones[1].neighbors = raw.zones.zones[1].neighbors.filter(
      (neighbor: string) => neighbor !== raw.zones.zones[0].id,
    );
    expect(messages(raw)).toContainEqual(expect.stringContaining('as a neighbor'));
  });

  it('reports missing text keys and unknown colors', () => {
    const raw = freshData();
    raw.npcs.npcs[0].dialogue = ['npc.nobody.1'];
    raw.zones.zones[0].terrainColor = 'neongroen';
    const found = messages(raw);
    expect(found).toContainEqual(expect.stringContaining('"npc.nobody.1" is missing in en.json'));
    expect(found).toContainEqual(expect.stringContaining('unknown color token "neongroen"'));
  });

  it('reports a graphics preset whose active ring is smaller than the collision ring', () => {
    const raw = freshData();
    raw.zones.world.terrain.collisionRing = 2;
    raw.quality.presets[0].chunkRings = { active: 1, preload: 3, unload: 4 };
    expect(messages(raw)).toContainEqual(expect.stringContaining('collision ring'));
  });

  it('reports chunk rings without hysteresis', () => {
    const raw = freshData();
    raw.quality.presets[0].chunkRings = { active: 2, preload: 3, unload: 3 };
    expect(messages(raw)).toContainEqual(expect.stringContaining('hysteresis'));
  });

  it('reports combos with the same element twice', () => {
    const raw = freshData();
    raw.combos.combos[0].elements = ['fire', 'fire'];
    expect(messages(raw)).toContainEqual(expect.stringContaining('same element twice'));
  });

  it('reports conditions that name an unknown quest', () => {
    const raw = freshData();
    raw.triggers.conditions.canLeaveCity = { type: 'questCompleted', quest: 'slay_moon' };
    expect(messages(raw)).toContainEqual(expect.stringContaining('unknown quest "slay_moon"'));
  });
});
