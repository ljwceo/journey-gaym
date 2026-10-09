import { ChunkBuilder, type ChunkLayout, chunkLayout } from './ChunkBuilder';
import { TerrainField, type TerrainSpec } from './TerrainField';

/** Main thread → worker. */
export type TerrainRequest =
  | { type: 'init'; spec: TerrainSpec }
  | {
      type: 'build';
      job: number;
      cx: number;
      cz: number;
      segments: number;
      density: number;
      /** Scratch buffer to fill; transferred, so it costs no copy. */
      buffer: ArrayBuffer;
    };

/** Worker → main thread. `buffer` comes back filled (and transferred again). */
export type TerrainReply =
  | { type: 'built'; job: number; buffer: ArrayBuffer }
  | { type: 'failed'; job: number; buffer: ArrayBuffer; message: string };

/**
 * Builds chunks from requests: the same code in the worker and in the main-thread fallback.
 * Prop counts are written as the last floats of the buffer (one per prop kind).
 */
export class TerrainJobRunner {
  readonly field: TerrainField;
  private readonly builder: ChunkBuilder;
  private readonly maxPerChunk: number[];
  private readonly layouts = new Map<number, ChunkLayout>();
  private readonly counts: Int32Array;

  constructor(spec: TerrainSpec) {
    this.field = new TerrainField(spec);
    this.builder = new ChunkBuilder(this.field);
    this.maxPerChunk = spec.props.map((prop) => prop.maxPerChunk);
    this.counts = new Int32Array(spec.props.length);
  }

  layout(segments: number): ChunkLayout {
    let layout = this.layouts.get(segments);
    if (!layout) {
      layout = chunkLayout(segments, this.maxPerChunk);
      this.layouts.set(segments, layout);
    }
    return layout;
  }

  /** Floats a buffer needs for this many segments (mesh + props + counts). */
  bufferLength(segments: number): number {
    return this.layout(segments).length + this.maxPerChunk.length;
  }

  run(cx: number, cz: number, segments: number, density: number, buffer: ArrayBuffer): void {
    const layout = this.layout(segments);
    const out = new Float32Array(buffer);
    if (out.length < layout.length + this.counts.length) throw new Error('buffer too small');
    this.builder.build(cx, cz, layout, density, out, this.counts);
    for (let k = 0; k < this.counts.length; k++) {
      out[layout.length + k] = this.counts[k] as number;
    }
  }
}
