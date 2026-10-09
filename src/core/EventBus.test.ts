import { describe, expect, it } from 'vitest';
import { EventBus } from './EventBus';

interface TestEvents {
  ping: { n: number };
  pong: { text: string };
}

describe('EventBus', () => {
  it('delivers payloads to subscribers of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const got: number[] = [];
    bus.on('ping', (e) => got.push(e.n));
    bus.on('pong', () => got.push(-1));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(got).toEqual([1, 2]);
  });

  it('unsubscribes via the returned function', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    const off = bus.on('ping', () => calls++);
    bus.emit('ping', { n: 1 });
    off();
    bus.emit('ping', { n: 2 });
    expect(calls).toBe(1);
    expect(bus.count('ping')).toBe(0);
  });

  it('handles unsubscribing during an emit safely', () => {
    const bus = new EventBus<TestEvents>();
    const order: string[] = [];
    const offB = bus.on('ping', () => order.push('b'));
    bus.on('ping', () => {
      order.push('a');
      offB();
    });
    bus.on('ping', () => order.push('c'));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(order).toEqual(['b', 'a', 'c', 'a', 'c']);
    expect(bus.count('ping')).toBe(2);
  });

  it('does not call handlers added during the same emit', () => {
    const bus = new EventBus<TestEvents>();
    let late = 0;
    bus.on('ping', () => {
      bus.on('ping', () => late++);
    });
    bus.emit('ping', { n: 1 });
    expect(late).toBe(0);
    bus.emit('ping', { n: 2 });
    expect(late).toBe(1);
  });

  it('stays consistent when a handler throws', () => {
    const bus = new EventBus<TestEvents>();
    const off = bus.on('ping', () => {
      off();
      throw new Error('boom');
    });
    expect(() => bus.emit('ping', { n: 1 })).toThrow('boom');
    expect(bus.count('ping')).toBe(0);
  });
});
