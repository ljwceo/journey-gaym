import { DirectionalLight, HemisphereLight, Scene } from 'three';
import type { GameContext } from '../core/GameContext';
import { Input, type LookDelta } from '../core/Input';
import type { GameState } from '../core/StateMachine';
import type { GameData, QualityPreset } from '../data/types';
import { Player } from '../entities/Player';
import { CameraRig } from '../render/CameraRig';
import { palette } from '../render/palette';
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
import { World } from '../world/World';
import { normalizeAppearance } from './creator';
import { placeAtStart } from './flow';

const DEG = Math.PI / 180;
const DEBUG_REFRESH_MS = 250;
/** Debug overlay lines this scene owns (removed again on exit). */
const DEBUG_KEYS = ['pos', 'zone', 'energy', 'camera', 'chunks'] as const;
/** The camera sees a little past the fog, so nothing pops at its far plane. */
const CAMERA_FAR_MARGIN = 20;

/**
 * The world: the player walks through the open world (terrain, zones, chunk streaming; see
 * world/World.ts), followed by the third-person camera.
 *
 * Simulation (fixed 60 Hz): input → walking direction → Movement + collision (with slopes and
 * deep water) → zone tracking → save position.
 * Rendering (every frame): streaming and floating origin, interpolated player, camera
 * smoothing, touch controls.
 * It also places a new game at the start point, counts play time, pauses (Escape, the pause
 * button, or when the app goes to the background) and saves.
 */
export class WorldState implements GameState {
  private scene: Scene | null = null;
  private rig: CameraRig | null = null;
  private player: Player | null = null;
  private world: World | null = null;
  private qualityId: string | null = null;
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
      ctx.events.on('settingsChanged', () => this.applyPreset()),
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
    const { player, input, world, movement, rig } = this;
    if (this.paused || !player || !input || !world || !movement || !rig) return;
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
    stepMovement(player.state, this.command, movement, dt, world.collision);
    this.syncSave();
    const entered = world.trackZone(player.state.x, player.state.z);
    if (entered) {
      if (session) session.world.zone = entered;
      // Autosave, and later the zone name, music and quests listen to this.
      this.ctx.events.emit('zoneEntered', { zoneId: entered });
    }
  }

  render(alpha: number, frameSeconds: number): void {
    const { scene, rig, player, input, world } = this;
    if (!scene || !rig || !player || !input || !world) return;
    // While paused the simulation stands still, so draw the last state without interpolating.
    const a = this.paused ? 1 : alpha;
    const x = player.interpolatedX(a);
    const z = player.interpolatedZ(a);
    const s = player.state;
    const dirX = s.moving ? Math.sin(s.heading) : 0;
    const dirZ = s.moving ? Math.cos(s.heading) : 0;
    world.frame(x, z, dirX, dirZ, frameSeconds, this.ctx.debug.isVisible);
    const origin = world.origin;
    player.syncModel(a, world.field, origin.x, origin.z);

    input.consumeLook(this.look);
    const look = this.look;
    const turning = input.turningCamera || look.yaw !== 0 || look.pitch !== 0;
    rig.orbit.update(
      this.paused ? 0 : frameSeconds,
      x,
      player.model.root.position.y,
      z,
      s.heading,
      s.moving,
      look,
      turning,
      this.ctx.session?.settings.cameraSensitivity ?? 1,
    );
    rig.apply(origin.x, origin.z, world.field);
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
    const y = this.world?.field.heightAt(player.state.x, player.state.z) ?? 0;
    if (world.position) {
      world.position.x = player.state.x;
      world.position.y = y;
      world.position.z = player.state.z;
    } else {
      world.position = { x: player.state.x, y, z: player.state.z };
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
    const spawn = session?.world.position ?? { x: 0, y: 0, z: 0 };
    const preset = this.preset(data);
    this.qualityId = preset.id;

    const scene = new Scene();
    // Warm low sun, cool twilight sky (style guide L1–L3).
    scene.add(new HemisphereLight(palette.mistpaars, palette.schemerviolet, 1.8));
    const sun = new DirectionalLight(palette.zonsondergang, 2);
    sun.position.set(-2, 3, 1.5);
    scene.add(sun);

    const world = new World(scene, data, preset, (message) => this.ctx.reportProblem(message));
    world.start(spawn.x, spawn.z);
    this.world = world;
    // The save names the zone; the ground decides (e.g. after zone borders moved in the data).
    if (session && world.currentZone) session.world.zone = world.currentZone;

    const appearance = normalizeAppearance(
      session?.character?.appearance ?? data.appearance.defaults,
      data.appearance,
    );
    const player = new Player(data.appearance, appearance);
    player.place(spawn.x, spawn.z, session?.world.heading ?? 0);
    // A save could put the player inside an obstacle (e.g. after the world data changed).
    world.collision.resolve(player.state, data.player.movement.radius);
    player.place(player.state.x, player.state.z, player.state.heading);
    player.state.energy = data.player.base.energy;
    player.state.sinceEnergySpent = data.player.regen.energyDelaySeconds;
    scene.add(player.model.root);
    this.player = player;

    this.rig = new CameraRig(data.player.camera, world.viewDistance + CAMERA_FAR_MARGIN);
    const groundY = world.field.heightAt(player.state.x, player.state.z);
    this.rig.orbit.snap(player.state.x, groundY, player.state.z, player.state.heading);
    this.rig.apply(world.origin.x, world.origin.z, world.field);
    this.ctx.renderer.setCamera(this.rig.camera);
    this.scene = scene;
  }

  /** The graphics preset in use (the QualityManager takes this over in step 1.10). */
  private preset(data: GameData): QualityPreset {
    const settings = this.ctx.session?.settings;
    const id =
      settings && settings.quality !== 'auto'
        ? settings.quality
        : (settings?.autoQuality ?? data.quality.default);
    const preset = data.quality.presets.find((entry) => entry.id === id) ?? data.quality.presets[0];
    if (!preset) throw new Error('quality.json has no presets');
    return preset;
  }

  /** Settings changed: a different graphics preset changes view distance and streaming. */
  private applyPreset(): void {
    const { world, rig, player } = this;
    const data = this.ctx.data;
    if (!world || !rig || !player || !data) return;
    const preset = this.preset(data);
    if (preset.id === this.qualityId) return;
    this.qualityId = preset.id;
    world.setPreset(preset, player.state.x, player.state.z);
    rig.camera.far = world.viewDistance + CAMERA_FAR_MARGIN;
    rig.camera.updateProjectionMatrix();
  }

  private disposeScene(): void {
    this.player?.dispose();
    this.player = null;
    this.world?.dispose();
    this.world = null;
    this.scene?.clear();
    this.scene = null;
    this.rig = null;
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
    const world = this.world;
    if (world) {
      const zone = world.currentZone ?? '-';
      const ground = world.field.heightAt(s.x, s.z);
      debug.lines.set(
        'zone',
        `${zone} · ground ${ground.toFixed(1)} m · quality ${this.qualityId}`,
      );
      debug.lines.set('chunks', world.debugLine());
    }
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
