import { PerspectiveCamera } from 'three';
import type { LookDelta } from '../core/Input';
import type { PlayerConfig } from '../data/types';
import { angleDelta } from '../systems/Movement';

const DEG = Math.PI / 180;

export type CameraConfig = PlayerConfig['camera'];

/** Fraction of the way to close in `seconds` with a given sharpness (per second); fps-independent. */
function damp(sharpness: number, seconds: number): number {
  return 1 - Math.exp(-sharpness * seconds);
}

/**
 * The camera's orbit around the character, as plain numbers (testable without WebGL).
 *
 * - Standing still you can look all the way round (yaw) and between min and max pitch;
 *   the character does not turn with the camera.
 * - Once the character walks (and you are not dragging), the camera waits
 *   `returnDelaySeconds` and then swings smoothly back behind it, and to the default pitch.
 * - Yaw is the direction the camera looks along the ground: (sin yaw, cos yaw), the same
 *   convention as a character's heading, so "behind the character" means yaw = heading.
 */
export class CameraOrbit {
  yaw = 0;
  pitch: number;
  distance: number;
  targetDistance: number;
  /** Smoothed point the camera looks at. */
  x = 0;
  y = 0;
  z = 0;
  private walkingSeconds = 0;

  constructor(private readonly cfg: CameraConfig) {
    this.pitch = cfg.pitchDegrees * DEG;
    this.distance = cfg.distance;
    this.targetDistance = cfg.distance;
  }

  /** Jumps straight behind the character (entering the world, teleporting). */
  snap(x: number, y: number, z: number, heading: number): void {
    this.x = x;
    this.y = y + this.cfg.targetHeight;
    this.z = z;
    this.yaw = heading;
    this.pitch = this.cfg.pitchDegrees * DEG;
    this.distance = this.targetDistance;
    this.walkingSeconds = 0;
  }

  /**
   * Advances the camera by one rendered frame.
   * @param seconds real time since the last frame (camera smoothing is fps-independent)
   * @param look turning and zoom from Input since the last frame
   * @param dragging true while the player is turning the camera
   * @param sensitivity camera sensitivity setting (1 = 100%)
   */
  update(
    seconds: number,
    goalX: number,
    goalY: number,
    goalZ: number,
    heading: number,
    walking: boolean,
    look: LookDelta,
    dragging: boolean,
    sensitivity: number,
  ): void {
    const cfg = this.cfg;
    // Turning right looks further clockwise from above: yaw goes down (see Movement.screenToWorld).
    this.yaw = angleDelta(0, this.yaw - look.yaw * sensitivity);
    this.pitch += look.pitch * sensitivity;

    if (walking && !dragging) {
      this.walkingSeconds += seconds;
      if (this.walkingSeconds >= cfg.returnDelaySeconds) {
        const t = damp(cfg.returnSharpness, seconds);
        this.yaw = angleDelta(0, this.yaw + angleDelta(this.yaw, heading) * t);
        this.pitch += (cfg.pitchDegrees * DEG - this.pitch) * t;
      }
    } else {
      this.walkingSeconds = 0;
    }
    this.pitch = Math.min(
      cfg.maxPitchDegrees * DEG,
      Math.max(cfg.minPitchDegrees * DEG, this.pitch),
    );

    this.targetDistance = Math.min(
      cfg.maxDistance,
      Math.max(cfg.minDistance, this.targetDistance * look.zoom),
    );
    this.distance += (this.targetDistance - this.distance) * damp(cfg.zoomSharpness, seconds);

    const follow = damp(cfg.followSharpness, seconds);
    this.x += (goalX - this.x) * follow;
    this.y += (goalY + cfg.targetHeight - this.y) * follow;
    this.z += (goalZ - this.z) * follow;
  }
}

/** Places a Three.js camera on a CameraOrbit. */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly orbit: CameraOrbit;

  constructor(cfg: CameraConfig, far: number) {
    this.camera = new PerspectiveCamera(cfg.fovDegrees, 1, 0.1, far);
    this.orbit = new CameraOrbit(cfg);
  }

  /** Moves the camera to the orbit's current state. Allocation-free. */
  apply(): void {
    const o = this.orbit;
    const horizontal = Math.cos(o.pitch) * o.distance;
    this.camera.position.set(
      o.x - Math.sin(o.yaw) * horizontal,
      o.y + Math.sin(o.pitch) * o.distance,
      o.z - Math.cos(o.yaw) * horizontal,
    );
    this.camera.lookAt(o.x, o.y, o.z);
  }
}
