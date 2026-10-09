/** Simulation rate in Hz. All game logic advances in steps of exactly 1 / SIM_HZ seconds. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** A real frame longer than this (tab hidden, debugger pause) is clamped, so the game never jumps. */
export const MAX_FRAME_SECONDS = 0.25;

/**
 * Fixed-timestep accumulator.
 *
 * Real frame time goes in; a whole number of fixed simulation steps comes out, plus an
 * interpolation factor (alpha) for rendering between the last two simulation states.
 * This keeps gameplay identical at 30, 60 or 120 fps.
 */
export class FixedStep {
  readonly dt: number;
  /** Interpolation factor in [0, 1): how far rendering is between the previous and current step. */
  alpha = 0;
  /** Total number of simulation steps taken since creation. */
  steps = 0;
  /** Steps dropped because a frame needed more than maxStepsPerFrame (should stay 0). */
  droppedSteps = 0;

  private accumulator = 0;

  constructor(
    dt = SIM_DT,
    private readonly maxStepsPerFrame = 8,
  ) {
    this.dt = dt;
  }

  /** Simulated time in seconds (steps * dt). */
  get simTime(): number {
    return this.steps * this.dt;
  }

  /**
   * Adds real elapsed time and returns how many fixed steps to run now.
   * The caller runs its update `n` times, then renders with `alpha`.
   */
  advance(frameSeconds: number): number {
    const clamped = frameSeconds > MAX_FRAME_SECONDS ? MAX_FRAME_SECONDS : frameSeconds;
    this.accumulator += clamped > 0 ? clamped : 0;

    let n = Math.floor(this.accumulator / this.dt);
    this.accumulator -= n * this.dt;
    // Floating point noise can leave the accumulator a hair below dt; treat that as a full step.
    if (this.dt - this.accumulator < 1e-9) {
      n += 1;
      this.accumulator = 0;
    }

    if (n > this.maxStepsPerFrame) {
      // Spiral-of-death guard: never try to catch up more than a few steps in one frame.
      this.droppedSteps += n - this.maxStepsPerFrame;
      n = this.maxStepsPerFrame;
    }

    this.steps += n;
    this.alpha = this.accumulator / this.dt;
    return n;
  }
}
