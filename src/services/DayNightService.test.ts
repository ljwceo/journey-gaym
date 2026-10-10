import { describe, expect, it } from 'vitest';
import { dayNightFileSchema } from '../data/schemas';
import { readPublicJson } from '../test/loadPublic';
import { DayNightService } from './DayNightService';

const MIN = 60_000;
const config = dayNightFileSchema.parse(readPublicJson('data/daynight.json'));

/** A service whose clock is `minutes` into a day (a whole number of days after the epoch). */
function at(minutes: number, days = 1000): { service: DayNightService; clock: { now: number } } {
  const clock = { now: 0 };
  const service = new DayNightService(config, () => clock.now);
  clock.now = days * service.dayMs + minutes * MIN;
  return { service, clock };
}

describe('DayNightService', () => {
  it('has a 40 minute day: 20 day, 3 dusk, 14 night, 3 dawn', () => {
    const { service } = at(0);
    expect(service.dayMs).toBe(40 * MIN);
    expect(config.phases.map((phase) => [phase.id, phase.minutes])).toEqual([
      ['day', 20],
      ['dusk', 3],
      ['night', 14],
      ['dawn', 3],
    ]);
  });

  it.each([
    [0, 'day', 20],
    [19.5, 'day', 0.5],
    [20, 'dusk', 3],
    [22, 'dusk', 1],
    [23, 'night', 14],
    [36.9, 'night', 0.1],
    [37, 'dawn', 3],
    [39.99, 'dawn', 0.01],
  ])('at minute %s it is %s with %s minutes left', (minute, id, left) => {
    const phase = at(minute).service.phase();
    expect(phase.id).toBe(id);
    expect(phase.remainingMs / MIN).toBeCloseTo(left, 5);
  });

  it('follows the real clock: the same minute on another day is the same phase', () => {
    expect(at(30, 7).service.phase().id).toBe(at(30, 123_456).service.phase().id);
  });

  it('spawns monsters only at dusk, at night and at dawn', () => {
    expect(at(10).service.spawning()).toBe(false);
    expect(at(21).service.spawning()).toBe(true);
    expect(at(30).service.spawning()).toBe(true);
    expect(at(38).service.spawning()).toBe(true);
  });

  it('holds a look in the middle of a long phase and blends around a change', () => {
    const { service } = at(0);
    const mid = service.blendAt(10 * MIN);
    expect(mid).toEqual({ a: 0, b: 0, t: 0 });
    // Halfway between the end of the day hold (18.5) and the dusk peak (21.5).
    const toDusk = service.blendAt(20 * MIN);
    expect(toDusk.a).toBe(0);
    expect(toDusk.b).toBe(1);
    expect(toDusk.t).toBeCloseTo(0.5, 5);
    // Dusk is fully on at its middle.
    expect(service.blendAt(21.5 * MIN)).toEqual({ a: 1, b: 1, t: 0 });
    // Just after midnight of the cycle the dawn look still fades into day.
    const wrap = service.blendAt(0.5 * MIN);
    expect(wrap.a).toBe(3);
    expect(wrap.b).toBe(0);
    expect(wrap.t).toBeGreaterThan(0.5);
    expect(wrap.t).toBeLessThan(1);
  });

  it('blends smoothly: the mix never jumps between two moments a second apart', () => {
    const { service } = at(0);
    const weightOf = (time: number, phase: number): number => {
      const b = service.blendAt(time);
      return (b.a === phase ? 1 - b.t : 0) + (b.b === phase ? b.t : 0);
    };
    for (let s = 0; s < 40 * 60; s++) {
      for (let phase = 0; phase < 4; phase++) {
        const step = Math.abs(weightOf((s + 1) * 1000, phase) - weightOf(s * 1000, phase));
        expect(step).toBeLessThan(0.02);
      }
    }
  });

  it('test mode: jumps to a phase, runs faster, and goes back to the clock', () => {
    const { service, clock } = at(5);
    service.jumpTo('night');
    expect(service.overridden).toBe(true);
    expect(service.phase().id).toBe('night');
    expect(service.blend()).toEqual({ a: 2, b: 2, t: 0 });
    service.jumpTo('dusk');
    expect(service.phase().id).toBe('dusk');
    service.jumpTo('day');
    service.setSpeed(60);
    // 20 real seconds at 60× = 20 game minutes: from the start of the day into dusk.
    clock.now += 20_000;
    expect(service.phase().id).toBe('dusk');
    service.followClock();
    expect(service.overridden).toBe(false);
    expect(service.speed).toBe(1);
    expect(service.phase().id).toBe('day');
  });
});
