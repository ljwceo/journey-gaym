import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { palette } from '../render/palette';
import { type ChunkPlanner, NONE } from './ChunkPlanner';
import type { FloatingOrigin } from './FloatingOrigin';
import type { TerrainField } from './TerrainField';

/** Lines hover this far (m) above the ground. */
const LIFT = 1.5;
/** Points per chunk edge (follow the hills a little). */
const POINTS_PER_EDGE = 4;

/**
 * Debug view of the chunk grid: the border of every chunk the world keeps, colored by state.
 * Blue = active (colliders), gold = loaded, amber = still loading, violet = only kept
 * (between the preload and unload ring). Only built while debug mode is on.
 */
export class ChunkDebug {
  readonly lines: LineSegments;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly color = new Color();
  private readonly stateColors: Record<'active' | 'loaded' | 'loading' | 'kept', Color>;

  constructor(
    private readonly planner: ChunkPlanner,
    private readonly field: TerrainField,
    private readonly origin: FloatingOrigin,
  ) {
    const capacity = planner.records.length;
    const vertices = capacity * 4 * POINTS_PER_EDGE * 2;
    this.positions = new Float32Array(vertices * 3);
    this.colors = new Float32Array(vertices * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage),
    );
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    this.lines = new LineSegments(
      geometry,
      new LineBasicMaterial({
        vertexColors: true,
        depthTest: false,
        transparent: true,
        fog: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.lines.visible = false;
    this.lines.name = 'chunk-debug';
    this.stateColors = {
      active: new Color(palette.magieblauw),
      loaded: new Color(palette.zonlicht),
      loading: new Color(palette.lantaarnamber),
      kept: new Color(palette.spreukviolet),
    };
  }

  /** Rebuilds the lines (call a few times per second while visible; allocation-free). */
  refresh(): void {
    const size = this.planner.chunkSize;
    const preload = this.planner.ringConfig.preload;
    let v = 0;
    for (const record of this.planner.records) {
      if (!record.used) continue;
      const state =
        record.ring > preload
          ? 'kept'
          : record.shownLod === NONE
            ? 'loading'
            : record.active
              ? 'active'
              : 'loaded';
      this.color.copy(this.stateColors[state]);
      const x0 = record.cx * size;
      const z0 = record.cz * size;
      // North, east, south, west edges, each in a few pieces.
      v = this.edge(v, x0, z0, size, 0);
      v = this.edge(v, x0 + size, z0, 0, size);
      v = this.edge(v, x0 + size, z0 + size, -size, 0);
      v = this.edge(v, x0, z0 + size, 0, -size);
    }
    const geometry = this.lines.geometry;
    geometry.setDrawRange(0, v);
    (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as LineBasicMaterial).dispose();
  }

  private edge(v: number, x: number, z: number, dx: number, dz: number): number {
    for (let i = 0; i < POINTS_PER_EDGE; i++) {
      v = this.point(v, x + (dx * i) / POINTS_PER_EDGE, z + (dz * i) / POINTS_PER_EDGE);
      v = this.point(v, x + (dx * (i + 1)) / POINTS_PER_EDGE, z + (dz * (i + 1)) / POINTS_PER_EDGE);
    }
    return v;
  }

  private point(v: number, x: number, z: number): number {
    const p = v * 3;
    this.positions[p] = x - this.origin.x;
    this.positions[p + 1] = Math.max(this.field.heightAt(x, z), this.field.spec.seaLevel) + LIFT;
    this.positions[p + 2] = z - this.origin.z;
    this.colors[p] = this.color.r;
    this.colors[p + 1] = this.color.g;
    this.colors[p + 2] = this.color.b;
    return v + 1;
  }
}
