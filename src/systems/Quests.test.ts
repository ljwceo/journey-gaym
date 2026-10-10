import { describe, expect, it } from 'vitest';
import {
  itemsFileSchema,
  monstersFileSchema,
  playerFileSchema,
  questsFileSchema,
} from '../data/schemas';
import type { PlayerConfig, QuestDef } from '../data/types';
import type { SaveQuests } from '../save/SaveData';
import { readPublicJson } from '../test/loadPublic';
import { addItem, countItem, type ItemStack } from './Inventory';
import { addXp, type LevelState } from './Progression';
import { QuestBook } from './Quests';

const quests = questsFileSchema.parse(readPublicJson('data/quests.json')).quests;
const player = playerFileSchema.parse(readPublicJson('data/player.json')) as PlayerConfig;
const monsters = monstersFileSchema.parse(readPublicJson('data/monsters.json')).monsters;
const items = itemsFileSchema.parse(readPublicJson('data/items.json')).items;

function freshSave(): SaveQuests {
  return { active: [], completed: [] };
}

/** A small hand-made quest list, independent of the game data. */
const sample: QuestDef[] = [
  {
    id: 'slay',
    name: 'Slay',
    kind: 'side',
    giver: 'guard',
    description: 'quest.slay.desc',
    objectives: [
      { type: 'kill', monster: 'goblin', count: 2 },
      { type: 'deliver', item: 'slime_gel', count: 3, npc: 'guard' },
    ],
    requires: { level: 2 },
    rewards: { xp: 10, gold: 0, items: [] },
  },
  {
    id: 'after',
    name: 'After',
    kind: 'side',
    giver: 'guard',
    description: 'quest.after.desc',
    objectives: [{ type: 'buy', item: 'health_potion', count: 1, npc: 'marco' }],
    requires: { quests: ['slay'] },
    rewards: { xp: 0, gold: 0, items: [] },
  },
];

describe('QuestBook', () => {
  it('locks a quest until its level and earlier quests are reached', () => {
    const book = new QuestBook(sample, freshSave());
    expect(book.status('slay', 1, [])).toBe('locked');
    expect(book.status('slay', 2, [])).toBe('available');
    expect(book.status('after', 9, [])).toBe('locked');
    expect(book.status('nope', 9, [])).toBe('locked');
  });

  it('counts kills only after the quest started, and never past what is needed', () => {
    const book = new QuestBook(sample, freshSave());
    const out: QuestDef[] = [];
    expect(book.record('kill', 'goblin', 1, out)).toHaveLength(0);
    book.accept('slay');
    expect(book.record('kill', 'slime', 1, out)).toHaveLength(0);
    expect(book.record('kill', 'goblin', 5, out).map((q) => q.id)).toEqual(['slay']);
    const p = book.progress(book.get('slay') as QuestDef, 0, [], { have: 0, need: 0 });
    expect(p).toEqual({ have: 2, need: 2 });
    // Already complete: nothing changes any more.
    expect(book.record('kill', 'goblin', 1, out)).toHaveLength(0);
  });

  it('shows "2/3" for items in the bag and takes them when handing in', () => {
    const save = freshSave();
    const book = new QuestBook(sample, save);
    const bag: ItemStack[] = [];
    book.accept('slay');
    book.record('kill', 'goblin', 2, []);
    addItem(bag, 'slime_gel', 2);
    const def = book.get('slay') as QuestDef;
    expect(book.progress(def, 1, bag, { have: 0, need: 0 })).toEqual({ have: 2, need: 3 });
    expect(book.status('slay', 2, bag)).toBe('active');
    expect(book.complete('slay', bag)).toBe(false);
    addItem(bag, 'slime_gel', 2);
    expect(book.status('slay', 2, bag)).toBe('ready');
    expect(book.complete('slay', bag)).toBe(true);
    expect(countItem(bag, 'slime_gel')).toBe(1);
    expect(book.status('slay', 2, bag)).toBe('done');
    expect(save).toEqual({ active: [], completed: ['slay'] });
    expect(book.completed.has('slay')).toBe(true);
    // Done once: it cannot start again.
    expect(book.accept('slay')).toBe(false);
  });

  it('counts a purchase only in the right shop', () => {
    const book = new QuestBook(sample, { active: [], completed: ['slay'] });
    book.accept('after');
    expect(book.record('buy', 'health_potion', 1, [], 'hilda')).toHaveLength(0);
    expect(book.record('buy', 'health_potion', 1, [], 'marco')).toHaveLength(1);
    expect(book.status('after', 1, [])).toBe('ready');
  });

  it('lets an NPC hand in first, then offer, then talk about a running quest', () => {
    const book = new QuestBook(sample, freshSave());
    expect(book.forNpc('guard', 1, [])).toBeNull();
    expect(book.forNpc('guard', 2, [])).toMatchObject({ status: 'available' });
    book.accept('slay');
    expect(book.forNpc('guard', 2, [])).toMatchObject({ status: 'active' });
    book.record('kill', 'goblin', 2, []);
    const bag = [{ item: 'slime_gel', count: 3 }];
    expect(book.forNpc('guard', 2, bag)).toMatchObject({ status: 'ready' });
  });

  it('survives data changes: unknown quests are dropped, objective counters resized', () => {
    const save: SaveQuests = {
      active: [
        { id: 'gone', counts: [1] },
        { id: 'slay', counts: [2] },
      ],
      completed: [],
    };
    const book = new QuestBook(sample, save);
    expect(save.active).toEqual([{ id: 'slay', counts: [2, 0] }]);
    expect(book.activeDefs().map((q) => q.id)).toEqual(['slay']);
  });
});

