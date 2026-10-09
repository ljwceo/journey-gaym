/// <reference lib="webworker" />
import { buildChunkMesh, buildFarMesh } from '../world/ChunkMesh';
import { scatterChunk } from '../world/Scatter';
import type { WorldGenConfig } from '../world/terrainConfig';
import { TerrainField } from '../world/TerrainField';
import type { TerrainRequest, TerrainResponse } from '../world/terrainProtocol';

/**
 * Terrain worker: builds chunk meshes and prop positions off the main thread, so loading never
 * costs a frame. Results go back as transferable buffers (no copying).
 */
declare const self: DedicatedWorkerGlobalScope;

/** Extra sea (m) the far map shows around the world. */
const FAR_MARGIN = 600;

let config: WorldGenConfig | null = null;
let field: TerrainField | null = null;

function post(message: TerrainResponse, transfer: Transferable[]): void {
  self.postMessage(message, transfer);
}

self.onmessage = (event: MessageEvent<TerrainRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    config = message.config;
    field = new TerrainField(config.terrain);
    const mesh = buildFarMesh(field, config.farGridSpacing, FAR_MARGIN);
    post({ type: 'far', mesh }, [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.colors.buffer,
      mesh.index.buffer,
    ]);
    return;
  }
  if (!config || !field) return;
  if (message.type === 'density') {
    config.scatter.density = message.density;
    return;
  }
  const start = performance.now();
  const segments = config.lodSegments[message.lod] ?? config.lodSegments[1];
  const mesh = buildChunkMesh(
    field,
    message.cx,
    message.cz,
    config.chunkSize,
    segments,
    config.skirtDepth,
  );
  const props = message.props
    ? scatterChunk(field, config.scatter, message.cx, message.cz, config.chunkSize)
    : [];
  post(
    {
      type: 'chunk',
      id: message.id,
      cx: message.cx,
      cz: message.cz,
      lod: message.lod,
      mesh,
      props,
      ms: performance.now() - start,
    },
    [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.colors.buffer,
      mesh.index.buffer,
      mesh.heights.buffer,
      ...props.map((list) => list.buffer),
    ],
  );
};
