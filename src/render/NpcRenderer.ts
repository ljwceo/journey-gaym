import {
  Color,
  DynamicDrawUsage,
  type Group,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
} from 'three';
import { buildNpcModel, type NpcModel } from '../entities/NpcFactory';
import type { Npc } from '../entities/Npc';

/** Height (m) of the hop after petting. */
const HOP_HEIGHT = 0.25;
const WHITE = new Color(0xffffff);

interface Batch {
  model: NpcModel;
  meshes: InstancedMesh[];
  npcs: Npc[];
}

/**
 * Draws the NPCs: one InstancedMesh per model part (all humanoids share two draw calls, all
 * Treewardens two, Pringle two). Every frame the shown NPCs are written at their interpolated
 * position and heading; nothing is allocated while playing.
 */
export class NpcRenderer {
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly batches: Batch[] = [];
  private readonly matrix = new Matrix4();
  private readonly heights = new Map<Npc, number>();

  constructor(npcs: readonly Npc[], root: Group) {
    const byModel = new Map<string, Npc[]>();
    for (const npc of npcs) {
      const list = byModel.get(npc.role.model) ?? [];
      list.push(npc);
      byModel.set(npc.role.model, list);
    }
    for (const [key, list] of byModel) {
      const model = buildNpcModel(key);
      const meshes = model.parts.map((part) => {
        const mesh = new InstancedMesh(part.geometry, this.material, list.length);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.count = 0;
        mesh.name = `npcs:${key}`;
        mesh.matrixAutoUpdate = false;
        // NPCs move: the cached bounding sphere of the instances would go stale.
        mesh.frustumCulled = false;
        for (let i = 0; i < list.length; i++) {
          mesh.setColorAt(i, part.tinted ? (list[i] as Npc).color : WHITE);
        }
        root.add(mesh);
        return mesh;
      });
      for (const npc of list) this.heights.set(npc, model.height);
      this.batches.push({ model, meshes, npcs: list });
    }
  }

  /** Top of the NPC's head (m above its feet), for the interaction icon. */
  heightOf(npc: Npc): number {
    return this.heights.get(npc) ?? 1.8;
  }

  /** Writes the shown NPCs into their instanced meshes. Call every rendered frame. */
  update(alpha: number, hopSeconds: number): void {
    const m = this.matrix;
    for (let b = 0; b < this.batches.length; b++) {
      const batch = this.batches[b] as Batch;
      let count = 0;
      for (let i = 0; i < batch.npcs.length; i++) {
        const npc = batch.npcs[i] as Npc;
        if (!npc.shown) continue;
        const hop = npc.hop > 0 ? Math.sin((1 - npc.hop / hopSeconds) * Math.PI) * HOP_HEIGHT : 0;
        m.makeRotationY(npc.drawHeading(alpha));
        m.setPosition(npc.drawX(alpha), npc.drawY(alpha) + hop, npc.drawZ(alpha));
        for (let p = 0; p < batch.meshes.length; p++) {
          const mesh = batch.meshes[p] as InstancedMesh;
          mesh.setMatrixAt(count, m);
          if (mesh.instanceColor) {
            // Slots follow the shown NPCs, so the color moves with them.
            const tinted = batch.model.parts[p]?.tinted ?? false;
            mesh.setColorAt(count, tinted ? npc.color : WHITE);
          }
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
