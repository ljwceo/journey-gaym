/**
 * Interiors and dungeons (e.g. De Wortelgrotten) are separate "instances" with a short loading
 * screen, unlike the seamless open world. Only the interface exists in phase 1; the world
 * scene implements it and refuses every instance until they are built.
 */
export interface InstanceHost {
  /** The instance the player is in, or null in the open world. */
  readonly currentInstance: string | null;
  /** Leaves the open world for an instance (zones.json `instances`). False when not possible. */
  enterInstance(id: string): boolean;
  /** Back to the open world, at the instance's entrance. */
  exitInstance(): void;
}
