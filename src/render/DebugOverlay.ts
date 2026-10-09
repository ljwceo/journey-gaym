import type { WebGLRenderer } from 'three';
import type { FixedStep } from '../core/Time';

/** How often the overlay text refreshes. Text updates allocate strings, so keep this low. */
const REFRESH_SECONDS = 0.25;

/** Extra values a scene or system wants to show, e.g. player position (filled in later steps). */
export type DebugLines = Map<string, string>;

interface MemoryInfo {
  usedJSHeapSize: number;
}

/**
 * Developer overlay: fps, frame time, CPU time, draw calls, triangles, GPU resources, simulation
 * counters. Toggle with F3, a three-finger tap (touch), or start with `?debug=1`.
 * Labels are technical abbreviations for developers and intentionally not translated.
 */
export class DebugOverlay {
  readonly lines: DebugLines = new Map();
  private readonly element: HTMLPreElement;
  private visible = false;

  private frames = 0;
  private frameTimeSum = 0;
  private frameTimeMax = 0;
  private cpuTimeSum = 0;
  private elapsed = 0;

  constructor(
    parent: HTMLElement,
    private readonly renderer: WebGLRenderer,
    private readonly time: FixedStep,
    private readonly getStateId: () => string | null,
  ) {
    this.element = document.createElement('pre');
    this.element.className = 'debug-overlay';
    parent.appendChild(this.element);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.setVisible(new URLSearchParams(window.location.search).get('debug') === '1');
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.element.style.display = visible ? 'block' : 'none';
    if (visible) this.reset();
  }

  /**
   * Call once per rendered frame, after rendering.
   * @param frameSeconds real time since the previous frame
   * @param cpuMs time spent in update + render this frame
   */
  frame(frameSeconds: number, cpuMs: number): void {
    if (!this.visible) return;
    this.frames++;
    this.frameTimeSum += frameSeconds;
    if (frameSeconds > this.frameTimeMax) this.frameTimeMax = frameSeconds;
    this.cpuTimeSum += cpuMs;
    this.elapsed += frameSeconds;
    if (this.elapsed >= REFRESH_SECONDS) {
      this.refresh();
      this.reset();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('touchstart', this.onTouchStart);
    this.element.remove();
  }

  private reset(): void {
    this.frames = 0;
    this.frameTimeSum = 0;
    this.frameTimeMax = 0;
    this.cpuTimeSum = 0;
    this.elapsed = 0;
  }

  private refresh(): void {
    const fps = this.frames / this.elapsed;
    const avgMs = (this.frameTimeSum / this.frames) * 1000;
    const maxMs = this.frameTimeMax * 1000;
    const cpuMs = this.cpuTimeSum / this.frames;
    const info = this.renderer.info;
    const size = this.renderer.domElement;
    const memory = (performance as Performance & { memory?: MemoryInfo }).memory;

    let text =
      `fps      ${fps.toFixed(0)}\n` +
      `frame    ${avgMs.toFixed(2)} ms (max ${maxMs.toFixed(1)})\n` +
      `cpu      ${cpuMs.toFixed(2)} ms\n` +
      `calls    ${info.render.calls}\n` +
      `tris     ${info.render.triangles}\n` +
      `geo/tex  ${info.memory.geometries} / ${info.memory.textures}\n` +
      (memory ? `heap     ${(memory.usedJSHeapSize / 1048576).toFixed(1)} MB\n` : '') +
      `res      ${size.width}x${size.height} @${this.renderer.getPixelRatio().toFixed(2)}\n` +
      `sim      ${this.time.steps} steps, ${this.time.simTime.toFixed(1)} s` +
      (this.time.droppedSteps > 0 ? `, ${this.time.droppedSteps} dropped` : '') +
      `\nstate    ${this.getStateId() ?? '-'}`;
    for (const [label, value] of this.lines) text += `\n${label.padEnd(8)} ${value}`;
    this.element.textContent = text;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F3') {
      event.preventDefault();
      this.setVisible(!this.visible);
    }
  };

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length === 3) this.setVisible(!this.visible);
  };
}
