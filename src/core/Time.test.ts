import { describe, expect, it } from 'vitest';
import { FixedStep, MAX_FRAME_SECONDS, SIM_DT } from './Time';

function run(fps: number, seconds: number): FixedStep {
  const time = new FixedStep();
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) time.advance(1 / fps);
  return time;
}

describe('FixedStep', () => {
  it('takes the same number of steps at 30, 60, 120 and 144 fps', () => {
    for (const fps of [30, 60, 120, 144]) {
      const time = run(fps, 10);
      expect(time.steps, `${fps} fps`).toBe(600);
      expect(time.simTime).toBeCloseTo(10, 6);
    }
  });

  it('runs one step per frame at 60 fps and every other frame at 120 fps', () => {
    const at60 = new FixedStep();
    expect(at60.advance(1 / 60)).toBe(1);

    const at120 = new FixedStep();
    const counts = [at120.advance(1 / 120), at120.advance(1 / 120), at120.advance(1 / 120)];
    expect(counts.reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  it('reports alpha between steps for interpolation', () => {
    const time = new FixedStep();
    time.advance(SIM_DT * 1.5);
    expect(time.steps).toBe(1);
    expect(time.alpha).toBeCloseTo(0.5, 6);
  });

  it('handles irregular frame times without losing time', () => {
    const time = new FixedStep();
    const pattern = [0.007, 0.021, 0.016, 0.009, 0.031, 0.0166];
    let total = 0;
    for (let i = 0; i < 600; i++) {
      const dt = pattern[i % pattern.length] ?? 0;
      total += dt;
      time.advance(dt);
    }
    expect(time.simTime + time.alpha * time.dt).toBeCloseTo(total, 6);
  });

  it('clamps huge frames and caps catch-up steps', () => {
    const time = new FixedStep(SIM_DT, 8);
    const n = time.advance(5);
    expect(n).toBe(8);
    expect(time.droppedSteps).toBe(Math.round(MAX_FRAME_SECONDS / SIM_DT) - 8);
  });

  it('ignores negative frame times', () => {
    const time = new FixedStep();
    expect(time.advance(-1)).toBe(0);
    expect(time.alpha).toBe(0);
  });
});
