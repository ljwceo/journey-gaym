import {
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  type InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import type { GameContext } from '../core/GameContext';
import { Input, type LookDelta } from '../core/Input';
import type { GameState } from '../core/StateMachine';
import type { GameData } from '../data/types';
import { Player } from '../entities/Player';
import { CameraRig } from '../render/CameraRig';
import { palette, resolveColorToken, terrainColors } from '../render/palette';
import { CollisionWorld } from '../systems/Collision';
import {
  type MoveCommand,
  type MovementConfig,
  movementConfig,
  screenToWorld,
  stepMovement,
} from '../systems/Movement';
import { el } from '../ui/dom';
import { pausePanel } from '../ui/menus/PausePanel';
import { TouchControls } from '../ui/TouchControls';
import { flatGround } from '../world/Ground';
import { emptyBox, shapeBounds } from '../world/Shapes';
import { SpatialHash } from '../world/SpatialHash';
import { buildTestCourse } from '../world/TestCourse';
import { normalizeAppearance } from './creator';
import { placeAtStart } from './flow';

const DEG = Math.PI / 180;
/** Size (m) of the 4 m grid around the spawn point: one cell per second of walking. */
const GRID_SIZE = 240;
const GRID_CELL = 4;
const DEBUG_REFRESH_MS = 250;
/** Debug overlay lines this scene owns (removed again on exit). */
const DEBUG_KEYS = ['pos', 'energy', 'camera'] as const;

/**
 * The world (step 1.6): the player walks on a flat test floor in Greyhaven with a few test
 * obstacles, followed by the third-person camera. Zones, chunks and terrain arrive in step 1.7.
 *
 * Simulation (fixed 60 Hz): input → walking direction → Movement + collision → save position.
 * Rendering (every frame): interpolated player, camera smoothing, touch controls.
 * It also places a new game at the start point, counts play time, pauses (Escape, the pause
 * button, or when the app goes to the background) and saves.
 */
export class WorldState implements GameState {
  private scene: Scene | null = null;
  private rig: CameraRig | null = null;
  private player: Player | null = null;
  private collision: CollisionWorld | null = null;
  private input: Input | null = null;
  private touch: TouchControls | null = null;
  private surface: HTMLElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private lookHint: HTMLElement | null = null;
  private lookHintShown = false;
  private movement: MovementConfig | null = null;
  private paused = false;
  private debugTimer = 0;
  private readonly unsubscribe: (() => void)[] = [];

  // Reused every step / frame (no allocations in the game loop).
  private readonly moveInput = { x: 0, y: 0 };
  private readonly moveWorld = { x: 0, z: 0 };
  private readonly command: MoveCommand = { x: 0, z: 0, dash: false };
  private readonly look: LookDelta = { yaw: 0, pitch: 0, zoom: 1 };

  constructor(private readonly ctx: GameContext) {}

  enter(): void {
    const { ctx } = this;
    const session = ctx.session;
    const data = ctx.data;
    if (!session || !data) {
      ctx.goto('title');
      return;
    }
    const isNew = session.world.zone === null;
    placeAtStart(session, data);
    // Waking up in a zone counts as entering it (autosave).
    if (isNew && session.world.zone) ctx.events.emit('zoneEntered', { zoneId: session.world.zone });

    const t = ctx.i18n.t.bind(ctx.i18n);
    this.movement = movementConfig(data.player);

    // Input surface first, so the pause button and touch buttons lie on top of it.
    this.surface = el('div', { className: 'ui-world-input' });
    ctx.ui.append(this.surface);
    const camera = data.player.camera;
    const controls = data.player.controls;
    this.input = new Input(this.surface, {
      joystickRadiusPx: controls.joystickRadiusPx,
      joystickDeadZone: controls.joystickDeadZone,
      rotateRadiansPerPixelMouse: camera.rotateRadiansPerPixelMouse,
      rotateRadiansPerPixelTouch: camera.rotateRadiansPerPixelTouch,
      zoomStepPerWheelNotch: camera.zoomStepPerWheelNotch,
    });
    this.input.attach();
    // Escape releases the mouse (the browser does that itself); treat it like pausing.
    this.input.onPointerLockLost = () => this.pause();
    this.touch = new TouchControls(this.input, t('controls.dash'), controls.joystickRadiusPx);
    ctx.ui.append(this.touch.root);

    this.buildScene(data);
    this.paused = false;

    this.pauseButton = el('button', {
      className: 'ui-pause-button',
      text: 'II',
      attrs: { type: 'button', 'aria-label': t('pause.title') },
      onClick: () => this.pause(),
    });
    ctx.ui.append(this.pauseButton);
    // Mouse only: "click to look around" until the mouse is captured.
    this.lookHint = el('div', { className: 'ui-look-hint', text: t('controls.clickToLook') });
    this.lookHintShown = false;
    ctx.ui.append(this.lookHint);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.unsubscribe.push(
      ctx.events.on('languageChanged', () => {
        const label = ctx.i18n.t('controls.dash');
        this.touch?.setDashLabel(label);
        this.pauseButton?.setAttribute('aria-label', ctx.i18n.t('pause.title'));
        if (this.lookHint) this.lookHint.textContent = ctx.i18n.t('controls.clickToLook');
      }),
    );
    this.debugTimer = window.setInterval(this.updateDebugLines, DEBUG_REFRESH_MS);
  }

  exit(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.clearInterval(this.debugTimer);
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    for (const key of DEBUG_KEYS) this.ctx.debug.lines.delete(key);
    this.ctx.overlays.closeAll();
    this.syncSave();
    this.ctx.persist();
    this.input?.detach();
    this.input = null;
    this.touch?.dispose();
    this.touch = null;
    this.surface?.remove();
    this.surface = null;
    this.pauseButton?.remove();
    this.pauseButton = null;
    this.lookHint?.remove();
    this.lookHint = null;
    this.ctx.renderer.setCamera(null);
    this.disposeScene();
  }

  update(dt: number): void {
    const { player, input, collision, movement, rig } = this;
    if (this.paused || !player || !input || !collision || !movement || !rig) return;
    const session = this.ctx.session;
    if (session) session.playTimeSeconds += dt;

    input.getMoveVector(this.moveInput);
    // Walking is relative to where the camera looks (W = away from the camera).
    screenToWorld(this.moveInput.x, this.moveInput.y, rig.orbit.yaw, this.moveWorld);
    this.command.x = this.moveWorld.x;
    this.command.z = this.moveWorld.z;
    this.command.dash = input.consumePressed('dash');
    // Interaction (E / tap) is read here once NPCs exist (step 1.9).
    input.consumePressed('interact');

    player.beginStep();
    stepMovement(player.state, this.command, movement, dt, collision);
    this.syncSave();
  }

  render(alpha: number, frameSeconds: number): void {
    const { scene, rig, player, input } = this;
    if (!scene || !rig || !player || !input) return;
    // While paused the simulation stands still, so draw the last state without interpolating.
    const a = this.paused ? 1 : alpha;
    player.syncModel(a, flatGround);

    input.consumeLook(this.look);
    const look = this.look;
    const turning = input.turningCamera || look.yaw !== 0 || look.pitch !== 0;
    const root = player.model.root;
    rig.orbit.update(
      this.paused ? 0 : frameSeconds,
      root.position.x,
      root.position.y,
      root.position.z,
      player.state.heading,
      player.state.moving,
      look,
      turning,
      this.ctx.session?.settings.cameraSensitivity ?? 1,
    );
    rig.apply();
    this.touch?.update();
    this.updateLookHint(input);
    this.ctx.renderer.render(scene, rig.camera);
  }

  /** Shows "click to look around" on mouse devices while the mouse is not captured. */
  private updateLookHint(input: Input): void {
    const show = !this.paused && !input.usedTouch && !input.pointerLocked;
    if (show === this.lookHintShown || !this.lookHint) return;
    this.lookHintShown = show;
    this.lookHint.classList.toggle('ui-look-hint-visible', show);
  }

  /** Copies the player's position into the save (numbers only; no allocation). */
  private syncSave(): void {
    const world = this.ctx.session?.world;
    const player = this.player;
    if (!world || !player) return;
    if (world.position) {
      world.position.x = player.state.x;
      world.position.y = 0;
      world.position.z = player.state.z;
    } else {
      world.position = { x: player.state.x, y: 0, z: player.state.z };
    }
    world.heading = player.state.heading;
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.input?.releasePointerLock();
    this.input?.releaseAll();
    this.syncSave();
    this.ctx.persist();
    this.ctx.overlays.open(
      pausePanel(this.ctx, () => {
        // Keys pressed in the menus (Space, E) must not act once the game resumes.
        this.input?.releaseAll();
        this.paused = false;
        // "Resume" is a click, so the mouse can be captured again straight away.
        if (this.input && !this.input.usedTouch) this.input.requestPointerLock();
      }),
    );
  }

  private buildScene(data: GameData): void {
    const session = this.ctx.session;
    const zone = data.zones.zones.find((entry) => entry.id === session?.world.zone);
    const spawn = session?.world.position ?? { x: 0, y: 0, z: 0 };
    const fogColor = resolveColorToken(zone?.fogColor ?? data.zones.world.outsideZoneFog);
    const groundColor = resolveColorToken(zone?.terrainColor ?? data.zones.world.outsideZoneColor);
    const fogFar = this.fogFar(data);

    const scene = new Scene();
    scene.background = new Color(fogColor);
    scene.fog = new Fog(fogColor, fogFar * 0.35, fogFar);
    // Warm low sun, cool twilight sky (style guide L1–L3).
    scene.add(new HemisphereLight(palette.mistpaars, palette.schemerviolet, 1.8));
    const sun = new DirectionalLight(palette.zonsondergang, 2);
    sun.position.set(-2, 3, 1.5);
    scene.add(sun);

    // Flat test floor over the whole world (terrain and chunks come in step 1.7).
    const b = shapeBounds(data.zones.world.bounds, emptyBox());
    const width = b.maxX - b.minX;
    const depth = b.maxZ - b.minZ;
    const floor = new Mesh(
      new PlaneGeometry(width, depth),
      new MeshLambertMaterial({ color: groundColor }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(b.minX + width / 2, 0, b.minZ + depth / 2);
    scene.add(floor);
    const grid = new GridHelper(
      GRID_SIZE,
      GRID_SIZE / GRID_CELL,
      palette.schemerviolet,
      palette.mistpaars,
    );
    grid.position.set(
      Math.round(spawn.x / GRID_CELL) * GRID_CELL,
      0.01,
      Math.round(spawn.z / GRID_CELL) * GRID_CELL,
    );
    scene.add(grid);

    const hash = new SpatialHash(8);
    this.collision = new CollisionWorld(hash, b);
    const spawnPoint = zone?.spawnPoints[0];
    const course = buildTestCourse(
      spawnPoint?.x ?? spawn.x,
      spawnPoint?.z ?? spawn.z,
      terrainColors.zandsteen,
      palette.mistpaars,
    );
    for (const collider of course.colliders) hash.insert(collider);
    for (const mesh of course.meshes) scene.add(mesh);

    const appearance = normalizeAppearance(
      session?.character?.appearance ?? data.appearance.defaults,
      data.appearance,
    );
    const player = new Player(data.appearance, appearance);
    player.place(spawn.x, spawn.z, session?.world.heading ?? 0);
    // A save could put the player inside an obstacle (e.g. after the course changed).
    this.collision.resolve(player.state, data.player.movement.radius);
    player.place(player.state.x, player.state.z, player.state.heading);
    player.state.energy = data.player.base.energy;
    player.state.sinceEnergySpent = data.player.regen.energyDelaySeconds;
    scene.add(player.model.root);
    this.player = player;

    this.rig = new CameraRig(data.player.camera, fogFar + 20);
    this.rig.orbit.snap(player.state.x, 0, player.state.z, player.state.heading);
    this.rig.apply();
    this.ctx.renderer.setCamera(this.rig.camera);
    this.scene = scene;
  }

  /** View distance from the graphics preset (the QualityManager takes this over in step 1.10). */
  private fogFar(data: GameData): number {
    const settings = this.ctx.session?.settings;
    const id =
      settings && settings.quality !== 'auto'
        ? settings.quality
        : (settings?.autoQuality ?? data.quality.default);
    const preset = data.quality.presets.find((entry) => entry.id === id) ?? data.quality.presets[0];
    return preset?.fogFar ?? 200;
  }

  private disposeScene(): void {
    this.player?.dispose();
    this.player = null;
    this.scene?.traverse((object) => {
      if (object instanceof Mesh || object instanceof GridHelper) {
        object.geometry.dispose();
        const material = object.material as MeshLambertMaterial | MeshLambertMaterial[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
      if ((object as InstancedMesh).isInstancedMesh) (object as InstancedMesh).dispose();
    });
    this.scene?.clear();
    this.scene = null;
    this.rig = null;
    this.collision = null;
  }

  private readonly updateDebugLines = (): void => {
    const { player, rig } = this;
    const debug = this.ctx.debug;
    if (!debug.isVisible || !player || !rig) return;
    const s = player.state;
    const o = rig.orbit;
    debug.lines.set(
      'pos',
      `${s.x.toFixed(1)}, ${s.z.toFixed(1)} · heading ${Math.round(s.heading / DEG)}°` +
        (s.dashing ? ' · dash' : s.moving ? ' · walk' : ''),
    );
    debug.lines.set('energy', `${Math.round(s.energy)} · dash cd ${s.dashCooldown.toFixed(2)} s`);
    debug.lines.set(
      'camera',
      `yaw ${Math.round(o.yaw / DEG)}° pitch ${Math.round(o.pitch / DEG)}° dist ${o.distance.toFixed(1)} m · sens ${Math.round((this.ctx.session?.settings.cameraSensitivity ?? 1) * 100)}%`,
    );
  };

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
