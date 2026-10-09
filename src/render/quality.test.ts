import { describe, expect, it } from 'vitest';
import type { QualityFile } from '../data/types';
import { createNewSave } from '../save/SaveData';
import { readPublicJson } from '../test/loadPublic';
import {
  benchmarkLevel,
  chosenLevel,
  lowerLevel,
  medianOf,
  pixelRatioFor,
  presetFor,
  QualityTuner,
} from './quality';

const file = readPublicJson('data/quality.json') as QualityFile;

/** Feeds `seconds` of frames at `fps`, each taking `workMs`; returns the first non-'none' result. */
function run(tuner: QualityTuner, fps: number, seconds: number, workMs = 5) {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) {
    const result = tuner.frame(dt, workMs);
    if (result.kind !== 'none') return result;
  }
  return { kind: 'none' as const };
}

describe('chosenLevel', () => {
  it('uses the default before the first benchmark', () => {
    const save = createNewSave('en');
    expect(chosenLevel(save.settings, file)).toBe(file.default);
    expect(chosenLevel(null, file)).toBe(file.default);
  });

  it('uses the automatic choice with "Auto" and the player choice otherwise', () => {
    const save = createNewSave('en');
    save.settings.autoQuality = 'low';
    expect(chosenLevel(save.settings, file)).toBe('low');
    save.settings.quality = 'high';
    expect(chosenLevel(save.settings, file)).toBe('high');
  });

  it('finds every preset', () => {
    for (const level of ['low', 'mid', 'high'] as const)
      expect(presetFor(file, level).id).toBe(level);
  });
});

describe('preset helpers', () => {
  it('goes one step down and stops at low', () => {
    expect(lowerLevel('high')).toBe('mid');
    expect(lowerLevel('mid')).toBe('low');
    expect(lowerLevel('low')).toBeNull();
  });

  it('keeps the pixel ratio inside the preset range', () => {
    expect(pixelRatioFor({ min: 0.75, max: 1 }, 3)).toBe(1);
    expect(pixelRatioFor({ min: 1, max: 2 }, 1.5)).toBe(1.5);
    expect(pixelRatioFor({ min: 1, max: 2 }, 0.5)).toBe(1);
    expect(pixelRatioFor({ min: 1, max: 2 }, 0)).toBe(1);
  });

  it('picks a preset from the benchmark time', () => {
    const b = file.benchmark;
    expect(benchmarkLevel(b.highMaxFrameMs, b)).toBe('high');
    expect(benchmarkLevel(b.highMaxFrameMs + 0.1, b)).toBe('mid');
    expect(benchmarkLevel(b.midMaxFrameMs + 0.1, b)).toBe('low');
  });

  it('takes the median', () => {
    expect(medianOf(new Float32Array([5, 1, 3]), 3)).toBe(3);
    expect(medianOf(new Float32Array([4, 1, 3, 2, 99]), 4)).toBe(2.5);
    expect(medianOf(new Float32Array(4), 0)).toBe(0);
  });
});

describe('QualityTuner benchmark', () => {
  it('reports after warm-up + duration, from the median work time', () => {
    const tuner = new QualityTuner(file);
    tuner.start('benchmark');
    const b = file.benchmark;
    const result = run(tuner, 60, b.warmupSeconds + b.durationSeconds + 0.1, 3);
    expect(result).toMatchObject({ kind: 'benchmark', level: 'high' });
    expect(tuner.mode).toBe('monitor');
  });

  it('ignores a few slow loading frames', () => {
    const tuner = new QualityTuner(file);
    tuner.start('benchmark');
    let frame = 0;
    let result: ReturnType<QualityTuner['frame']> = { kind: 'none' };
    while (result.kind === 'none') {
      // Every tenth frame is a 40 ms hitch.
      result = tuner.frame(1 / 60, frame++ % 10 === 0 ? 40 : 9);
    }
    expect(result).toMatchObject({ kind: 'benchmark', level: 'mid' });
  });

  it('chooses low on a slow device', () => {
    const tuner = new QualityTuner(file);
    tuner.start('benchmark');
    expect(run(tuner, 30, 10, 25)).toMatchObject({ kind: 'benchmark', level: 'low' });
  });
});

describe('QualityTuner auto-downgrade', () => {
  const d = file.autoDowngrade;

  it('asks for one step down after a window below the threshold, after the grace period', () => {
    const tuner = new QualityTuner(file);
    tuner.start('monitor');
    // Slow during the grace period alone: nothing yet.
    expect(run(tuner, 40, d.graceSecondsAfterChange - 0.1).kind).toBe('none');
    const result = run(tuner, 40, d.windowSeconds + 0.5);
    expect(result.kind).toBe('downgrade');
  });

  it('never asks at 60 fps (also not on a 59.x fps display)', () => {
    const tuner = new QualityTuner(file);
    tuner.start('monitor');
    expect(run(tuner, 59.6, 60).kind).toBe('none');
    expect(tuner.lastFps).toBeGreaterThan(59);
  });

  it('does not count stalls (tab switch) as slow frames', () => {
    const tuner = new QualityTuner(file);
    tuner.start('monitor');
    run(tuner, 60, d.graceSecondsAfterChange + 1);
    for (let i = 0; i < 20; i++) expect(tuner.frame(2, 1).kind).toBe('none');
    expect(run(tuner, 60, d.windowSeconds * 3).kind).toBe('none');
  });

  it('does nothing when off', () => {
    const tuner = new QualityTuner(file);
    expect(run(tuner, 10, 60).kind).toBe('none');
  });
});
