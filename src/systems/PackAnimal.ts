import type { ItemDef } from '../data/types';
import { carriedWeight, type Equipment, isGear, wornCount } from './Gear';
import { addItem, countItem, type ItemStack, removeItem } from './Inventory';

/**
 * A pack animal (Biscuit): a second bag that carries your extra things. What it carries does
 * not count for your equip load, but you cannot use it either: potions, gear and quest items
 * only work from your own bag, so you take them out first. It has its own maximum weight
 * (npcs.json `pack.maxKg`); weightless things (resources, potions) always fit. Pure logic.
 */

export type ToPackResult = 'moved' | 'notInBag' | 'worn' | 'tooHeavy';
export type FromPackResult = 'moved' | 'notInPack';

/** How many of an item can go onto the animal: what you have minus what you wear. */
export function movableToPack(
  bag: readonly ItemStack[],
  equipment: Equipment,
  item: string,
): number {
  return Math.max(0, countItem(bag, item) - wornCount(equipment, item));
}

/**
 * Moves `count` of an item from your bag onto the animal. Nothing moves when you do not have
 * that many free (worn gear stays on you) or when the animal would carry more than `maxKg`.
 */
export function moveToPack(
  bag: ItemStack[],
  pack: ItemStack[],
  equipment: Equipment,
  items: ReadonlyMap<string, ItemDef>,
  item: string,
  count: number,
  maxKg: number,
): ToPackResult {
  const have = countItem(bag, item);
  if (count <= 0 || have === 0) return 'notInBag';
  if (movableToPack(bag, equipment, item) < count) return have < count ? 'notInBag' : 'worn';
  const def = items.get(item);
  if (isGear(def)) {
    const after = carriedWeight(pack, items) + (def?.weight ?? 0) * count;
    // A little slack for float noise: exactly full still fits.
    if (after > maxKg + 1e-9) return 'tooHeavy';
  }
  removeItem(bag, item, count);
  addItem(pack, item, count);
  return 'moved';
}

/** Takes `count` of an item off the animal into your bag (your load may go up). */
export function moveFromPack(
  bag: ItemStack[],
  pack: ItemStack[],
  item: string,
  count: number,
): FromPackResult {
  if (count <= 0 || countItem(pack, item) < count) return 'notInPack';
  removeItem(pack, item, count);
  addItem(bag, item, count);
  return 'moved';
}
