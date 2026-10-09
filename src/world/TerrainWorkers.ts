import type { TerrainJobRunner, TerrainReply, TerrainRequest } from './TerrainJobs';

export interface FinishedJob {
  job: number;
  buffer: ArrayBuffer;
  ok: boolean;
}

export interface TerrainWorkerOptions {
  maxWorkers: number;
  maxJobsInFlight: number;
  /** Floats per scratch buffer (enough for the most detailed chunk). */
  bufferLength: number;
}

/**
 * Runs chunk builds in Web Workers and hands the results back, a few at a time.
 * Scratch buffers go to a worker and come back filled (transferables: no copies) and are then
 * reused, so steady streaming allocates nothing.
 *
 * If workers cannot start (old browser, blocked script), it falls back to building on the main
 * thread, one chunk per frame, so the game still works, only with more chance of a hitch.
 */
export class TerrainWorkers {
  private readonly workers: Worker[] = [];
  private readonly free: ArrayBuffer[] = [];
  private readonly inFlight = new Set<number>();
  private readonly finished: FinishedJob[] = [];
  private nextWorker = 0;
  private fallback = false;
  private builtThisFrame = 0;

  constructor(
    private readonly runner: TerrainJobRunner,
    private readonly options: TerrainWorkerOptions,
    private readonly reportProblem: (message: string) => void,
  ) {
    // Twice the jobs in flight: workers keep building while finished chunks wait their turn.
    for (let i = 0; i < options.maxJobsInFlight * 2; i++) this.free.push(this.newBuffer());
    const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
    // Leave a core for the main thread.
    const count = Math.max(1, Math.min(options.maxWorkers, cores - 1));
    try {
      for (let i = 0; i < count; i++) {
        const worker = new Worker(new URL('../workers/terrain.worker.ts', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = this.onMessage;
        worker.onerror = this.onError;
        const init: TerrainRequest = { type: 'init', spec: runner.field.spec };
        worker.postMessage(init);
        this.workers.push(worker);
      }
    } catch (error) {
      this.startFallback(`terrain workers unavailable: ${String(error)}`);
    }
  }

  /** 'worker' normally, 'main' when building on the main thread. */
  get mode(): 'worker' | 'main' {
    return this.fallback ? 'main' : 'worker';
  }

  get jobsInFlight(): number {
    return this.inFlight.size;
  }

  get workerCount(): number {
    return this.workers.length;
  }

  /** Call at the start of every frame. */
  beginFrame(): void {
    this.builtThisFrame = 0;
  }

  canRequest(): boolean {
    if (this.free.length === 0) return false;
    if (this.fallback) return this.builtThisFrame === 0;
    return this.inFlight.size < this.options.maxJobsInFlight;
  }

  request(job: number, cx: number, cz: number, segments: number, density: number): void {
    const buffer = this.free.pop();
    if (!buffer) throw new Error('no free terrain buffer (check canRequest first)');
    if (this.fallback) {
      this.builtThisFrame++;
      this.runner.run(cx, cz, segments, density, buffer);
      this.finished.push({ job, buffer, ok: true });
      return;
    }
    this.inFlight.add(job);
    const worker = this.workers[this.nextWorker] as Worker;
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    const message: TerrainRequest = { type: 'build', job, cx, cz, segments, density, buffer };
    worker.postMessage(message, [buffer]);
  }

  /** Next finished build, oldest first; give its buffer back with `recycle` when done. */
  takeFinished(): FinishedJob | undefined {
    return this.finished.shift();
  }

  get finishedCount(): number {
    return this.finished.length;
  }

  recycle(buffer: ArrayBuffer): void {
    this.free.push(buffer);
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    this.inFlight.clear();
    this.finished.length = 0;
  }

  private newBuffer(): ArrayBuffer {
    return new ArrayBuffer(this.options.bufferLength * Float32Array.BYTES_PER_ELEMENT);
  }

  private startFallback(reason: string): void {
    if (this.fallback) return;
    this.fallback = true;
    this.reportProblem(`${reason}; building terrain on the main thread`);
    for (const worker of this.workers) worker.terminate();
    this.workers.length = 0;
    // Jobs in a worker are lost together with their buffers: report them as failed (with new
    // buffers), so the streamer asks again.
    for (const job of this.inFlight)
      this.finished.push({ job, buffer: this.newBuffer(), ok: false });
    this.inFlight.clear();
  }

  private readonly onMessage = (event: MessageEvent<TerrainReply>): void => {
    const reply = event.data;
    if (!this.inFlight.delete(reply.job)) {
      this.free.push(reply.buffer);
      return;
    }
    if (reply.type === 'failed') this.reportProblem(`terrain job failed: ${reply.message}`);
    this.finished.push({ job: reply.job, buffer: reply.buffer, ok: reply.type === 'built' });
  };

  private readonly onError = (event: ErrorEvent): void => {
    event.preventDefault();
    this.startFallback(`terrain worker error: ${event.message}`);
  };
}
