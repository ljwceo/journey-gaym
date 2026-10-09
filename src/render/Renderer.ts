import { type Camera, type PerspectiveCamera, type Scene, WebGLRenderer } from 'three';
import { uiColors } from './palette';

/** Upper bound for the device pixel ratio; QualityManager (step 1.10) will lower it per preset. */
const MAX_PIXEL_RATIO = 2;

/** Owns the WebGLRenderer and the canvas, and keeps the active camera's aspect ratio in sync. */
export class Renderer {
  readonly three: WebGLRenderer;
  private camera: PerspectiveCamera | null = null;

  constructor(private readonly container: HTMLElement) {
    this.three = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.three.setClearColor(uiColors.bg);
    container.appendChild(this.three.domElement);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  /** The camera whose aspect ratio follows the window size. */
  setCamera(camera: PerspectiveCamera | null): void {
    this.camera = camera;
    this.resize();
  }

  /** Clears the canvas to the background color (for scenes that draw only HTML). */
  clear(): void {
    this.three.clear();
  }

  render(scene: Scene, camera: Camera): void {
    this.three.render(scene, camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.three.dispose();
    this.three.domElement.remove();
  }

  private readonly resize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.three.setSize(width, height, false);
    if (this.camera) {
      this.camera.aspect = width / Math.max(height, 1);
      this.camera.updateProjectionMatrix();
    }
  };
}
