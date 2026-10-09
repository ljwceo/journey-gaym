import { describe, expect, it } from 'vitest';
import { createEventBus } from '../core/events';
import { triggersFileSchema } from '../data/schemas';
import type { Condition, TriggerDef } from '../data/types';
import { readPublicJson } from '../test/loadPublic';
import { Checkpoints } from './Checkpoints';
import { evaluateCondition } from './Conditions';
import { Triggers } from './Triggers';

const noQuests = { level: 1, completedQuests: new Set<string>() };

describe('evaluateCondition', () => {
  it('handles levels, quests and combinations', () => {
    const leaveCity: Condition = {
      type: 'all',
      of: [
        { type: 'questCompleted', quest: 'defeat_sultan' },
        { type: 'level', min: 5 },
      ],
    };
    expect(evaluateCondition(leaveCity, noQuests)).toBe(false);
    expect(
      evaluateCondition(leaveCity, { level: 5, completedQuests: new Set(['defeat_sultan']) }),
    ).toBe(true);
    expect(
      evaluateCondition(leaveCity, { level: 4, completedQuests: new Set(['defeat_sultan']) }),
    ).toBe(false);
    expect(
      evaluateCondition({ type: 'any', of: [{ type: 'never' }, { type: 'always' }] }, noQuests),
    ).toBe(true);
  });

  it('keeps the city gate open in phase 1 (canLeaveCity is always true)', () => {
    const file = triggersFileSchema.parse(readPublicJson('data/triggers.json'));
    const condition = file.conditions.canLeaveCity;
    expect(condition && evaluateCondition(condition, noQuests)).toBe(true);
  });
});

const place: TriggerDef = {
  id: 'forge',
  zone: 'greyhaven',
  kind: 'place',
  shape: { type: 'circle', x: 0, z: 0, radius: 5 },
  firstVisitText: 'place.forge',
};
const gate: TriggerDef = {
  id: 'city_gate',
  zone: 'greyhaven',
  kind: 'gate',
  shape: { type: 'rect', minX: 20, minZ: -5, maxX: 25, maxZ: 5 },
  condition: 'canLeaveCity',
  blockedText: 'place.city_gate_blocked',
};

function setup(condition: Condition) {
  const events = createEventBus();
  const entered: string[] = [];
  const firsts: string[] = [];
  events.on('triggerEntered', ({ triggerId }) => entered.push(triggerId));
  events.on('placeFirstVisited', ({ triggerId }) => firsts.push(triggerId));
  const triggers = new Triggers([place, gate], { canLeaveCity: condition }, events);
  return { triggers, entered, firsts };
}

describe('Triggers', () => {
  it('fires on entering, and the first visit only once (remembered in the save)', () => {
    const { triggers, entered, firsts } = setup({ type: 'always' });
    const visited: string[] = [];
    triggers.update(-10, 0, visited);
    expect(entered).toEqual([]);
    triggers.update(0, 0, visited);
    triggers.update(1, 0, visited); // still inside: nothing new
    expect(entered).toEqual(['forge']);
    expect(firsts).toEqual(['forge']);
    expect(visited).toEqual(['forge']);
    triggers.update(-10, 0, visited);
    triggers.update(0, 0, visited);
    expect(entered).toEqual(['forge', 'forge']);
    expect(firsts).toEqual(['forge']);
  });

  it('does not repeat a first visit stored in an older save', () => {
    const { triggers, firsts } = setup({ type: 'always' });
    triggers.update(0, 0, ['forge']);
    expect(firsts).toEqual([]);
  });

  it('a closed gate blocks, an open one does not', () => {
    expect(setup({ type: 'never' }).triggers.blockingGate(22, 0, noQuests)?.id).toBe('city_gate');
    expect(setup({ type: 'never' }).triggers.blockingGate(10, 0, noQuests)).toBeNull();
    expect(setup({ type: 'always' }).triggers.blockingGate(22, 0, noQuests)).toBeNull();
  });
});

describe('Checkpoints', () => {
  it('walking past a checkpoint makes it yours (once) and lets you rest there', () => {
    const events = createEventBus();
    const set: string[] = [];
    events.on('checkpointSet', ({ checkpointId }) => set.push(checkpointId));
    const checkpoints = new Checkpoints(
      [
        { id: 'monastery', kind: 'monastery', zoneId: 'a', x: 0, z: 0, radius: 8 },
        { id: 'shrine', kind: 'elven_shrine', zoneId: 'b', x: 100, z: 0, radius: 8 },
      ],
      events,
    );
    const world = { checkpoint: 'monastery' as string | null };
    checkpoints.update(3, 3, world);
    expect(set).toEqual([]);
    expect(checkpoints.near?.id).toBe('monastery');
    checkpoints.update(50, 0, world);
    expect(checkpoints.near).toBeNull();
    checkpoints.update(97, 2, world);
    checkpoints.update(98, 2, world);
    expect(set).toEqual(['shrine']);
    expect(world.checkpoint).toBe('shrine');
  });
});
