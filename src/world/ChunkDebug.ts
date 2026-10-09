import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
} from 'three';
import { palette } from '../render/palette';
import type { ChunkStatus, WorldStreamer } from './WorldStreamer';

/** Lines float this far above the terrain corners. */
const LIFT = 0.6;
/** Vertices per chunk outline: 4 edges × 2 ends. */
const VERTS_PER_CHUNK = 8;

const STATUS_COLORS: Record<ChunkStatus, Color> = {
  loading: new Color(palette.zonlicht),
  near: new Color(palette.magieblauw),
  far: new Color(palette.spreukviolet),
  unloading: new Color(palette.zonsondergang),
};

/**
 * Debug view of the chunk grid: an outline per chunk, colored by status (yellow = loading,
 * blue = near / full detail with collision, violet = far / low detail, orange = waiting to be
 * unloaded). One draw call; buffers are allocated once for the largest ring size.
 */
export class ChunkDebug {
  readonly lines: LineSegments;
  private readonly positions: Float32BufferAttribute;
  private readonly colors: Float32BufferAttribute;

  constructor(
    private readonly streamer: WorldStreamer,
    maxChunks: number,
  ) {
    const count = maxChunks * VERTS_PER_CHUNK;
    this.positions = new Float32BufferAttribute(new Float32Array(count * 3), 3);
    this.colors = new Float32BufferAttribute(new Float32Array(count * 3), 3);
    this.positions.setUsage(DynamicDrawUsage);
    this.colors.setUsage(DynamicDrawUsage);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colors);
    geometry.setDrawRange(0, 0);
    this.lines = new LineSegments(
      geometry,
      new LineBasicMaterial({ vertexColors: true, depthTest: false, fog: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.lines.name = 'chunk-debug';
  }

  /** Rewrites the outlines from the streamer's chunks (call on a slow timer, not per frame). */
  refresh(): void {
    const { streamer } = this;
    const size = streamer.chunkSize;
    const pos = this.positions.array as Float32Array;
    const col = this.colors.array as Float32Array;
    const max = pos.length / 3;
    let v = 0;
    for (let i = 0; i < streamer.list.length && v + VERTS_PER_CHUNK <= max; i++) {
      const chunk = streamer.list[i];
      if (!chunk) continue;
      const color = STATUS_COLORS[streamer.status(chunk)];
      // Inset a little so neighboring outlines do not overlap.
      const x0 = chunk.cx * size + 0.5;
      const z0 = chunk.cz * size + 0.5;
      const x1 = x0 + size - 1;
      const z1 = z0 + size - 1;
      const h00 = streamer.heightAt(x0, z0) + LIFT;
      const h10 = streamer.heightAt(x1, z0) + LIFT;
      const h11 = streamer.heightAt(x1, z1) + LIFT;
      const h01 = streamer.heightAt(x0, z1) + LIFT;
      v = edge(pos, col, v, color, x0, h00, z0, x1, h10, z0);
      v = edge(pos, col, v, color, x1, h10, z0, x1, h11, z1);
      v = edge(pos, col, v, color, x1, h11, z1, x0, h01, z1);
      v = edge(pos, col, v, color, x0, h01, z1, x0, h00, z0);
    }
    this.lines.geometry.setDrawRange(0, v);
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as LineBasicMaterial).dispose();
  }
}

function edge(
  pos: Float32Array,
  col: Float32Array,
  v: number,
  color: Color,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  pos.set([ax, ay, az, bx, by, bz], v * 3);
  col.set([color.r, color.g, color.b, color.r, color.g, color.b], v * 3);
  return v + 2;
}
