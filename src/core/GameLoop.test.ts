import { describe, expect, it } from 'vitest';
import { GameLoop } from './GameLoop';

function simulate(displayHz: number, frameCap: number, seconds: number) {
  let updates = 0;
  let renders = 0;
  const loop = new GameLoop({
    update: () => updates++,
    render: () => renders++,
  });
  loop.frameCap = frameCap;
  const frameMs = 1000 / displayHz;
  for (let i = 0; i <= displayHz * seconds; i++) loop.tick(i * frameMs);
  return { updates, renders };
}

describe('GameLoop', () => {
  it('simulates the same amount at 60 Hz and 120 Hz displays', () => {
    const at60 = simulate(60, 0, 5);
    const at120 = simulate(120, 0, 5);
    expect(at60.updates).toBe(300);
    expect(at120.updates).toBe(300);
    expect(at120.renders).toBe(2 * at60.renders - 1);
  });

  it('a 60 fps cap on a 120 Hz display renders every other frame', () => {
    const capped = simulate(120, 60, 5);
    expect(capped.updates).toBe(300);
    expect(capped.renders).toBe(301);
  });

  it('a 30 fps cap keeps game speed unchanged', () => {
    const capped = simulate(60, 30, 5);
    expect(capped.updates).toBe(300);
    expect(capped.renders).toBe(151);
  });
});
