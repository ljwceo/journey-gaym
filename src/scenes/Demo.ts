import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from 'three';
import type { GameState } from '../core/StateMachine';
import { palette } from '../render/palette';
import type { Renderer } from '../render/Renderer';

/** Orbit speed in radians per second. */
const ORBIT_SPEED = 1.2;
const ORBIT_RADIUS = 2.5;
/** Spin speed in radians per second. */
const SPIN_SPEED = 0.8;

/**
 * Temporary test scene for step 1.2: a cube orbits on the fixed 60 Hz simulation and is drawn
 * interpolated, so it moves smoothly at any refresh rate. Replaced by the real scenes in step 1.4.
 */
export class DemoState implements GameState {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 100);
  private readonly cube: Mesh<BoxGeometry, MeshStandardMaterial>;
  private readonly ground: Mesh<CircleGeometry, MeshStandardMaterial>;

  // Simulation state: current and previous step, for interpolation.
  private angle = 0;
  private prevAngle = 0;
  private spin = 0;
  private prevSpin = 0;

  constructor(private readonly renderer: Renderer) {
    this.scene.fog = new Fog(palette.mistpaars, 8, 22);
    this.scene.add(new AmbientLight(palette.schemerviolet, 1.5));
    const sun = new DirectionalLight(palette.zonsondergang, 2.5);
    sun.position.set(3, 5, 2);
    this.scene.add(sun);

    this.ground = new Mesh(
      new CircleGeometry(4, 48),
      new MeshStandardMaterial({ color: palette.steengrijs }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.6;
    this.scene.add(this.ground);

    this.cube = new Mesh(
      new BoxGeometry(0.8, 0.8, 0.8),
      new MeshStandardMaterial({ color: palette.lantaarnamber }),
    );
    this.scene.add(this.cube);

    this.camera.position.set(0, 5, 7);
    this.camera.lookAt(0, 0, 0);
  }

  enter(): void {
    this.renderer.setCamera(this.camera);
  }

  exit(): void {
    this.renderer.setCamera(null);
    this.cube.geometry.dispose();
    this.cube.material.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.scene.clear();
  }

  update(dt: number): void {
    this.prevAngle = this.angle;
    this.prevSpin = this.spin;
    this.angle += ORBIT_SPEED * dt;
    this.spin += SPIN_SPEED * dt;
  }

  render(alpha: number): void {
    const angle = this.prevAngle + (this.angle - this.prevAngle) * alpha;
    const spin = this.prevSpin + (this.spin - this.prevSpin) * alpha;
    this.cube.position.set(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS);
    this.cube.rotation.set(spin * 0.6, spin, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
