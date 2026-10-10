import type { DayNightFile } from '../data/types';

const MINUTE_MS = 60_000;

/** Where in the day we are: the phase and how long it still lasts. */
export interface DayPhase {
  /** Index into `phases` of daynight.json. */
  index: number;
  id: string;
  label: string;
  /** Milliseconds of game time until the next phase. */
  remainingMs: number;
}

/**
 * Which two looks to mix right now: `a` and `b` are phase indexes (the look with the same id),
 * `t` (0–1) how far from a to b. Outside a blend, a === b and t = 0.
 */
export interface LookBlend {
  a: number;
  b: number;
  t: number;
}

/**
 * The time of day from the real clock: (Date.now() + offset) modulo the length of one day
 * (40 minutes with the default data), like the seasons. Every player sees the same time without
 * a server. The test mode (cheat menu) can jump to a phase or run the clock faster; that is never
 * saved, and `followClock()` goes back to the real time.
 *
 * Looks blend around each phase change: over `blendMinutes` before and after it, but never more
 * than half of a phase, so a short phase (dusk, 3 min) peaks in its middle and a long one (day)
 * holds its own look in between.
 */
export class DayNightService {
  readonly dayMs: number;
  private readonly startMs: number[] = [];
  private readonly holdMs: number[] = [];
  /** Test mode: game time = anchorGame + (now - anchorReal) × speed. Null = real clock. */
  private anchorReal: number | null = null;
  private anchorGame = 0;
  private speedFactor = 1;
  private readonly spawnPhases: ReadonlySet<string>;

  constructor(
    readonly config: DayNightFile,
    private readonly now: () => number = () => Date.now(),
  ) {
    let start = 0;
    const blend = config.blendMinutes * MINUTE_MS;
    for (const phase of config.phases) {
      const length = phase.minutes * MINUTE_MS;
      this.startMs.push(start);
      this.holdMs.push(Math.min(blend, length / 2));
      start += length;
    }
    this.dayMs = start;
    this.spawnPhases = new Set(config.spawnPhases);
  }

  /** True while the test mode overrides the real clock. */
  get overridden(): boolean {
    return this.anchorReal !== null;
  }

  get speed(): number {
    return this.speedFactor;
  }

  /** Milliseconds since the start of the current day (0 ≤ result < dayMs). */
  timeOfDay(): number {
    const now = this.now();
    const game =
      this.anchorReal === null ? now : this.anchorGame + (now - this.anchorReal) * this.speedFactor;
    return ((game % this.dayMs) + this.dayMs) % this.dayMs;
  }

  /** The current phase. Writes into `out` (no allocation in the game loop). */
  phase(out: DayPhase = { index: 0, id: '', label: '', remainingMs: 0 }): DayPhase {
    const time = this.timeOfDay();
    const index = this.phaseIndexAt(time);
    const def = this.config.phases[index];
    out.index = index;
    out.id = def?.id ?? '';
    out.label = def?.label ?? '';
    out.remainingMs = this.endOf(index) - time;
    return out;
  }

  /** Whether monsters appear now (daynight.json `spawnPhases`). */
  spawning(): boolean {
    const def = this.config.phases[this.phaseIndexAt(this.timeOfDay())];
    return def !== undefined && this.spawnPhases.has(def.id);
  }

  /** Which looks to mix now. Writes into `out`. */
  blend(out: LookBlend = { a: 0, b: 0, t: 0 }): LookBlend {
    return this.blendAt(this.timeOfDay(), out);
  }

  /** Same as `blend` for a given time of day (ms); pure, for tests. */
  blendAt(time: number, out: LookBlend = { a: 0, b: 0, t: 0 }): LookBlend {
    const count = this.startMs.length;
    const i = this.phaseIndexAt(time);
    const start = this.startMs[i] ?? 0;
    const end = this.endOf(i);
    const hold = this.holdMs[i] ?? 0;
    if (time < start + hold) {
      // Coming in from the previous phase: its blend window ends `hold` after our start.
      const prev = (i - 1 + count) % count;
      const from = start - (this.holdMs[prev] ?? 0);
      out.a = prev;
      out.b = i;
      out.t = smooth((time - from) / (start + hold - from));
    } else if (time > end - hold) {
      const next = (i + 1) % count;
      const to = end + (this.holdMs[next] ?? 0);
      out.a = i;
      out.b = next;
      out.t = smooth((time - (end - hold)) / (to - (end - hold)));
    } else {
      out.a = i;
      out.b = i;
      out.t = 0;
    }
    return out;
  }

  /**
   * Test mode: jumps to a phase where its own look is fully on (the middle of a short phase,
   * just after the blend of a long one). Keeps the chosen speed.
   */
  jumpTo(phaseId: string): void {
    const i = this.config.phases.findIndex((phase) => phase.id === phaseId);
    if (i < 0) return;
    const start = this.startMs[i] ?? 0;
    const length = this.endOf(i) - start;
    const hold = this.holdMs[i] ?? 0;
    const target = hold * 2 >= length ? start + length / 2 : start + hold;
    this.anchorGame = target;
    this.anchorReal = this.now();
  }

  /** Test mode: the clock runs `factor` times faster from the current time of day. */
  setSpeed(factor: number): void {
    const current = this.timeOfDay();
    this.speedFactor = factor;
    if (factor === 1 && this.anchorReal === null) return;
    this.anchorGame = current;
    this.anchorReal = this.now();
  }

  /** Back to the real clock (and normal speed). */
  followClock(): void {
    this.anchorReal = null;
    this.speedFactor = 1;
  }

  private phaseIndexAt(time: number): number {
    for (let i = this.startMs.length - 1; i > 0; i--) {
      if (time >= (this.startMs[i] ?? 0)) return i;
    }
    return 0;
  }

  private endOf(index: number): number {
    return index + 1 < this.startMs.length ? (this.startMs[index + 1] ?? 0) : this.dayMs;
  }
}

/** Smoothstep: eases in and out, so a look never starts or stops changing with a jolt. */
function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
