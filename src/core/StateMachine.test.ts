import { describe, expect, it } from 'vitest';
import { StateMachine, type GameState } from './StateMachine';

function recorder(name: string, log: string[]): GameState {
  return {
    enter: (from) => log.push(`${name}.enter(${from})`),
    exit: (to) => log.push(`${name}.exit(${to})`),
    update: () => log.push(`${name}.update`),
    render: () => log.push(`${name}.render`),
  };
}

describe('StateMachine', () => {
  it('applies a requested change before the next update, exiting the old state first', () => {
    const log: string[] = [];
    const changes: string[] = [];
    const sm = new StateMachine<'boot' | 'title'>((from, to) => changes.push(`${from}->${to}`));
    sm.register('boot', recorder('boot', log)).register('title', recorder('title', log));

    sm.change('boot');
    sm.update(1 / 60);
    sm.change('title');
    expect(sm.id).toBe('boot');
    sm.update(1 / 60);

    expect(log).toEqual([
      'boot.enter(null)',
      'boot.update',
      'boot.exit(title)',
      'title.enter(boot)',
      'title.update',
    ]);
    expect(changes).toEqual(['null->boot', 'boot->title']);
    expect(sm.id).toBe('title');
  });

  it('a change requested during update does not interrupt that update', () => {
    const log: string[] = [];
    const sm = new StateMachine<'a' | 'b'>();
    sm.register('a', {
      update: () => {
        sm.change('b');
        log.push('a.update.end');
      },
    });
    sm.register('b', recorder('b', log));
    sm.change('a');
    sm.update(1 / 60);
    sm.render(0, 1 / 60);
    sm.update(1 / 60);
    expect(log).toEqual(['a.update.end', 'b.enter(a)', 'b.update']);
  });

  it('rejects unknown and duplicate states', () => {
    const sm = new StateMachine<string>();
    sm.register('a', {});
    expect(() => sm.register('a', {})).toThrow();
    expect(() => sm.change('nope')).toThrow();
  });
});
