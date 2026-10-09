import { describe, expect, it } from 'vitest';
import type { LookDelta } from '../core/Input';
import type { PlayerConfig } from '../data/types';
import { readPublicJson } from '../test/loadPublic';
import { CameraOrbit } from './CameraRig';

const cfg = (readPublicJson('data/player.json') as PlayerConfig).camera;
const DEG = Math.PI / 180;
const still: LookDelta = { yaw: 0, pitch: 0, zoom: 1 };

/** Runs `seconds` of frames at `fps`; `look` is applied on the first frame only. */
function run(
  orbit: CameraOrbit,
  seconds: number,
  opts: { fps?: number; heading?: number; walking?: boolean; look?: LookDelta; sens?: number },
): void {
  const fps = opts.fps ?? 60;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    const look = i === 0 && opts.look ? opts.look : still;
    orbit.update(
      1 / fps,
      0,
      0,
      0,
      opts.heading ?? 0,
      opts.walking ?? false,
      look,
      false,
      opts.sens ?? 1,
    );
  }
}

describe('CameraOrbit', () => {
  it('starts behind the character at the default pitch', () => {
    const orbit = new CameraOrbit(cfg);
    orbit.snap(0, 0, 0, 1);
    expect(orbit.yaw).toBe(1);
    expect(orbit.pitch).toBeCloseTo(cfg.pitchDegrees * DEG);
  });

  it('can look all the way round while standing still, and stays there', () => {
    const orbit = new CameraOrbit(cfg);
    orbit.snap(0, 0, 0, 0);
    run(orbit, 3, { look: { yaw: Math.PI, pitch: 0, zoom: 1 } });
    expect(Math.abs(orbit.yaw)).toBeCloseTo(Math.PI);
  });

  it('turns back behind the character once it walks', () => {
    const orbit = new CameraOrbit(cfg);
    orbit.snap(0, 0, 0, 0);
    run(orbit, 0.1, { look: { yaw: 2, pitch: -0.3, zoom: 1 } });
    run(orbit, 4, { walking: true, heading: 0 });
    expect(orbit.yaw).toBeCloseTo(0, 2);
    expect(orbit.pitch).toBeCloseTo(cfg.pitchDegrees * DEG, 2);
  });

  it('scales turning with the sensitivity setting', () => {
    const full = new CameraOrbit(cfg);
    const slow = new CameraOrbit(cfg);
    run(full, 0.1, { look: { yaw: 1, pitch: 0, zoom: 1 }, sens: 1 });
    run(slow, 0.1, { look: { yaw: 1, pitch: 0, zoom: 1 }, sens: 0.3 });
    expect(slow.yaw).toBeCloseTo(full.yaw * 0.3);
  });

  it('keeps pitch and zoom within their limits', () => {
    const orbit = new CameraOrbit(cfg);
    run(orbit, 2, { look: { yaw: 0, pitch: 10, zoom: 100 } });
    expect(orbit.pitch).toBeCloseTo(cfg.maxPitchDegrees * DEG);
    expect(orbit.distance).toBeCloseTo(cfg.maxDistance, 3);
    run(orbit, 2, { look: { yaw: 0, pitch: -10, zoom: 0.001 } });
    expect(orbit.pitch).toBeCloseTo(cfg.minPitchDegrees * DEG);
    expect(orbit.distance).toBeCloseTo(cfg.minDistance, 3);
  });

  it('returns at the same speed at 60 and 120 fps', () => {
    const at60 = new CameraOrbit(cfg);
    const at120 = new CameraOrbit(cfg);
    for (const orbit of [at60, at120]) {
      orbit.snap(0, 0, 0, 0);
      orbit.yaw = 1.5;
    }
    run(at60, 1, { fps: 60, walking: true });
    run(at120, 1, { fps: 120, walking: true });
    expect(at120.yaw).toBeCloseTo(at60.yaw, 2);
  });
});
