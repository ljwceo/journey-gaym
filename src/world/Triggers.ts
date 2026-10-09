import type { GameEventBus } from '../core/events';
import type { Condition, TriggerDef } from '../data/types';
import { type ConditionContext, evaluateCondition } from './Conditions';
import { pointInShape } from './Shapes';

/**
 * Trigger areas on the ground (triggers.json). Walking into one emits `triggerEntered`; the
 * first visit of a place also emits `placeFirstVisited` and is remembered in the save
 * (`visitedPlaces`), so its explanation shows only once. Quests can listen to the same events
 * later without changing this code.
 *
 * A gate (the city gate) is a trigger with a condition: while the condition is false it blocks
 * like a wall and says why. Checked on the fixed step; allocation-free while nothing happens.
 */
export class Triggers {
  private readonly inside: Uint8Array;

  constructor(
    readonly defs: readonly TriggerDef[],
    private readonly conditions: Readonly<Record<string, Condition>>,
    private readonly events: GameEventBus,
  ) {
    this.inside = new Uint8Array(defs.length);
  }

  /**
   * Call after the player moved. `visited` is the save's list of visited places (updated in
   * place when a place is visited for the first time).
   */
  update(x: number, z: number, visited: string[]): void {
    for (let i = 0; i < this.defs.length; i++) {
      const def = this.defs[i] as TriggerDef;
      const now = pointInShape(def.shape, x, z) ? 1 : 0;
      if (now === this.inside[i]) continue;
      this.inside[i] = now;
      if (!now) continue;
      this.events.emit('triggerEntered', { triggerId: def.id });
      if (def.kind === 'place' && !visited.includes(def.id)) {
        visited.push(def.id);
        this.events.emit('placeFirstVisited', { triggerId: def.id });
      }
    }
  }

  /** The gate that keeps the player out of (x, z), or null when the way is free. */
  blockingGate(x: number, z: number, ctx: ConditionContext): TriggerDef | null {
    for (let i = 0; i < this.defs.length; i++) {
      const def = this.defs[i] as TriggerDef;
      if (def.kind !== 'gate' || !pointInShape(def.shape, x, z)) continue;
      if (!this.isOpen(def, ctx)) return def;
    }
    return null;
  }

  isOpen(def: TriggerDef, ctx: ConditionContext): boolean {
    const condition = def.condition ? this.conditions[def.condition] : undefined;
    return condition ? evaluateCondition(condition, ctx) : true;
  }

  /** Forgets where the player was (after a teleport): triggers fire again on the next update. */
  reset(): void {
    this.inside.fill(0);
  }

  /** Ids of the triggers the player stands in (debug overlay). */
  current(out: string[]): string[] {
    out.length = 0;
    for (let i = 0; i < this.defs.length; i++) {
      if (this.inside[i]) out.push((this.defs[i] as TriggerDef).id);
    }
    return out;
  }
}
