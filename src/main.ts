import { createEventBus } from './core/events';
import { GameLoop } from './core/GameLoop';
import { StateMachine } from './core/StateMachine';
import { DebugOverlay } from './render/DebugOverlay';
import { Renderer } from './render/Renderer';
import { DemoState } from './scenes/Demo';
import './style.css';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app element');
}

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

// `?fps=30` caps the frame rate, to check that the game runs equally fast at any fps.
const fpsParam = Number(new URLSearchParams(window.location.search).get('fps'));
if (fpsParam > 0) loop.frameCap = fpsParam;

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loop.resetClock();
});

states.change('demo');
states.applyPending();
loop.start();
