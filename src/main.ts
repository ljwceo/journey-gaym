import { createEventBus } from './core/events';
import { GameLoop } from './core/GameLoop';
import { StateMachine } from './core/StateMachine';
import { loadDataFiles } from './data/DataLoader';
import { formatIssue, validateGameData } from './data/DataValidator';
import type { GameData } from './data/types';
import { detectLanguage, I18n, isLanguage, type Language } from './i18n/I18n';
import { DebugOverlay } from './render/DebugOverlay';
import { colorTokens } from './render/palette';
import { Renderer } from './render/Renderer';
import { AutoSave } from './save/AutoSave';
import type { SaveData } from './save/SaveData';
import { browserStorage, SaveManager } from './save/SaveManager';
import { DemoState } from './scenes/Demo';
import { SeasonService } from './services/SeasonService';
import './style.css';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app element');
}

const params = new URLSearchParams(window.location.search);
const events = createEventBus();
const renderer = new Renderer(container);

type StateId = 'demo';
const states = new StateMachine<StateId>((from, to) => events.emit('stateChanged', { from, to }));
states.register('demo', new DemoState(renderer));

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

// `?fps=30` caps the frame rate, to check that the game runs equally fast at any fps.
const fpsParam = Number(params.get('fps'));
if (fpsParam > 0) loop.frameCap = fpsParam;

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetClock();
});

/** Problems shown in red in debug mode; logged to the console in every build. */
const debugErrors: string[] = [];
function reportProblem(message: string): void {
  console.error(message);
  debugErrors.push(message);
  debugOverlay.setErrors(debugErrors);
}

const saves = new SaveManager(browserStorage());
const i18n = new I18n();
i18n.onMissing = (key, language) => {
  const message = `missing text "${key}" (${language})`;
  console.warn(message);
  debugErrors.push(message);
  debugOverlay.setErrors(debugErrors);
};

/** The save of the current session; null until the language is chosen (step 1.4). */
let session: SaveData | null = null;

async function boot(): Promise<void> {
  const loaded = saves.load();
  if (loaded.status === 'ok') session = loaded.save;
  if (loaded.status === 'corrupt') reportProblem('save: corrupt, backup kept');
  if (loaded.status === 'newer') reportProblem(`save: made by newer version ${loaded.version}`);
  if (!saves.available) reportProblem('save: localStorage unavailable');

  // `?lang=nl` forces a language (testing); otherwise the save, then the browser language.
  const langParam = params.get('lang');
  const language: Language = isLanguage(langParam)
    ? langParam
    : (session?.language ?? detectLanguage(navigator.language));

  const [raw] = await Promise.all([loadDataFiles(), i18n.setLanguage(language)]);
  const { data, issues } = validateGameData(raw, { textKeys: i18n.keys, colorTokens });
  for (const issue of issues) reportProblem(formatIssue(issue));
  if (issues.length > 0) reportProblem(i18n.t('boot.dataErrors', { count: issues.length }));

  if (data) startServices(data);
}

function startServices(data: GameData): void {
  const seasons = new SeasonService(data.seasons);
  const seasonParam = params.get('season');
  if (seasonParam && data.seasons.order.includes(seasonParam)) seasons.override = seasonParam;

  new AutoSave(saves, events, () => session);

  const lines = debugOverlay.lines;
  const updateLines = (): void => {
    const season = seasons.current();
    const ms = seasons.msUntilNext();
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    lines.set('lang', i18n.language);
    lines.set(
      'season',
      `${i18n.t(season.label)}${seasons.override ? ' (forced, F4)' : ''} · ` +
        i18n.t('season.nextIn', { days, hours }),
    );
    lines.set(
      'save',
      session ? `v${session.version}, ${session.character ? 'character' : 'no character'}` : 'none',
    );
    lines.set('data', `${Object.keys(data).length} files OK`);
  };
  updateLines();
  // Text lines allocate strings, so refresh them on a slow timer instead of every frame.
  window.setInterval(updateLines, 1000);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'F4' && debugOverlay.isVisible) {
      event.preventDefault();
      seasons.cycleOverride();
      updateLines();
    }
  });
}

states.change('demo');
states.applyPending();
loop.start();

boot().catch((error: unknown) => {
  reportProblem(
    `${i18n.t('boot.error')} (${error instanceof Error ? error.message : String(error)})`,
  );
});
