import type { GameEventBus } from '../core/events';
import type { SaveData } from './SaveData';
import type { SaveManager } from './SaveManager';

export type AutoSaveReason = 'zone' | 'checkpoint' | 'place' | 'npc' | 'hidden' | 'manual';

/**
 * Saves automatically on a new zone, a new checkpoint, a place visited for the first time, an NPC
 * met for the first time, and when the page is hidden or closed.
 * iPhone Safari does not fire `beforeunload` reliably, so `visibilitychange` and `pagehide`
 * are used instead.
 */
export class AutoSave {
  private readonly unsubscribe: (() => void)[] = [];

  /**
   * @param snapshot returns the save to write (with the latest world state), or null when there
   *   is nothing to save yet (e.g. before the language choice)
   */
  constructor(
    private readonly manager: SaveManager,
    events: GameEventBus,
    private readonly snapshot: () => SaveData | null,
    private readonly onSaved?: (reason: AutoSaveReason, ok: boolean) => void,
  ) {
    this.unsubscribe.push(
      events.on('zoneEntered', () => this.saveNow('zone')),
      events.on('checkpointSet', () => this.saveNow('checkpoint')),
      events.on('placeFirstVisited', () => this.saveNow('place')),
      events.on('npcMet', () => this.saveNow('npc')),
    );
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
  }

  saveNow(reason: AutoSaveReason): boolean {
    const save = this.snapshot();
    if (!save) return false;
    const ok = this.manager.write(save);
    this.onSaved?.(reason, ok);
    return ok;
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.saveNow('hidden');
  };

  private readonly onPageHide = (): void => {
    this.saveNow('hidden');
  };
}
