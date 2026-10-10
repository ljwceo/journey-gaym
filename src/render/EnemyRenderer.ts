import {
  Color,
  DynamicDrawUsage,
  type Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { type Enemy, enemyModelKey, WOBBLE_SECONDS } from '../entities/Enemy';
import { buildEnemyModel, type EnemyModel } from '../entities/EnemyFactory';

const WHITE = new Color(0xffffff);
/** Hit flash: a warm red tint over the model's own colors. */
const FLASH = new Color(0xff7a6a);
/** How far a hit target leans (radians) and how far a defeated one falls over. */
const WOBBLE_ANGLE = 0.25;
const FALLEN_ANGLE = 1.35;
/** Defeated targets sink a little into the ground while lying down. */
const FALLEN_SINK = 0.15;
/** Hops per second × π of a moving slime. */
const HOP_SPEED = 7;

interface Batch {
  key: string;
  model: EnemyModel;
  meshes: InstancedMesh[];
  enemies: Enemy[];
}

/**
 * Draws the shown monsters: one InstancedMesh per model part, written every frame at the
 * interpolated position, with a red flash and a wobble when hit, lying down while defeated, and
 * hopping slimes. A pooled night monster has a slot in every model it can take and is drawn in
 * the one of its current monster. Nothing is allocated while playing.
 */
export class EnemyRenderer {
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly batches: Batch[] = [];
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly tilt = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly xAxis = new Vector3(1, 0, 0);
  private readonly yAxis = new Vector3(0, 1, 0);
  private readonly color = new Color();
  /** Top of each model (m), by model key. */
  private readonly heights = new Map<string, number>();

  constructor(enemies: readonly Enemy[], root: Group) {
    const byModel = new Map<string, Enemy[]>();
    for (const enemy of enemies) {
      for (const key of enemy.possibleModels) {
        const list = byModel.get(key) ?? [];
        list.push(enemy);
        byModel.set(key, list);
      }
    }
    for (const [key, list] of byModel) {
      const model = buildEnemyModel(key);
      this.heights.set(key, model.height);
      const meshes = model.parts.map((geometry) => {
        const mesh = new InstancedMesh(geometry, this.material, list.length);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.count = 0;
        mesh.name = `enemies:${key}`;
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        // Monsters move: the cached bounding sphere of the instances would go stale.
        mesh.frustumCulled = false;
        for (let i = 0; i < list.length; i++) mesh.setColorAt(i, WHITE);
        root.add(mesh);
        return mesh;
      });
      this.batches.push({ key, model, meshes, enemies: list });
    }
  }

  /** Top of the monster (m above its feet), for damage numbers. */
  heightOf(enemy: Enemy): number {
    return this.heights.get(enemyModelKey(enemy.def)) ?? 1.5;
  }

  /** Writes the shown monsters into their instanced meshes. Call every rendered frame. */
  update(alpha: number): void {
    for (let b = 0; b < this.batches.length; b++) {
      const batch = this.batches[b] as Batch;
      let count = 0;
      for (let i = 0; i < batch.enemies.length; i++) {
        const e = batch.enemies[i] as Enemy;
        if (!e.shown || !e.active || enemyModelKey(e.def) !== batch.key) continue;
        const lean = e.alive
          ? Math.sin(e.wobble * 30) * WOBBLE_ANGLE * (e.wobble / WOBBLE_SECONDS)
          : 0;
        this.rotation.setFromAxisAngle(this.yAxis, e.heading);
        this.tilt.setFromAxisAngle(this.xAxis, e.alive ? lean : -FALLEN_ANGLE);
        this.rotation.multiply(this.tilt);
        const hop =
          batch.model.hop && e.alive && e.moveTime > 0
            ? Math.abs(Math.sin(e.moveTime * HOP_SPEED)) * batch.model.hop
            : 0;
        this.position.set(e.drawX(alpha), e.y + hop - (e.alive ? 0 : FALLEN_SINK), e.drawZ(alpha));
        this.matrix.compose(this.position, this.rotation, this.scale);
        this.color.copy(WHITE).lerp(FLASH, e.flash > 0 ? 1 : 0);
        for (let p = 0; p < batch.meshes.length; p++) {
          const mesh = batch.meshes[p] as InstancedMesh;
          mesh.setMatrixAt(count, this.matrix);
          mesh.setColorAt(count, this.color);
        }
        count++;
      }
      for (let p = 0; p < batch.meshes.length; p++) {
        const mesh = batch.meshes[p] as InstancedMesh;
        mesh.count = count;
        mesh.visible = count > 0;
        if (count === 0) continue;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const batch of this.batches) {
      for (const mesh of batch.meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
    this.batches.length = 0;
    this.heights.clear();
    this.material.dispose();
  }
}
