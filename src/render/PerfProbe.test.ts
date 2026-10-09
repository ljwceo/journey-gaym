import { describe, expect, it } from 'vitest';
import { PerfProbe, summarize } from './PerfProbe';

describe('PerfProbe', () => {
  it('reports average fps after the duration, once', () => {
    const probe = new PerfProbe();
    probe.start(2);
    let result = null;
    for (let i = 0; i < 125 && !result; i++) result = probe.frame(1 / 60);
    expect(result?.fps).toBeCloseTo(60, 0);
    expect(result?.low1Fps).toBeCloseTo(60, 0);
    expect(probe.running).toBe(false);
    expect(probe.frame(1 / 60)).toBeNull();
  });

  it('shows stutter in the 1% low and the worst frame, not in the average', () => {
    const times = new Float32Array(200).fill(1 / 120);
    times[50] = 0.05;
    times[150] = 0.05;
    let total = 0;
    for (const t of times) total += t;
    const result = summarize(times, times.length, total);
    expect(result.fps).toBeGreaterThan(100);
    expect(result.low1Fps).toBeCloseTo(20, 0);
    expect(result.worstMs).toBeCloseTo(50, 0);
  });

  it('handles no frames', () => {
    expect(summarize(new Float32Array(4), 0, 0).fps).toBe(0);
  });
});
