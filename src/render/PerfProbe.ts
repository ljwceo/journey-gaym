/** Room for frame times (up to 240 fps). */
const FRAMES_PER_SECOND = 240;

export interface PerfResult {
  /** Average frames per second over the measurement. */
  fps: number;
  /** "1% low": the fps of the slowest 1% of frames (stutter shows here, not in the average). */
  low1Fps: number;
  /** Longest single frame (ms). */
  worstMs: number;
  frames: number;
}

/**
 * Debug measurement for the real devices (step 1.11): records every frame time for a fixed
 * number of seconds, then reports average fps, 1% low and the worst frame. No allocations
 * while measuring.
 */
export class PerfProbe {
  /** Last finished measurement, or null. */
  result: PerfResult | null = null;
  private readonly times: Float32Array;
  private count = 0;
  private elapsed = 0;
  private duration = 0;

  constructor(maxSeconds = 60) {
    this.times = new Float32Array(Math.ceil(maxSeconds * FRAMES_PER_SECOND));
  }

  get running(): boolean {
    return this.duration > 0;
  }

  /** Seconds left in a running measurement. */
  get remaining(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  start(seconds: number): void {
    this.duration = Math.min(seconds, this.times.length / FRAMES_PER_SECOND);
    this.elapsed = 0;
    this.count = 0;
  }

  /** Feed one rendered frame; returns the result once, when the measurement ends. */
  frame(frameSeconds: number): PerfResult | null {
    if (!this.running || frameSeconds <= 0) return null;
    this.elapsed += frameSeconds;
    if (this.count < this.times.length) this.times[this.count++] = frameSeconds;
    if (this.elapsed < this.duration) return null;
    this.duration = 0;
    this.result = summarize(this.times, this.count, this.elapsed);
    return this.result;
  }
}

/** Average fps, 1% low and worst frame from `count` frame times (sorts them in place). */
export function summarize(times: Float32Array, count: number, total: number): PerfResult {
  if (count === 0) return { fps: 0, low1Fps: 0, worstMs: 0, frames: 0 };
  const sorted = times.subarray(0, count).sort();
  // Average frame time of the slowest 1% (at least one frame).
  const slowCount = Math.max(1, Math.floor(count / 100));
  let slowSum = 0;
  for (let i = count - slowCount; i < count; i++) slowSum += sorted[i] ?? 0;
  return {
    fps: count / total,
    low1Fps: slowCount / slowSum,
    worstMs: (sorted[count - 1] ?? 0) * 1000,
    frames: count,
  };
}
