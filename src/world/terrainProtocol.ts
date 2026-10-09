import type { ChunkMeshData, FarMeshData } from './ChunkMesh';
import type { WorldGenConfig } from './terrainConfig';

/** Messages to the terrain worker. */
export type TerrainRequest =
  | { type: 'init'; config: WorldGenConfig }
  | { type: 'chunk'; id: number; cx: number; cz: number; lod: number; props: boolean };

/** Messages from the terrain worker. All typed arrays are transferred (not copied). */
export type TerrainResponse =
  | { type: 'far'; mesh: FarMeshData }
  | {
      type: 'chunk';
      id: number;
      cx: number;
      cz: number;
      lod: number;
      mesh: ChunkMeshData;
      /** One array per prop kind (see Scatter.PROP_STRIDE); empty when `props` was false. */
      props: Float32Array[];
      /** Time the worker spent (ms), for the debug overlay. */
      ms: number;
    };
