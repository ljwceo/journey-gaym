import {
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  type Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Mesh,
  DoubleSide,
  Quaternion,
  Vector3,
} from 'three';
import type { Enemy } from '../entities/Enemy';
import { colored } from '../entities/StructureFactory';
import { currentSpecial } from '../systems/EnemyAI';
import type { Projectile } from '../systems/Projectiles';
import { palette } from './palette';

/** Warnings on screen at the same time (more are simply not drawn). */
const MAX_WARNINGS = 8;
/** Warning red (style guide: danger is the only place for a hard red). */
const WARNING_RED = 0xe0402f;
/** Height (m) above the ground where the warning is drawn. */
const WARNING_LIFT = 0.1;
/** Segments around and rings outwards of a warning disc (it follows the ground). */
const SEGMENTS = 40;
const RINGS = 6;
/** The outline is this wide, as a fraction of the radius. */
const OUTLINE_WIDTH = 0.07;

/** A flat disc (or ring band from `inner` to 1) as a grid whose heights are set every frame. */
class GroundDisc {
  readonly mesh: Mesh;
  /** Unit (radius 1) x/z of every vertex. */
  private readonly unit: Float32Array;
  private readonly positions: Float32Array;
  private readonly attribute: BufferAttribute;

  constructor(inner: number, material: MeshBasicMaterial, root: Group) {
    const rings = inner > 0 ? 1 : RINGS;
    const count = (rings + 1) * (SEGMENTS + 1);
    this.unit = new Float32Array(count * 2);
    this.positions = new Float32Array(count * 3);
    const indices: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const radius = inner + ((1 - inner) * r) / rings;
      for (let s = 0; s <= SEGMENTS; s++) {
        const a = (s / SEGMENTS) * Math.PI * 2;
        const k = r * (SEGMENTS + 1) + s;
        this.unit[k * 2] = Math.sin(a) * radius;
        this.unit[k * 2 + 1] = Math.cos(a) * radius;
        if (r < rings && s < SEGMENTS) {
          const next = k + SEGMENTS + 1;
          indices.push(k, next, k + 1, k + 1, next, next + 1);
        }
      }
    }
    const geometry = new BufferGeometry();
    this.attribute = new BufferAttribute(this.positions, 3);
    this.attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.attribute);
    geometry.setIndex(indices);
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    root.add(this.mesh);
  }

  /** Lays the disc on the ground around (x, z) with this radius. */
  place(x: number, z: number, radius: number, heightAt: (x: number, z: number) => number): void {
    const n = this.unit.length / 2;
    for (let k = 0; k < n; k++) {
      const px = x + (this.unit[k * 2] as number) * radius;
      const pz = z + (this.unit[k * 2 + 1] as number) * radius;
      this.positions[k * 3] = px;
      this.positions[k * 3 + 1] = heightAt(px, pz) + WARNING_LIFT;
      this.positions[k * 3 + 2] = pz;
    }
    this.attribute.needsUpdate = true;
    this.mesh.visible = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
  }
}

/**
 * Red warning circles on the ground for big attacks (Goblin Chief's Big Swing, Treewarden's
 * Heavy Slam): an outline of the whole area, filling up from the centre until the hit lands.
 * The circles follow the ground (hills and banks), so characters stand on top of them. Gameplay
 * only reads the simulation; this is the same on every graphics preset.
 */
export class WarningRenderer {
  private readonly outlines: GroundDisc[] = [];
  private readonly fills: GroundDisc[] = [];
  private readonly outlineMaterial: MeshBasicMaterial;
  private readonly fillMaterial: MeshBasicMaterial;

  constructor(
    root: Group,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    const material = (opacity: number): MeshBasicMaterial =>
      new MeshBasicMaterial({
        color: WARNING_RED,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
      });
    this.outlineMaterial = material(0.9);
    this.fillMaterial = material(0.35);
    for (let i = 0; i < MAX_WARNINGS; i++) {
      this.outlines.push(new GroundDisc(1 - OUTLINE_WIDTH, this.outlineMaterial, root));
      this.fills.push(new GroundDisc(0, this.fillMaterial, root));
    }
  }

  update(enemies: readonly Enemy[], alpha: number): void {
    let count = 0;
    for (let i = 0; i < enemies.length && count < MAX_WARNINGS; i++) {
      const e = enemies[i] as Enemy;
      if (!e.alive || e.mode !== 'windup') continue;
      const special = currentSpecial(e);
      if (!special?.areaRadius) continue;
      const progress = 1 - Math.max(0, e.timer) / Math.max(1e-3, special.warningSeconds);
      const r = special.areaRadius;
      const x = e.drawX(alpha);
      const z = e.drawZ(alpha);
      (this.outlines[count] as GroundDisc).place(x, z, r, this.heightAt);
      (this.fills[count] as GroundDisc).place(x, z, r * Math.min(1, progress), this.heightAt);
      count++;
    }
    for (let i = count; i < MAX_WARNINGS; i++) {
      (this.outlines[i] as GroundDisc).mesh.visible = false;
      (this.fills[i] as GroundDisc).mesh.visible = false;
    }
  }

  dispose(): void {
    for (const disc of this.outlines) disc.dispose();
    for (const disc of this.fills) disc.dispose();
    this.outlineMaterial.dispose();
    this.fillMaterial.dispose();
  }
}

/** Arrows in flight: one InstancedMesh for the whole projectile pool. */
export class ProjectileRenderer {
  private readonly mesh: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly yAxis = new Vector3(0, 1, 0);
  private readonly one = new Vector3(1, 1, 1);

  constructor(
    private readonly projectiles: readonly Projectile[],
    root: Group,
  ) {
    // Along +z: shaft, a dark tip in front and pale feathers at the back.
    const geometry = colored([
      [new CylinderGeometry(0.02, 0.02, 0.8, 4).rotateX(Math.PI / 2), palette.steengrijs, 0, 0, 0],
      [new ConeGeometry(0.05, 0.14, 4).rotateX(Math.PI / 2), palette.nachtinkt, 0, 0, 0.46],
      [new ConeGeometry(0.06, 0.16, 3).rotateX(-Math.PI / 2), palette.zonlicht, 0, 0, -0.36],
    ]);
    this.mesh = new InstancedMesh(
      geometry,
      new MeshLambertMaterial({ vertexColors: true }),
      projectiles.length,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'arrows';
    root.add(this.mesh);
  }

  update(alpha: number): void {
    let count = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i] as Projectile;
      if (!p.active) continue;
      this.position.set(p.drawX(alpha), p.drawY(alpha), p.drawZ(alpha));
      this.rotation.setFromAxisAngle(this.yAxis, p.heading);
      this.matrix.compose(this.position, this.rotation, this.one);
      this.mesh.setMatrixAt(count++, this.matrix);
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshLambertMaterial).dispose();
    this.mesh.dispose();
  }
}
