import { type PerspectiveCamera, Vector3 } from 'three';
import type { StructureLayer } from '../world/StructureLayer';
import { el } from './dom';

/** Labels further away than this (m) are hidden. */
const MAX_DISTANCE = 140;

/**
 * Debug mode only: a label with the name (or id) above every placeholder structure near the
 * player, so you can see which block is the Forge and which is the Alchemy Lab. Label elements
 * are made the first time they are needed and reused afterwards.
 */
export class StructureLabels {
  readonly root = el('div', { className: 'ui-structure-labels' });
  private readonly labels: (HTMLElement | null)[];
  private readonly shown: Uint8Array;
  private readonly point = new Vector3();
  private visible = false;

  constructor(private readonly layer: StructureLayer) {
    this.labels = layer.structures.map(() => null);
    this.shown = new Uint8Array(layer.structures.length);
  }

  /**
   * Places the labels (call every frame). `originX/Z` is the floating origin; `playerX/Z` the
   * player's world position. Hides everything when `enabled` is false.
   */
  update(
    enabled: boolean,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    originX: number,
    originZ: number,
    playerX: number,
    playerZ: number,
  ): void {
    if (!enabled) {
      if (this.visible) this.hideAll();
      return;
    }
    this.visible = true;
    const structures = this.layer.structures;
    this.shown.fill(0);
    const active = this.layer.active;
    for (let k = 0; k < active.length; k++) {
      const i = active[k] as number;
      const s = structures[i];
      if (!s || s.def.connects) continue;
      const dx = s.x - playerX;
      const dz = s.z - playerZ;
      if (dx * dx + dz * dz > MAX_DISTANCE * MAX_DISTANCE) continue;
      const p = this.point.set(s.x - originX, s.top + 1, s.z - originZ).project(camera);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) continue;
      let label = this.labels[i];
      if (!label) {
        label = el('div', { className: 'ui-structure-label', text: s.def.name ?? s.def.id });
        this.labels[i] = label;
        this.root.append(label);
      }
      label.hidden = false;
      label.style.transform = `translate(${Math.round(((p.x + 1) / 2) * width)}px, ${Math.round(((1 - p.y) / 2) * height)}px) translate(-50%, -100%)`;
      this.shown[i] = 1;
    }
    for (let i = 0; i < this.labels.length; i++) {
      const label = this.labels[i];
      if (label && !this.shown[i] && !label.hidden) label.hidden = true;
    }
  }

  dispose(): void {
    this.root.remove();
  }

  private hideAll(): void {
    this.visible = false;
    for (const label of this.labels) if (label) label.hidden = true;
  }
}
