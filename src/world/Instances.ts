/**
 * Interiors and dungeons (e.g. De Wortelgrotten) are separate "instances" with a short loading
 * screen, unlike the seamless open world. The world scene implements it: an instance with a
 * `scene` block is cut out of its zone's Blender scene (Master Brink's tower, Wizard Sam's
 * cellar); the others (De Wortelgrotten) stay closed until they are built.
 */
export interface InstanceHost {
  /** The instance the player is in, or null in the open world. */
  readonly currentInstance: string | null;
  /** Leaves the open world for an instance (zones.json `instances`). False when not possible. */
  enterInstance(id: string): boolean;
  /** Back to the open world, at the instance's entrance. */
  exitInstance(): void;
}
