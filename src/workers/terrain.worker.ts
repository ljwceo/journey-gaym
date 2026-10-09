/// <reference lib="webworker" />
import type { TerrainReply, TerrainRequest } from '../world/TerrainJobs';
import { TerrainJobRunner } from '../world/TerrainJobs';

/**
 * Terrain worker: builds chunk meshes (heights, normals, colors) and scatters props off the
 * main thread. Buffers travel back and forth as transferables, so nothing is copied and the
 * same buffers are reused for every chunk.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
let runner: TerrainJobRunner | null = null;

scope.onmessage = (event: MessageEvent<TerrainRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    runner = new TerrainJobRunner(message.spec);
    return;
  }
  let reply: TerrainReply;
  try {
    if (!runner) throw new Error('terrain worker not initialized');
    runner.run(message.cx, message.cz, message.segments, message.density, message.buffer);
    reply = { type: 'built', job: message.job, buffer: message.buffer };
  } catch (error) {
    reply = {
      type: 'failed',
      job: message.job,
      buffer: message.buffer,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  scope.postMessage(reply, [reply.buffer]);
};
