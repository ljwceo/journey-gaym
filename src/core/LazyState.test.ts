import { describe, expect, it, vi } from 'vitest';
import { LazyState } from './LazyState';
import type { GameState } from './StateMachine';

function fakeState() {
  return { enter: vi.fn(), exit: vi.fn(), update: vi.fn(), render: vi.fn() } satisfies GameState;
}

describe('LazyState', () => {
  it('enters the real state once its code has loaded', async () => {
    const inner = fakeState();
    const lazy = new LazyState(() => Promise.resolve(inner), vi.fn());
    lazy.enter('title');
    lazy.update(1 / 60); // still loading: nothing happens
    expect(inner.update).not.toHaveBeenCalled();
    await lazy.preload();
    expect(inner.enter).toHaveBeenCalledWith('title');
    lazy.update(1 / 60);
    expect(inner.update).toHaveBeenCalledOnce();
    lazy.exit('title');
    expect(inner.exit).toHaveBeenCalledWith('title');
  });

  it('does not enter when the game left before the code arrived', async () => {
    const inner = fakeState();
    const lazy = new LazyState(() => Promise.resolve(inner), vi.fn());
    lazy.enter('title');
    lazy.exit('title');
    await lazy.preload();
    expect(inner.enter).not.toHaveBeenCalled();
    expect(inner.exit).not.toHaveBeenCalled();
  });

  it('loads only once, also when preloaded first', async () => {
    const load = vi.fn(() => Promise.resolve(fakeState()));
    const lazy = new LazyState(load, vi.fn());
    await lazy.preload();
    lazy.enter(null);
    lazy.exit('title');
    lazy.enter(null);
    expect(load).toHaveBeenCalledOnce();
  });

  it('reports a failed download and retries on the next enter', async () => {
    const onError = vi.fn();
    const inner = fakeState();
    const load = vi
      .fn<() => Promise<GameState>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(inner);
    const lazy = new LazyState(load, onError);
    lazy.enter(null);
    await lazy.preload();
    expect(onError).toHaveBeenCalledOnce();
    lazy.exit('title');
    lazy.enter('title');
    await lazy.preload();
    expect(inner.enter).toHaveBeenCalledWith('title');
  });
});
