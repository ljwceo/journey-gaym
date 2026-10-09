import { createEventBus } from './core/events';
import type { GameContext } from './core/GameContext';
import { GameLoop } from './core/GameLoop';
import { StateMachine } from './core/StateMachine';
import { I18n } from './i18n/I18n';
import { DebugOverlay } from './render/DebugOverlay';
import { Renderer } from './render/Renderer';
import { AutoSave } from './save/AutoSave';
import { browserStorage, SaveManager } from './save/SaveManager';
import { BootState } from './scenes/BootState';
import { frameCapFor, type StateId } from './scenes/flow';
import { IntroState } from './scenes/IntroState';
import { LanguageSelectState } from './scenes/LanguageSelectState';
import { TitleState } from './scenes/TitleState';
import { WorldState } from './scenes/WorldState';
import { el } from './ui/dom';
import { Overlays } from './ui/Overlays';
import './style.css';
import './ui/ui.css';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app element');
}

const params = new URLSearchParams(window.location.search);
const events = createEventBus();
const renderer = new Renderer(container);
const ui = el('div', { className: 'ui-layer' });
container.append(ui);

const states = new StateMachine<StateId>((from, to) => events.emit('stateChanged', { from, to }));

let debug: DebugOverlay | null = null;
const loop = new GameLoop({
  update: (dt) => states.update(dt),
  render: (alpha, frameSeconds) => {
    const start = performance.now();
    states.render(alpha, frameSeconds);
    debug?.frame(frameSeconds, loop.updateMs + performance.now() - start);
  },
});
debug = new DebugOverlay(container, renderer.three, loop.time, () => states.id);
const debugOverlay = debug;

/** Problems shown in red in debug mode; logged to the console in every build. */
const debugErrors: string[] = [];
function showInDebug(message: string): void {
  debugErrors.push(message);
  debugOverlay.setErrors(debugErrors);
}

const i18n = new I18n();
i18n.onMissing = (key, language) => {
  const message = `missing text "${key}" (${language})`;
  console.warn(message);
  showInDebug(message);
};
const saves = new SaveManager(browserStorage());

const ctx: GameContext = {
  renderer,
  events,
  loop,
  i18n,
  saves,
  debug: debugOverlay,
  ui,
  overlays: new Overlays(ui, events),
  params,
  data: null,
  seasons: null,
  session: null,
  goto: (state) => states.change(state),
  persist: () => (ctx.session ? saves.write(ctx.session) : false),
  reportProblem: (message) => {
    console.error(message);
    showInDebug(message);
  },
};

states
  .register('boot', new BootState(ctx))
  .register('language', new LanguageSelectState(ctx))
  .register('title', new TitleState(ctx))
  .register('intro', new IntroState(ctx))
  .register('world', new WorldState(ctx));

// `?fps=30` caps the frame rate, to check that the game runs equally fast at any fps.
const fpsParam = Number(params.get('fps'));
const debugParam = params.get('debug') === '1';

// Saved settings that take effect right away. Graphics presets follow in step 1.10.
events.on('settingsChanged', () => {
  const settings = ctx.session?.settings;
  loop.frameCap = frameCapFor(settings?.fpsCap ?? 'auto', fpsParam);
  if (settings && !debugParam) debugOverlay.setVisible(settings.debug);
});

events.on('languageChanged', ({ language }) => {
  document.documentElement.lang = language;
});

new AutoSave(saves, events, () => ctx.session);

// Debug lines: language, season, save. Text allocates, so refresh on a slow timer.
function updateDebugLines(): void {
  const lines = debugOverlay.lines;
  lines.set('lang', i18n.language);
  const seasons = ctx.seasons;
  if (seasons) {
    const ms = seasons.msUntilNext();
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    lines.set(
      'season',
      `${i18n.t(seasons.current().label)}${seasons.override ? ' (forced, F4)' : ''} · ` +
        i18n.t('season.nextIn', { days, hours }),
    );
  }
  const save = ctx.session;
  lines.set(
    'save',
    save
      ? `v${save.version}, ${save.world.zone ?? 'no zone'}, ${Math.floor(save.playTimeSeconds)} s, quality ${save.settings.quality}`
      : 'none',
  );
}
window.setInterval(updateDebugLines, 1000);

window.addEventListener('keydown', (event) => {
  if (event.code === 'F4' && debugOverlay.isVisible && ctx.seasons) {
    event.preventDefault();
    ctx.seasons.cycleOverride();
    updateDebugLines();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetClock();
});

states.change('boot');
states.applyPending();
loop.start();
