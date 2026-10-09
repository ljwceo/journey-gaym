import type { QualityFile, QualityLevel, QualityPreset } from '../data/types';
import type { SaveSettings } from '../save/SaveData';

/** Presets from low to high; "one step down" moves left in this list. */
export const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'mid', 'high'];

/**
 * The preset to use: the player's own choice, otherwise the one the benchmark / auto-downgrade
 * picked, otherwise the default from quality.json (before the first benchmark).
 */
export function chosenLevel(settings: SaveSettings | null, file: QualityFile): QualityLevel {
  if (settings && settings.quality !== 'auto') return settings.quality;
  return settings?.autoQuality ?? file.default;
}

export function presetFor(file: QualityFile, level: QualityLevel): QualityPreset {
  const preset = file.presets.find((entry) => entry.id === level) ?? file.presets[0];
  if (!preset) throw new Error('quality.json has no presets');
  return preset;
}

/** One preset lower, or null when already at the lowest. */
export function lowerLevel(level: QualityLevel): QualityLevel | null {
  const index = QUALITY_ORDER.indexOf(level);
  return index > 0 ? (QUALITY_ORDER[index - 1] ?? null) : null;
}

/** The device pixel ratio, kept inside the preset's range. */
export function pixelRatioFor(
  range: { min: number; max: number },
  devicePixelRatio: number,
): number {
  return Math.min(range.max, Math.max(range.min, devicePixelRatio || 1));
}

/** Benchmark verdict from the median work time of a frame (CPU + GPU, ms). */
export function benchmarkLevel(medianMs: number, config: QualityFile['benchmark']): QualityLevel {
  if (medianMs <= config.highMaxFrameMs) return 'high';
  if (medianMs <= config.midMaxFrameMs) return 'mid';
  return 'low';
}

/** Median of the first `count` values; sorts that part of the array in place. */
export function medianOf(values: Float32Array, count: number): number {
  if (count <= 0) return 0;
  const part = values.subarray(0, count).sort();
  const middle = count >> 1;
  return count % 2 === 1
    ? (part[middle] ?? 0)
    : ((part[middle - 1] ?? 0) + (part[middle] ?? 0)) / 2;
}

/** A frame longer than this is a stall (tab switch, alert, debugger), not slow rendering. */
const STALL_SECONDS = 0.5;
/** Room for samples during the benchmark (up to 240 fps). */
const SAMPLES_PER_SECOND = 240;

export type TunerMode = 'off' | 'benchmark' | 'monitor';
export type TunerResult =
  | { kind: 'none' }
  | { kind: 'benchmark'; level: QualityLevel; medianMs: number }
  | { kind: 'downgrade'; fps: number };

const NONE: TunerResult = { kind: 'none' };

/**
 * Decides when the game picks or lowers the graphics preset (pure logic, no browser).
 *
 * - `benchmark`: after a short warm-up it collects the work time of every frame for a few
 *   seconds and returns a preset from the median (one slow frame from loading does not count).
 * - `monitor`: averages the frame rate over windows of a few seconds; a window below the
 *   threshold asks for one step down. After any change there is a grace period, so the new
 *   preset gets a fair chance. It never asks to go up.
 */
export class QualityTuner {
  mode: TunerMode = 'off';
  /** Average fps of the last finished monitor window (debug). */
  lastFps = 0;
  /** Median of the last benchmark in ms (debug); 0 before any benchmark. */
  lastBenchmarkMs = 0;

  private readonly samples: Float32Array;
  private sampleCount = 0;
  private elapsed = 0;
  private grace = 0;
  private windowTime = 0;
  private windowFrames = 0;

  constructor(private readonly config: Pick<QualityFile, 'benchmark' | 'autoDowngrade'>) {
    this.samples = new Float32Array(
      Math.ceil(config.benchmark.durationSeconds * SAMPLES_PER_SECOND),
    );
  }

  /** Progress of a running benchmark, 0–1. */
  get benchmarkProgress(): number {
    const b = this.config.benchmark;
    return this.mode === 'benchmark'
      ? Math.min(1, Math.max(0, (this.elapsed - b.warmupSeconds) / b.durationSeconds))
      : 0;
  }

  /** Starts a mode from scratch (with the grace period for `monitor`). */
  start(mode: TunerMode): void {
    this.mode = mode;
    this.sampleCount = 0;
    this.elapsed = 0;
    this.grace = this.config.autoDowngrade.graceSecondsAfterChange;
    this.windowTime = 0;
    this.windowFrames = 0;
  }

  /**
   * Feed one rendered frame.
   * @param frameSeconds real time since the previous frame
   * @param workMs time this frame took to simulate and draw (with the GPU, during a benchmark)
   */
  frame(frameSeconds: number, workMs: number): TunerResult {
    if (this.mode === 'off') return NONE;
    if (frameSeconds > STALL_SECONDS || frameSeconds <= 0) {
      // A stall says nothing about performance: start the current window again.
      this.windowTime = 0;
      this.windowFrames = 0;
      return NONE;
    }
    return this.mode === 'benchmark'
      ? this.benchmarkFrame(frameSeconds, workMs)
      : this.monitorFrame(frameSeconds);
  }

  private benchmarkFrame(frameSeconds: number, workMs: number): TunerResult {
    const b = this.config.benchmark;
    this.elapsed += frameSeconds;
    if (this.elapsed < b.warmupSeconds) return NONE;
    if (this.sampleCount < this.samples.length) this.samples[this.sampleCount++] = workMs;
    if (this.elapsed < b.warmupSeconds + b.durationSeconds) return NONE;
    const medianMs = medianOf(this.samples, this.sampleCount);
    this.lastBenchmarkMs = medianMs;
    this.start('monitor');
    return { kind: 'benchmark', level: benchmarkLevel(medianMs, b), medianMs };
  }

  private monitorFrame(frameSeconds: number): TunerResult {
    if (this.grace > 0) {
      this.grace -= frameSeconds;
      return NONE;
    }
    this.windowTime += frameSeconds;
    this.windowFrames++;
    const d = this.config.autoDowngrade;
    if (this.windowTime < d.windowSeconds) return NONE;
    const fps = this.windowFrames / this.windowTime;
    this.lastFps = fps;
    this.windowTime = 0;
    this.windowFrames = 0;
    return fps < d.belowFps ? { kind: 'downgrade', fps } : NONE;
  }
}
