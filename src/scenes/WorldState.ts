import {
  type Camera,
  Color,
  Vector3,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import type { GameContext } from '../core/GameContext';
import { Input, type LookDelta } from '../core/Input';
import type { GameState } from '../core/StateMachine';
import type { GameData, QualityPreset } from '../data/types';
import { Player } from '../entities/Player';
import { PropLibrary } from '../entities/PropFactory';
import { CameraRig } from '../render/CameraRig';
import { colorTokens, palette, resolveColorToken } from '../render/palette';
import { Cheats, stepFlying } from '../systems/Cheats';
import { type Bounds, CollisionWorld } from '../systems/Collision';
import {
  type MoveCommand,
  type MovementConfig,
  movementConfig,
  screenToWorld,
  stepMovement,
} from '../systems/Movement';
import { CheatPanel } from '../ui/CheatPanel';
import { HUD } from '../ui/HUD';
import { StructureLabels } from '../ui/StructureLabels';
import { el } from '../ui/dom';
import { pausePanel } from '../ui/menus/PausePanel';
import { TouchControls } from '../ui/TouchControls';
import { Checkpoints, checkpointsOf } from '../world/Checkpoints';
import { ChunkDebug } from '../world/ChunkDebug';
import type { ConditionContext } from '../world/Conditions';
import { FloatingOrigin } from '../world/FloatingOrigin';
import { GroundedMover } from '../world/GroundedMover';
import type { InstanceHost } from '../world/Instances';
import { buildRiverWater } from '../world/RiverWater';
import { emptyBox, shapeBounds } from '../world/Shapes';
import { SpatialHash } from '../world/SpatialHash';
import { StructureLayer } from '../world/StructureLayer';
import { placeStructures } from '../world/StructurePlacement';
import { structureShape } from '../entities/StructureFactory';
import { buildWorldGenConfig } from '../world/terrainConfig';
import { TerrainField } from '../world/TerrainField';
import { Triggers } from '../world/Triggers';
import { type StreamerStats, WorldStreamer } from '../world/WorldStreamer';
import { ZoneLocator } from '../world/ZoneLocator';
import { normalizeAppearance } from './creator';
import type { Zone } from '../data/types';
import { placeAtStart } from './flow';

const DEG = Math.PI / 180;
const DEBUG_REFRESH_MS = 250;
/** Debug overlay lines this scene owns (removed again on exit). */
const DEBUG_KEYS = ['pos', 'zone', 'chunks', 'places', 'energy', 'camera', 'cheats'] as const;
/** Seconds over which fog and sky change color after entering another zone. */
const FOG_SHARPNESS = 1.5;
/** The interaction icon stays this far (CSS px) from the screen edges. */
const ICON_MARGIN = 60;
/** The sea plane is this many times the view distance wide (it follows the player). */
const WATER_SCALE = 3;

/**
 * The open world: terrain chunks stream in around the player from a Web Worker (WorldStreamer),
 * with the low-detail far map underneath, sea, rivers, fog and scattered props. Placeholder
 * buildings and landmarks (StructureLayer) come and go with the chunks they stand on.
 * Walking and dashing follow the ground (slope limit, deep water blocks); zone changes are
 * seamless, show the zone name and autosave. Triggers explain places on the first visit,
 * checkpoints are set by walking past them, and the city gate checks its condition.
 * A floating origin keeps drawing precise far from (0, 0).
 *
 * Simulation (fixed 60 Hz): input → walking direction → Movement + collision + ground →
 * gate → triggers, checkpoints, zone → save position. Rendering (every frame): streaming
 * budget, origin, interpolated player, camera (kept in front of walls), HUD. Debug mode adds
 * chunk info, building labels and a cheat menu (F6) for faster testing.
 */
export class WorldState implements GameState, InstanceHost {
  readonly currentInstance: string | null = null;

  private scene: Scene | null = null;
  private worldRoot: Group | null = null;
  private rig: CameraRig | null = null;
  private player: Player | null = null;
  private collision: CollisionWorld | null = null;
  private mover: GroundedMover | null = null;
  private streamer: WorldStreamer | null = null;
  private props: PropLibrary | null = null;
  private chunkDebug: ChunkDebug | null = null;
  private structures: StructureLayer | null = null;
  private labels: StructureLabels | null = null;
  private triggers: Triggers | null = null;
  private checkpoints: Checkpoints | null = null;
  private hud: HUD | null = null;
  /** True while the closed city gate holds the player back (the message shows once). */
  private gateBlocked = false;
  private readonly fogTarget = new Color();
  private readonly conditionContext: ConditionContext = { level: 1, completedQuests: new Set() };
  private readonly placesInside: string[] = [];
  private readonly labelPoint = new Vector3();
  private water: Mesh | null = null;
  private origin: FloatingOrigin | null = null;
  private zones: ZoneLocator | null = null;
  private worldBounds: Bounds | null = null;
  private input: Input | null = null;
  private touch: TouchControls | null = null;
  private cheatPanel: CheatPanel | null = null;
  private readonly cheats = new Cheats();
  private surface: HTMLElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private lookHint: HTMLElement | null = null;
  private lookHintShown = false;
  /** Phones and tablets: no "click to look around" hint (there is no mouse). */
  private coarsePointer = false;
  private movement: MovementConfig | null = null;
  private baseWalkSpeed = 0;
  private preset: QualityPreset | null = null;
  private paused = false;
  private debugTimer = 0;
  private readonly unsubscribe: (() => void)[] = [];

  // Reused every step / frame (no allocations in the game loop).
  private readonly moveInput = { x: 0, y: 0 };
  private readonly moveWorld = { x: 0, z: 0 };
  private readonly command: MoveCommand = { x: 0, z: 0, dash: false };
  private readonly look: LookDelta = { yaw: 0, pitch: 0, zoom: 1 };
  private readonly stats: StreamerStats = {
    near: 0,
    far: 0,
    loading: 0,
    workerMs: 0,
    applyMsMax: 0,
    colliders: 0,
  };

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
    this.baseWalkSpeed = this.movement.walkSpeed;
    this.cheats.reset();

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
    this.gateBlocked = false;
    if (this.labels) ctx.ui.append(this.labels.root);
    this.hud = new HUD(data.player.hud, data.player.lowHpThreshold, () => this.interact());
    ctx.ui.append(this.hud.root);
    this.showZoneName(session.world.zone);

    this.cheatPanel = new CheatPanel(
      ctx,
      this.cheats,
      data.zones.zones.map((zone) => ({ id: zone.id, name: zone.name })),
      this.input,
      { teleport: (zoneId) => this.teleport(zoneId), changed: () => this.applyCheats() },
    );
    // Next to the UI layer (not inside it), so it can sit above the debug overlay.
    (ctx.ui.parentElement ?? ctx.ui).append(this.cheatPanel.root);
    this.cheatPanel.setDebugVisible(ctx.debug.isVisible);

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
    this.coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    ctx.ui.append(this.lookHint);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.unsubscribe.push(
      ctx.events.on('languageChanged', () => {
        const label = ctx.i18n.t('controls.dash');
        this.touch?.setDashLabel(label);
        this.pauseButton?.setAttribute('aria-label', ctx.i18n.t('pause.title'));
        if (this.lookHint) this.lookHint.textContent = ctx.i18n.t('controls.clickToLook');
        this.cheatPanel?.updateTexts();
      }),
      // A new graphics preset changes the view distance and the chunk rings right away.
      ctx.events.on('settingsChanged', () => this.applyPreset()),
      // Hooks for later: music per zone listens to the same event.
      ctx.events.on('zoneEntered', ({ zoneId }) => this.showZoneName(zoneId)),
      ctx.events.on('placeFirstVisited', ({ triggerId }) => {
        const def = this.triggers?.defs.find((trigger) => trigger.id === triggerId);
        if (def?.firstVisitText) this.hud?.showMessage(ctx.i18n.t(def.firstVisitText));
      }),
      ctx.events.on('checkpointSet', () => this.hud?.showMessage(ctx.i18n.t('hud.checkpointSet'))),
    );
    this.debugTimer = window.setInterval(this.updateDebug, DEBUG_REFRESH_MS);
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
    this.cheatPanel?.dispose();
    this.cheatPanel = null;
    this.cheats.reset();
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
    this.hud?.dispose();
    this.hud = null;
    this.labels?.dispose();
    this.labels = null;
    this.ctx.renderer.setCamera(null);
    this.disposeScene();
  }

  update(dt: number): void {
    const { player, input, mover, movement, rig, streamer } = this;
    if (this.paused || !player || !input || !mover || !movement || !rig || !streamer) return;
    const session = this.ctx.session;
    if (session) session.playTimeSeconds += dt;

    input.getMoveVector(this.moveInput);
    // Walking is relative to where the camera looks (W = away from the camera).
    screenToWorld(this.moveInput.x, this.moveInput.y, rig.orbit.yaw, this.moveWorld);
    this.command.x = this.moveWorld.x;
    this.command.z = this.moveWorld.z;
    // Interaction: E (or tapping the icon) at a checkpoint; NPCs join in step 1.9.
    if (input.consumePressed('interact')) this.interact();

    player.beginStep();
    const s = player.state;
    const fromX = s.x;
    const fromZ = s.z;
    if (this.cheats.fly) {
      // Debug cheat: Space / ▲ up, Shift / ▼ down, through walls.
      input.consumePressed('dash');
      this.command.dash = false;
      const vertical = (input.isPressed('dash') ? 1 : 0) - (input.isPressed('down') ? 1 : 0);
      stepFlying(
        s,
        this.command,
        vertical,
        this.baseWalkSpeed * this.cheats.speed,
        dt,
        this.groundHeight,
        this.worldBounds,
      );
    } else {
      this.command.dash = input.consumePressed('dash');
      stepMovement(s, this.command, movement, dt, mover);
      this.checkGate(fromX, fromZ);
      s.y = streamer.heightAt(s.x, s.z);
    }
    // Position first: entering a zone autosaves, and that save must have the new position.
    this.syncSave();
    this.checkZone();
    if (session) {
      this.triggers?.update(s.x, s.z, session.visitedPlaces);
      this.checkpoints?.update(s.x, s.z, session.world);
    }
    this.hud?.rules.setEnergyFraction(s.energy / movement.maxEnergy);
    this.hud?.setBar('energy', s.energy / movement.maxEnergy);
  }

  /** The closed city gate (condition false) holds the player back like a wall. */
  private checkGate(fromX: number, fromZ: number): void {
    const s = this.player?.state;
    if (!s || !this.triggers) return;
    const gate = this.triggers.blockingGate(s.x, s.z, this.conditionContext);
    if (!gate) {
      this.gateBlocked = false;
      return;
    }
    s.x = fromX;
    s.z = fromZ;
    s.dashTime = 0;
    if (!this.gateBlocked && gate.blockedText) {
      this.hud?.showMessage(this.ctx.i18n.t(gate.blockedText));
    }
    this.gateBlocked = true;
  }

  /** Instances (interiors, dungeons) come in a later phase; every entrance is still closed. */
  enterInstance(id: string): boolean {
    const exists = this.ctx.data?.zones.zones.some((zone) =>
      zone.instances.some((instance) => instance.id === id && instance.enabled),
    );
    if (exists) this.ctx.reportProblem(`Instance "${id}" is enabled but not built yet`);
    return false;
  }

  exitInstance(): void {
    // Nothing to leave yet: the player is always in the open world.
  }

  /** E or a tap on the icon: rest at a checkpoint (health and mana follow in phase 2). */
  private interact(): void {
    if (this.paused || !this.checkpoints?.near) return;
    this.hud?.showMessage(this.ctx.i18n.t('hud.rested'));
  }

  private showZoneName(zoneId: string | null): void {
    const zone = this.ctx.data?.zones.zones.find((entry: Zone) => entry.id === zoneId);
    if (!zone) return;
    this.hud?.showZone(zone.name);
    this.fogTarget.set(resolveColorToken(zone.fogColor));
  }

  render(alpha: number, frameSeconds: number): void {
    const { scene, rig, player, input, streamer, origin, worldRoot } = this;
    if (!scene || !rig || !player || !input || !streamer || !origin || !worldRoot) return;
    // While paused the simulation stands still, so draw the last state without interpolating.
    const a = this.paused ? 1 : alpha;
    const s = player.state;

    // Streaming: plan, request and build chunks within the frame budget.
    const dirX = s.moving ? Math.sin(s.heading) : 0;
    const dirZ = s.moving ? Math.cos(s.heading) : 0;
    streamer.update(s.x, s.z, dirX, dirZ);

    // Floating origin: the world is drawn shifted so the player stays near (0, 0, 0).
    origin.update(s.x, s.z);
    worldRoot.position.set(-origin.x, 0, -origin.z);

    player.syncModel(a);
    input.consumeLook(this.look);
    const look = this.look;
    const turning = input.turningCamera || look.yaw !== 0 || look.pitch !== 0;
    const root = player.model.root;
    rig.orbit.update(
      this.paused ? 0 : frameSeconds,
      root.position.x,
      root.position.y,
      root.position.z,
      s.heading,
      s.moving,
      look,
      turning,
      this.ctx.session?.settings.cameraSensitivity ?? 1,
    );
    rig.apply(origin.x, origin.z, streamer, this.structures ?? undefined);
    // The sea follows the player (one plane, always under the view).
    this.water?.position.set(root.position.x, this.water.position.y, root.position.z);
    this.touch?.update();
    this.updateLookHint(input);
    this.updateFog(scene, frameSeconds);
    this.updateInteraction(rig.camera, origin.x, origin.z, input.usedTouch || this.coarsePointer);
    this.labels?.update(
      this.ctx.debug.isVisible,
      rig.camera,
      window.innerWidth,
      window.innerHeight,
      origin.x,
      origin.z,
      s.x,
      s.z,
    );
    this.hud?.update(frameSeconds);
    this.ctx.renderer.render(scene, rig.camera);
  }

  /** Fog and sky drift towards the color of the zone you are in. */
  private updateFog(scene: Scene, seconds: number): void {
    const fog = scene.fog as Fog;
    const amount = 1 - Math.exp(-FOG_SHARPNESS * seconds);
    fog.color.lerp(this.fogTarget, amount);
    (scene.background as Color).copy(fog.color);
  }

  /** The interaction icon above the checkpoint you stand at (projected to the screen). */
  private updateInteraction(
    camera: Camera,
    originX: number,
    originZ: number,
    touch: boolean,
  ): void {
    const hud = this.hud;
    const near = this.checkpoints?.near;
    const data = this.ctx.data;
    if (!hud) return;
    if (!near || !data || this.paused || !this.streamer) {
      hud.setInteraction(null, 0, 0, false);
      return;
    }
    const y = this.streamer.heightAt(near.x, near.z) + data.player.hud.interactHeight;
    const p = this.labelPoint.set(near.x - originX, y, near.z - originZ).project(camera);
    if (p.z > 1) {
      hud.setInteraction(null, 0, 0, false);
      return;
    }
    // Kept on screen (and in the upper half, away from the joystick and buttons), so it can
    // always be tapped.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = Math.min(w - ICON_MARGIN, Math.max(ICON_MARGIN, ((p.x + 1) / 2) * w));
    const sy = Math.min(h * 0.5, Math.max(ICON_MARGIN * 2, ((1 - p.y) / 2) * h));
    hud.setInteraction(this.ctx.i18n.t('hud.rest'), x, sy, !touch);
  }

  private readonly groundHeight = (x: number, z: number): number =>
    this.streamer ? this.streamer.heightAt(x, z) : 0;

  /** Seamless zone change: remember the zone and announce it (autosave, later name banner). */
  private checkZone(): void {
    const session = this.ctx.session;
    const player = this.player;
    if (!session || !player || !this.zones) return;
    const zone = this.zones.zoneAt(player.state.x, player.state.z);
    // Over the open sea (flying) there is no zone; keep the last one.
    if (!zone || zone.id === session.world.zone) return;
    session.world.zone = zone.id;
    this.ctx.events.emit('zoneEntered', { zoneId: zone.id });
  }

  /** Shows "click to look around" on mouse devices while the mouse is not captured. */
  private updateLookHint(input: Input): void {
    const show = !this.paused && !input.usedTouch && !input.pointerLocked && !this.coarsePointer;
    if (show === this.lookHintShown || !this.lookHint) return;
    this.lookHintShown = show;
    this.lookHint.classList.toggle('ui-look-hint-visible', show);
  }

  /** Copies the player's position into the save (numbers only; no allocation). */
  private syncSave(): void {
    const world = this.ctx.session?.world;
    const player = this.player;
    if (!world || !player) return;
    const s = player.state;
    if (world.position) {
      world.position.x = s.x;
      world.position.y = s.y;
      world.position.z = s.z;
    } else {
      world.position = { x: s.x, y: s.y, z: s.z };
    }
    world.heading = s.heading;
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.input?.releasePointerLock();
    this.input?.releaseAll();
    this.hud?.setInteraction(null, 0, 0, false);
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

  // ------------------------------------------------------------ cheats (debug only)

  /** Applies the cheat settings: walking speed, landing after flying, chunk borders. */
  private applyCheats(): void {
    const { movement, player, streamer, collision } = this;
    if (movement) movement.walkSpeed = this.baseWalkSpeed * this.cheats.speed;
    if (player && streamer && collision && !this.cheats.fly) {
      // Landing: back on the ground, pushed out of anything we flew into.
      collision.resolve(player.state, movement?.radius ?? 0.4);
      player.state.y = streamer.heightAt(player.state.x, player.state.z);
    }
    this.input?.releaseAll();
    if (this.chunkDebug) {
      this.chunkDebug.lines.visible = this.cheats.chunkLines;
      if (this.cheats.chunkLines) this.chunkDebug.refresh();
    }
  }

  /** Teleports to the first spawn point of a zone (debug cheat menu). */
  private teleport(zoneId: string): void {
    const data = this.ctx.data;
    const zone = data?.zones.zones.find((entry) => entry.id === zoneId);
    const spawn = zone?.spawnPoints[0];
    const { player, streamer, collision, rig, origin } = this;
    if (!zone || !spawn || !player || !streamer || !collision || !rig || !origin || !data) return;
    player.place(spawn.x, streamer.heightAt(spawn.x, spawn.z), spawn.z, player.state.heading);
    collision.resolve(player.state, data.player.movement.radius);
    player.state.y = streamer.heightAt(player.state.x, player.state.z);
    player.place(player.state.x, player.state.y, player.state.z, player.state.heading);
    origin.reset(player.state.x, player.state.z);
    rig.orbit.snap(player.state.x, player.state.y, player.state.z, rig.orbit.yaw);
    this.syncSave();
    this.checkZone();
  }

  // ------------------------------------------------------------ scene

  private buildScene(data: GameData): void {
    const session = this.ctx.session;
    const zone = data.zones.zones.find((entry) => entry.id === session?.world.zone);
    const spawn = session?.world.position ?? { x: 0, y: 0, z: 0 };
    const preset = this.activePreset(data);
    this.preset = preset;
    const fogColor = resolveColorToken(zone?.fogColor ?? data.zones.world.outsideZoneFog);

    const scene = new Scene();
    scene.background = new Color(fogColor);
    scene.fog = new Fog(fogColor, preset.fogFar * 0.35, preset.fogFar);
    // Warm low sun, cool twilight sky (style guide L1–L3).
    scene.add(new HemisphereLight(palette.mistpaars, palette.schemerviolet, 1.8));
    const sun = new DirectionalLight(palette.zonsondergang, 2);
    sun.position.set(-2, 3, 1.5);
    scene.add(sun);
    // Everything with world coordinates hangs under this group (shifted by the floating origin).
    const worldRoot = new Group();
    worldRoot.name = 'world';
    scene.add(worldRoot);

    const world = data.zones.world;
    const b = shapeBounds(world.bounds, emptyBox());
    this.worldBounds = b;
    const hash = new SpatialHash(8);
    this.collision = new CollisionWorld(hash, b);
    this.zones = new ZoneLocator(data.zones.zones);
    this.origin = new FloatingOrigin(world.originShiftDistance, world.chunkSize);
    this.origin.reset(spawn.x, spawn.z);

    // Terrain: the same TerrainField runs in the worker (meshes) and here (unloaded ground).
    const genConfig = buildWorldGenConfig(data.zones, resolveColorToken, preset.density.props);
    const field = new TerrainField(genConfig.terrain);
    this.props = new PropLibrary(world.props.map((prop) => prop.model));
    const placed = placeStructures(
      data.zones.zones,
      (x, z) => field.heightAt(x, z),
      structureShape,
      world.chunkSize,
      world.terrain.structureSink,
    );
    this.structures = new StructureLayer(placed, worldRoot, hash, resolveColorToken);
    this.labels = new StructureLabels(this.structures);
    this.triggers = new Triggers(data.triggers.triggers, data.triggers.conditions, this.ctx.events);
    this.checkpoints = new Checkpoints(checkpointsOf(data.zones.zones), this.ctx.events);
    this.fogTarget.set(fogColor);
    this.streamer = new WorldStreamer({
      config: genConfig,
      field,
      root: worldRoot,
      hash,
      props: this.props,
      propColliders: world.props.map((prop) => prop.colliderRadius),
      rings: preset.chunkRings,
      createWorker: () =>
        new Worker(new URL('../workers/terrain.worker.ts', import.meta.url), { type: 'module' }),
      listener: this.structures,
    });
    this.mover = new GroundedMover(this.collision, this.streamer, {
      maxRise: Math.tan(data.player.movement.slopeLimitDegrees * DEG),
      minHeight: world.terrain.seaLevel - world.terrain.deepWater,
    });

    const water = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshLambertMaterial({ color: colorTokens.get('zeewater') ?? palette.nachtinkt }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = world.terrain.seaLevel;
    water.scale.set(preset.fogFar * WATER_SCALE, preset.fogFar * WATER_SCALE, 1);
    water.name = 'sea';
    worldRoot.add(water);
    this.water = water;

    const rivers = buildRiverWater(
      field,
      genConfig.terrain.rivers,
      world.terrain.riverWaterDrop,
      colorTokens.get('zeewater') ?? palette.nachtinkt,
    );
    if (rivers) worldRoot.add(rivers);

    const maxUnload = Math.max(...data.quality.presets.map((entry) => entry.chunkRings.unload));
    this.chunkDebug = new ChunkDebug(this.streamer, (maxUnload * 2 + 1) ** 2);
    this.chunkDebug.lines.visible = false;
    worldRoot.add(this.chunkDebug.lines);

    const appearance = normalizeAppearance(
      session?.character?.appearance ?? data.appearance.defaults,
      data.appearance,
    );
    const player = new Player(data.appearance, appearance);
    player.place(spawn.x, 0, spawn.z, session?.world.heading ?? 0);
    // A save could put the player inside an obstacle (e.g. after the course changed).
    this.collision.resolve(player.state, data.player.movement.radius);
    player.place(
      player.state.x,
      field.heightAt(player.state.x, player.state.z),
      player.state.z,
      player.state.heading,
    );
    player.state.energy = data.player.base.energy;
    player.state.sinceEnergySpent = data.player.regen.energyDelaySeconds;
    worldRoot.add(player.model.root);
    this.player = player;

    this.rig = new CameraRig(data.player.camera, preset.fogFar + 20);
    this.rig.orbit.snap(player.state.x, player.state.y, player.state.z, player.state.heading);
    this.rig.apply(this.origin.x, this.origin.z, this.streamer, this.structures);
    this.ctx.renderer.setCamera(this.rig.camera);
    this.worldRoot = worldRoot;
    this.scene = scene;
  }

  /** The graphics preset in use (the QualityManager takes this over in step 1.10). */
  private activePreset(data: GameData): QualityPreset {
    const settings = this.ctx.session?.settings;
    const id =
      settings && settings.quality !== 'auto'
        ? settings.quality
        : (settings?.autoQuality ?? data.quality.default);
    const preset = data.quality.presets.find((entry) => entry.id === id) ?? data.quality.presets[0];
    if (!preset) throw new Error('quality.json has no presets');
    return preset;
  }

  /** Applies a changed graphics preset: fog, view distance, chunk rings. */
  private applyPreset(): void {
    const data = this.ctx.data;
    if (!data || !this.scene || !this.rig || !this.streamer) return;
    const preset = this.activePreset(data);
    if (preset === this.preset) return;
    this.preset = preset;
    const fog = this.scene.fog as Fog;
    fog.near = preset.fogFar * 0.35;
    fog.far = preset.fogFar;
    this.rig.camera.far = preset.fogFar + 20;
    this.rig.camera.updateProjectionMatrix();
    this.water?.scale.set(preset.fogFar * WATER_SCALE, preset.fogFar * WATER_SCALE, 1);
    this.streamer.setRings(preset.chunkRings);
  }

  private disposeScene(): void {
    this.player?.dispose();
    this.player = null;
    this.chunkDebug?.dispose();
    this.chunkDebug = null;
    // The streamer first: unloading its chunks also takes the structures away.
    this.streamer?.dispose();
    this.streamer = null;
    this.structures?.dispose();
    this.structures = null;
    this.props?.dispose();
    this.props = null;
    // What is left: the rivers, the sea and the lights.
    this.scene?.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const material = object.material as MeshLambertMaterial | MeshLambertMaterial[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
      if (object instanceof InstancedMesh) object.dispose();
    });
    this.scene?.clear();
    this.scene = null;
    this.worldRoot = null;
    this.water = null;
    this.triggers = null;
    this.checkpoints = null;
    this.rig = null;
    this.collision = null;
    this.mover = null;
    this.origin = null;
    this.zones = null;
    this.preset = null;
  }

  private readonly updateDebug = (): void => {
    const debug = this.ctx.debug;
    this.cheatPanel?.setDebugVisible(debug.isVisible);
    this.cheatPanel?.sync();
    const { player, rig, streamer, origin } = this;
    if (this.cheats.chunkLines) this.chunkDebug?.refresh();
    if (!debug.isVisible || !player || !rig || !streamer || !origin) return;
    const s = player.state;
    const o = rig.orbit;
    debug.lines.set(
      'pos',
      `${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)} · heading ${Math.round(s.heading / DEG)}°` +
        (this.cheats.fly ? ' · fly' : s.dashing ? ' · dash' : s.moving ? ' · walk' : ''),
    );
    debug.lines.set(
      'zone',
      `${this.ctx.session?.world.zone ?? '-'} · origin ${origin.x}, ${origin.z} (${origin.shifts} shifts)`,
    );
    const st = streamer.stats(this.stats);
    debug.lines.set(
      'chunks',
      `near ${st.near} far ${st.far} loading ${st.loading} · worker ${st.workerMs.toFixed(1)} ms · apply max ${st.applyMsMax.toFixed(1)} ms · colliders ${st.colliders} · ${this.preset?.id ?? '?'}`,
    );
    const near = this.checkpoints?.near;
    debug.lines.set(
      'places',
      `in ${this.triggers?.current(this.placesInside).join(', ') || '-'} · checkpoint ${this.ctx.session?.world.checkpoint ?? '-'}${near ? ' (here)' : ''} · structures ${this.structures?.active.length ?? 0} (${this.structures?.colliderCount ?? 0} colliders) · visited ${this.ctx.session?.visitedPlaces.length ?? 0}`,
    );
    debug.lines.set('energy', `${Math.round(s.energy)} · dash cd ${s.dashCooldown.toFixed(2)} s`);
    debug.lines.set(
      'camera',
      `yaw ${Math.round(o.yaw / DEG)}° pitch ${Math.round(o.pitch / DEG)}° dist ${o.distance.toFixed(1)} m · sens ${Math.round((this.ctx.session?.settings.cameraSensitivity ?? 1) * 100)}%`,
    );
    debug.lines.set(
      'cheats',
      `speed ${this.cheats.speed}× · fly ${this.cheats.fly ? 'on' : 'off'} · F6 = cheat menu`,
    );
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Overlays close themselves on Escape first; only an Escape with nothing open pauses.
    if (event.code === 'Escape' && !this.ctx.overlays.isOpen) {
      event.preventDefault();
      if (this.cheatPanel?.isOpen) {
        this.cheatPanel.toggle();
        return;
      }
      this.pause();
      return;
    }
    // F6: cheat menu (debug mode only). The mouse is released so the menu can be clicked.
    if (event.code === 'F6' && this.ctx.debug.isVisible && !this.paused) {
      event.preventDefault();
      this.cheatPanel?.setDebugVisible(true);
      if (!this.cheatPanel?.isOpen) this.input?.releasePointerLock();
      this.cheatPanel?.toggle();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.pause();
  };
}
