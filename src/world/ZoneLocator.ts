import type { Zone } from '../data/types';
import { pointInShape } from './Shapes';

/**
 * Finds the zone at a world position: the highest-priority zone whose shape contains it
 * (the Black Citadel wins inside Morvath). Allocation-free.
 */
export class ZoneLocator {
  private readonly zones: Zone[];

  constructor(zones: readonly Zone[]) {
    this.zones = [...zones].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  zoneAt(x: number, z: number): Zone | null {
    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i] as Zone;
      if (pointInShape(zone.bounds, x, z)) return zone;
    }
    return null;
  }
}
