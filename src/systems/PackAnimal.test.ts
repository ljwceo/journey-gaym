import { describe, expect, it } from 'vitest';
import type { ItemDef, ItemsFile } from '../data/types';
import { readPublicJson } from '../test/loadPublic';
import { carriedWeight, type Equipment } from './Gear';
import { countItem, type ItemStack } from './Inventory';
import { movableToPack, moveFromPack, moveToPack } from './PackAnimal';

const itemsFile = readPublicJson('data/items.json') as ItemsFile;
const items = new Map<string, ItemDef>(itemsFile.items.map((item) => [item.id, item]));

function setup(): { bag: ItemStack[]; pack: ItemStack[]; equipment: Equipment } {
  return {
    bag: [
      { item: 'old_sword', count: 1 },
      { item: 'goblin_cleaver', count: 2 },
      { item: 'health_potion', count: 4 },
    ],
    pack: [],
    equipment: { weapon: 'old_sword' },
  };
}

describe('pack animal (Biscuit)', () => {
  it('moves gear off your load and back', () => {
    const { bag, pack, equipment } = setup();
    expect(moveToPack(bag, pack, equipment, items, 'goblin_cleaver', 1, 60)).toBe('moved');
    expect(countItem(bag, 'goblin_cleaver')).toBe(1);
    expect(countItem(pack, 'goblin_cleaver')).toBe(1);
    expect(carriedWeight(bag, items)).toBe(4 + 8);
    expect(carriedWeight(pack, items)).toBe(8);
    expect(moveFromPack(bag, pack, 'goblin_cleaver', 1)).toBe('moved');
    expect(countItem(bag, 'goblin_cleaver')).toBe(2);
    expect(pack).toEqual([]);
  });

  it('never takes worn gear', () => {
    const { bag, pack, equipment } = setup();
    expect(movableToPack(bag, equipment, 'old_sword')).toBe(0);
    expect(moveToPack(bag, pack, equipment, items, 'old_sword', 1, 60)).toBe('worn');
    expect(countItem(bag, 'old_sword')).toBe(1);
    // A spare of something you wear can go.
    equipment.weapon = 'goblin_cleaver';
    expect(movableToPack(bag, equipment, 'goblin_cleaver')).toBe(1);
    expect(moveToPack(bag, pack, equipment, items, 'goblin_cleaver', 2, 60)).toBe('worn');
    expect(moveToPack(bag, pack, equipment, items, 'goblin_cleaver', 1, 60)).toBe('moved');
  });

  it('refuses more than its maximum weight; weightless things always fit', () => {
    const { bag, pack, equipment } = setup();
    expect(moveToPack(bag, pack, equipment, items, 'goblin_cleaver', 2, 10)).toBe('tooHeavy');
    expect(moveToPack(bag, pack, equipment, items, 'goblin_cleaver', 1, 8)).toBe('moved');
    expect(moveToPack(bag, pack, equipment, items, 'goblin_cleaver', 1, 8)).toBe('tooHeavy');
    expect(moveToPack(bag, pack, equipment, items, 'health_potion', 4, 8)).toBe('moved');
    expect(countItem(bag, 'health_potion')).toBe(0);
  });

  it('moves nothing that is not there', () => {
    const { bag, pack, equipment } = setup();
    expect(moveToPack(bag, pack, equipment, items, 'slime_gel', 1, 60)).toBe('notInBag');
    expect(moveToPack(bag, pack, equipment, items, 'health_potion', 5, 60)).toBe('notInBag');
    expect(moveToPack(bag, pack, equipment, items, 'health_potion', 0, 60)).toBe('notInBag');
    expect(moveFromPack(bag, pack, 'health_potion', 1)).toBe('notInPack');
    expect(countItem(bag, 'health_potion')).toBe(4);
  });
});
