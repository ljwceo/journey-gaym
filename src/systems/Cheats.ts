import type { MoveCommand, MoverState } from './Movement';
import type { Bounds } from './Collision';

/** Speed multipliers offered in the cheat menu. */
export const CHEAT_SPEEDS = [1, 2, 5, 10, 25] as const;
/** Highest a flying player may go above the ground (m). */
export const FLY_MAX_ABOVE_GROUND = 400;

/**
 * Debug-only test helpers (never saved, only available in debug mode): faster walking and
 * flying through walls. Gameplay never reads these outside debug mode.
 */
export class Cheats {
  speed: number = 1;
  fly = false;
  /** Chunk outlines in the world (debug view). */
  chunkLines = false;

  get active(): boolean {
    return this.speed !== 1 || this.fly;
  }

  reset(): void {
    this.speed = 1;
    this.fly = false;
    this.chunkLines = false;
  }
}

/**
 * One fixed step of flying: horizontal like walking (direction from the camera), `vertical`
 * -1..1 for down/up, no colliders. Stays inside `bounds` and between the ground and
 * FLY_MAX_ABOVE_GROUND above it. Speeds are per second, so 60 and 120 fps fly equally fast.
 */
export function stepFlying(
  s: MoverState,
  cmd: MoveCommand,
  vertical: number,
  speed: number,
  dt: number,
  groundHeight: (x: number, z: number) => number,
  bounds: Bounds | null,
): void {
  const length = Math.sqrt(cmd.x * cmd.x + cmd.z * cmd.z);
  const scale = length > 1 ? 1 / length : 1;
  s.x += cmd.x * scale * speed * dt;
  s.z += cmd.z * scale * speed * dt;
  if (bounds) {
    s.x = Math.min(bounds.maxX, Math.max(bounds.minX, s.x));
    s.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, s.z));
  }
  s.y += vertical * speed * dt;
  const ground = groundHeight(s.x, s.z);
  s.y = Math.min(ground + FLY_MAX_ABOVE_GROUND, Math.max(ground, s.y));
  s.moving = length > 1e-4 || vertical !== 0;
  if (length > 1e-4) s.heading = Math.atan2(cmd.x, cmd.z);
  s.dashTime = 0;
}