describe('the first day in Greyhaven (quests.json)', () => {
  const firstDay = quests.filter((q) => q.giver && q.requires.quests === undefined);

  it('has a small quest for each basic NPC', () => {
    expect(firstDay.map((q) => q.giver).sort()).toEqual(
      ['bertha', 'brother_ansel', 'hilda', 'marco', 'rose'].sort(),
    );
  });

  it('can all be played at level 1, in any order', () => {
    const book = new QuestBook(quests, freshSave());
    for (const q of firstDay) expect(book.status(q.id, 1, [])).toBe('available');
  });

  it('brings you to about level 3, with the slimes for Hilda', () => {
    const state: LevelState = { level: 1, xp: 0 };
    const questXp = firstDay.reduce((sum, q) => sum + q.rewards.xp, 0);
    // Three Green Slimes give the Slime Gel most of the time (50 % each, so often a few more).
    const slime = monsters.find((m) => m.id === 'green_slime');
    addXp(player, state, questXp + 3 * (slime?.xp ?? 0));
    expect(state.level).toBe(3);
  });

  it('Sultan waits until all of the first day is done', () => {
    const sultan = quests.find((q) => q.id === 'defeat_sultan');
    expect(sultan?.requires.quests?.sort()).toEqual(firstDay.map((q) => q.id).sort());
  });

  it("Hilda's quest really upgrades the sword (more damage)", () => {
    const hilda = quests.find((q) => q.giver === 'hilda');
    const upgrade = hilda?.rewards.upgrades?.[0];
    const from = items.find((i) => i.id === upgrade?.from);
    const to = items.find((i) => i.id === upgrade?.to);
    expect(to?.weapon?.damageBonus ?? 0).toBeGreaterThan(from?.weapon?.damageBonus ?? 0);
  });

  it("Old Bertha's tale is done as soon as you listened (talk to the giver)", () => {
    const save = freshSave();
    const book = new QuestBook(quests, save);
    const tale = firstDay.find((q) => q.giver === 'bertha') as QuestDef;
    book.accept(tale.id);
    book.record('talk', 'bertha', 1, []);
    expect(book.status(tale.id, 1, [])).toBe('ready');
  });
});
