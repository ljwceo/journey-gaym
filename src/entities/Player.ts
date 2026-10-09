import type { AppearanceFile } from '../data/types';
import type { Appearance } from '../scenes/creator';
import { angleDelta, MoverState } from '../systems/Movement';
import type { Ground } from '../world/Ground';
import { CharacterModel } from './PlaceholderFactory';

/**
 * The player character: simulation state (MoverState, advanced by systems/Movement on the fixed
 * step) and its look (the placeholder model from the character creator). Rendering interpolates
 * between the previous and the current step, so movement looks smooth at any frame rate.
 */
export class Player {
  readonly state = new MoverState();
  readonly model: CharacterModel;
  private prevX = 0;
  private prevZ = 0;
  private prevHeading = 0;

  constructor(appearanceData: AppearanceFile, appearance: Appearance) {
    this.model = new CharacterModel(appearanceData);
    this.model.setAppearance(appearance);
  }

  /** Puts the player somewhere without interpolating from the old spot (spawn, teleport). */
  place(x: number, z: number, heading: number): void {
    const s = this.state;
    s.x = this.prevX = x;
    s.z = this.prevZ = z;
    s.heading = this.prevHeading = heading;
  }

  /** Call before each simulation step: remembers where the step started. */
  beginStep(): void {
    this.prevX = this.state.x;
    this.prevZ = this.state.z;
    this.prevHeading = this.state.heading;
  }

  interpolatedX(alpha: number): number {
    return this.prevX + (this.state.x - this.prevX) * alpha;
  }

  interpolatedZ(alpha: number): number {
    return this.prevZ + (this.state.z - this.prevZ) * alpha;
  }

  /** Moves the model to the interpolated position and heading. Allocation-free. */
  syncModel(alpha: number, ground: Ground): void {
    const x = this.interpolatedX(alpha);
    const z = this.interpolatedZ(alpha);
    const root = this.model.root;
    root.position.set(x, ground.heightAt(x, z), z);
    root.rotation.y = this.prevHeading + angleDelta(this.prevHeading, this.state.heading) * alpha;
  }

  dispose(): void {
    this.model.dispose();
  }
}
