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
  /** The player's HP reached 0 (step 2.4 turns this into dying: gold loss, cutscene). */
  playerKnockedOut: Record<string, never>;
  /** The UI language changed; screens rebuild their text. */
  languageChanged: { language: string };
  /** A setting in the save changed (applied by main.ts). */
  settingsChanged: Record<string, never>;
  /** The graphics preset in use changed (Settings, benchmark or auto-downgrade). */
  qualityChanged: { level: 'low' | 'mid' | 'high' };
  /** The game picked (benchmark) or lowered (too slow) the preset itself, with "Auto" on. */
  qualityAutoChosen: { level: 'low' | 'mid' | 'high'; reason: 'benchmark' | 'lowered' };
}

export type GameEventBus = EventBus<GameEvents>;

export function createEventBus(): GameEventBus {
  return new EventBus<GameEvents>();
}
