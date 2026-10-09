import type { CutscenesFile } from '../data/types';

export type FightDef = CutscenesFile['fights'][number];
export type FightBeat = FightDef['beats'][number];
export type FightAction = FightBeat['actions'][number];

/** How long an action lasts (teleporting is instant). */
export function actionSeconds(action: FightAction): number {
  return action.seconds ?? 0;
}

/** A beat lasts until its last action has finished. */
export function beatSeconds(beat: FightBeat): number {
  let end = 0;
  for (const action of beat.actions)
    end = Math.max(end, (action.delay ?? 0) + actionSeconds(action));
  return end;
}

/**
 * Plays the beats of a scripted fight one after the other, on the fixed step. A beat waits for
 * `startAfterHits` sword hits or `startAfterSeconds` seconds (whichever comes first; neither =
 * at once), then fires each action at its `delay`. The caller turns actions into effects
 * (speech, teleports, frozen time, ...) through `onAction`. Pure logic, no rendering.
 */
export class FightScript {
  private beat = 0;
  private playing = false;
  private time = 0;
  private hits = 0;
  private readonly fired: boolean[] = [];
  private done = false;

  constructor(
    private readonly beats: readonly FightBeat[],
    private readonly onAction: (action: FightAction, beat: FightBeat) => void,
  ) {}

  get finished(): boolean {
    return this.done;
  }

  /** Index of the current beat (for debug). */
  get beatIndex(): number {
    return this.beat;
  }

  /** The player landed a sword hit on one of the foes. */
  registerHit(): void {
    if (!this.playing) this.hits++;
  }

  step(dt: number): void {
    if (this.done) return;
    const beat = this.beats[this.beat];
    if (!beat) {
      this.done = true;
      return;
    }
    this.time += dt;
    if (!this.playing) {
      const byHits = beat.startAfterHits !== undefined && this.hits >= beat.startAfterHits;
      const bySeconds = beat.startAfterSeconds !== undefined && this.time >= beat.startAfterSeconds;
      const atOnce = beat.startAfterHits === undefined && beat.startAfterSeconds === undefined;
      if (!(byHits || bySeconds || atOnce)) return;
      this.playing = true;
      this.time = 0;
      this.fired.length = 0;
      for (let i = 0; i < beat.actions.length; i++) this.fired.push(false);
    }
    for (let i = 0; i < beat.actions.length; i++) {
      const action = beat.actions[i] as FightAction;
      if (!this.fired[i] && this.time >= (action.delay ?? 0)) {
        this.fired[i] = true;
        this.onAction(action, beat);
      }
    }
    if (this.time >= beatSeconds(beat)) {
      this.beat++;
      this.playing = false;
      this.time = 0;
      this.hits = 0;
      if (this.beat >= this.beats.length) this.done = true;
    }
  }
}
