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
import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/StateMachine';
import { palette } from '../render/palette';
import { el } from '../ui/dom';
import { pausePanel } from '../ui/menus/PausePanel';
import { placeAtStart } from './flow';

/** Orbit speed in radians per second. */
const ORBIT_SPEED = 1.2;
const ORBIT_RADIUS = 2.5;
/** Spin speed in radians per second. */
const SPIN_SPEED = 0.8;

/**
 * The world. Until the player and open world arrive (steps 1.6 and 1.7) this shows the test
 * scene from step 1.2: a cube orbiting on the fixed 60 Hz simulation, drawn interpolated.
 * It already does what the real world scene must: place a new game at the start point,
 * count play time, pause (Escape, the pause button, or when the app goes to the background)
 * and save.
 */
export class WorldState implements GameState {
  private scene: Scene | null = null;
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 100);
  private cube: Mesh<BoxGeometry, MeshStandardMaterial> | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private paused = false;

  // Simulation state: current and previous step, for interpolation.
  private angle = 0;
  private prevAngle = 0;
  private spin = 0;
  private prevSpin = 0;

  constructor(private readonly ctx: GameContext) {
    this.camera.position.set(0, 5, 7);
    this.camera.lookAt(0, 0, 0);
  }

  enter(): void {
    const { ctx } = this;
    const session = ctx.session;
    if (session && ctx.data) {
      const isNew = session.world.zone === null;
      placeAtStart(session, ctx.data);
      // Waking up in a zone counts as entering it (autosave).
      if (isNew && session.world.zone)
        ctx.events.emit('zoneEntered', { zoneId: session.world.zone });
    }

    this.buildScene();
    ctx.renderer.setCamera(this.camera);
    this.paused = false;

    const t = ctx.i18n.t.bind(ctx.i18n);
    this.pauseButton = el('button', {
      className: 'ui-pause-button',
      text: 'II',
      attrs: { type: 'button', 'aria-label': t('pause.title') },
      onClick: () => this.pause(),
    });
    ctx.ui.append(this.pauseButton);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.ctx.overlays.closeAll();
    this.pauseButton?.remove();
    this.pauseButton = null;
    this.ctx.persist();
    this.ctx.renderer.setCamera(null);
    this.disposeScene();
  }

  update(dt: number): void {
    if (this.paused) return;
    if (this.ctx.session) this.ctx.session.playTimeSeconds += dt;
    this.prevAngle = this.angle;
    this.prevSpin = this.spin;
    this.angle += ORBIT_SPEED * dt;
    this.spin += SPIN_SPEED * dt;
  }

  render(alpha: number): void {
    if (!this.scene || !this.cube) return;
    // While paused the simulation stands still, so draw the last state without interpolating.
    const a = this.paused ? 1 : alpha;
    const angle = this.prevAngle + (this.angle - this.prevAngle) * a;
    const spin = this.prevSpin + (this.spin - this.prevSpin) * a;
    this.cube.position.set(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS);
    this.cube.rotation.set(spin * 0.6, spin, 0);
    this.ctx.renderer.render(this.scene, this.camera);
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.ctx.persist();
    this.ctx.overlays.open(pausePanel(this.ctx, () => (this.paused = false)));
  }

  private buildScene(): void {
    const scene = new Scene();
    scene.fog = new Fog(palette.mistpaars, 8, 22);
    scene.add(new AmbientLight(palette.schemerviolet, 1.5));
    const sun = new DirectionalLight(palette.zonsondergang, 2.5);
    sun.position.set(3, 5, 2);
    scene.add(sun);

    const ground = new Mesh(
      new CircleGeometry(4, 48),
      new MeshStandardMaterial({ color: palette.steengrijs }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    scene.add(ground);

    this.cube = new Mesh(
      new BoxGeometry(0.8, 0.8, 0.8),
      new MeshStandardMaterial({ color: palette.lantaarnamber }),
    );
    scene.add(this.cube);
    this.scene = scene;
  }

  private disposeScene(): void {
    this.scene?.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as MeshStandardMaterial).dispose();
      }
    });
    this.scene?.clear();
    this.scene = null;
    this.cube = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Overlays close themselves on Escape first; only an Escape with nothing open pauses.
    if (event.code === 'Escape' && !this.ctx.overlays.isOpen) {
      event.preventDefault();
      this.pause();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.pause();
  };
}
