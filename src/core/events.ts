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
  /** The first time the player talks to (or pets) this NPC. */
  npcMet: { npcId: string };
  checkpointSet: { checkpointId: string };
  /** The UI language changed; screens rebuild their text. */
  languageChanged: { language: string };
  /** A setting in the save changed (applied by main.ts). */
  settingsChanged: Record<string, never>;
}

export type GameEventBus = EventBus<GameEvents>;

export function createEventBus(): GameEventBus {
  return new EventBus<GameEvents>();
}
