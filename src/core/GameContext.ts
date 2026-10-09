import type { GameData } from '../data/types';
import type { I18n } from '../i18n/I18n';
import type { DebugOverlay } from '../render/DebugOverlay';
import type { Renderer } from '../render/Renderer';
import type { SaveData } from '../save/SaveData';
import type { SaveManager } from '../save/SaveManager';
import type { StateId } from '../scenes/flow';
import type { SeasonService } from '../services/SeasonService';
import type { Overlays } from '../ui/Overlays';
import type { GameEventBus } from './events';
import type { GameLoop } from './GameLoop';

/**
 * Everything the scenes share. Created once in main.ts; `data`, `seasons` and `session` are
 * filled in by the Boot scene and the language choice.
 */
export interface GameContext {
  readonly renderer: Renderer;
  readonly events: GameEventBus;
  readonly loop: GameLoop;
  readonly i18n: I18n;
  readonly saves: SaveManager;
  readonly debug: DebugOverlay;
  /** Layer for HTML screens and panels, above the canvas. */
  readonly ui: HTMLElement;
  readonly overlays: Overlays;
  readonly params: URLSearchParams;

  data: GameData | null;
  seasons: SeasonService | null;
  /** The current save; null before the language choice and after deleting the save. */
  session: SaveData | null;

  /** Switches to another scene (applied before the next update). */
  goto(state: StateId): void;
  /** Writes the session to storage now. Returns false when nothing could be saved. */
  persist(): boolean;
  /** Logs a problem; in debug mode it also appears in the red error list. */
  reportProblem(message: string): void;
}
