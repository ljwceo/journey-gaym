import { EventBus } from './EventBus';

/**
 * All game-wide events and their payloads. Add new events here; listeners stay decoupled.
 * Events named in CLAUDE.md §11 are declared now so later systems share one vocabulary.
 */
export interface GameEvents {
  stateChanged: { from: string | null; to: string };
  zoneEntered: { zoneId: string };
  triggerEntered: { triggerId: string };
  placeFirstVisited: { triggerId: string };
  npcTalked: { npcId: string };
  checkpointSet: { checkpointId: string };
}

export type GameEventBus = EventBus<GameEvents>;

export function createEventBus(): GameEventBus {
  return new EventBus<GameEvents>();
}
