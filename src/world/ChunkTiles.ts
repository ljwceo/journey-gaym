import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  PlaneGeometry,
} from 'three';

/**
 * Flat stand-in tiles for chunks that are still loading, so there is never a hole in the
 * world: a square in the zone's ground color at the chunk's average height. One InstancedMesh,
 * one instance per chunk slot. Positions are relative to the floating origin.
 */
export class ChunkTiles {
  readonly mesh: InstancedMesh;
  private readonly matrices: Float32Array;
  private readonly visible: Uint8Array;
  private readonly color = new Color();
  private dirty = false;
  private shown = 0;

  constructor(
    material: Material,
    readonly slots: number,
    readonly size: number,
  ) {
    // A unit square from (0, 0) to (1, 1), facing up; scaled to the chunk size per instance.
    const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0.5);
    this.mesh = new InstancedMesh(geometry, material, slots);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(slots * 3), 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.matrices = this.mesh.instanceMatrix.array as Float32Array;
    this.matrices.fill(0);
    this.visible = new Uint8Array(slots);
    this.mesh.frustumCulled = false;
    this.mesh.count = slots;
  }

  get shownCount(): number {
    return this.shown;
  }

  isShown(slot: number): boolean {
    return this.visible[slot] === 1;
  }

  /**
   * @param x, z chunk corner relative to the floating origin
   * @param r, g, b zone ground color (linear)
   */
  show(slot: number, x: number, y: number, z: number, r: number, g: number, b: number): void {
    const e = slot * 16;
    const m = this.matrices;
    m.fill(0, e, e + 16);
    m[e] = this.size;
    m[e + 5] = 1;
    m[e + 10] = this.size;
    m[e + 12] = x;
    m[e + 13] = y;
    m[e + 14] = z;
    m[e + 15] = 1;
    this.color.setRGB(r, g, b);
    this.mesh.setColorAt(slot, this.color);
    if (this.visible[slot] === 0) this.shown++;
    this.visible[slot] = 1;
    this.dirty = true;
  }

  hide(slot: number): void {
    if (this.visible[slot] === 0) return;
    this.matrices.fill(0, slot * 16, slot * 16 + 16);
    this.visible[slot] = 0;
    this.shown--;
    this.dirty = true;
  }

  /** The floating origin moved by (dx, dz). */
  shift(dx: number, dz: number): void {
    for (let slot = 0; slot < this.slots; slot++) {
      if (this.visible[slot] === 0) continue;
      const e = slot * 16;
      this.matrices[e + 12] = (this.matrices[e + 12] as number) - dx;
      this.matrices[e + 14] = (this.matrices[e + 14] as number) - dz;
    }
    this.dirty = true;
  }

  /** Uploads changes; call once per frame. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
