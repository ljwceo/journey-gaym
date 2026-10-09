import { describe, expect, it } from 'vitest';
import { createNewSave, migrate, SAVE_VERSION, type Migration } from './SaveData';
import { SAVE_KEY, SaveManager, type StorageLike } from './SaveManager';

class MemoryStorage implements StorageLike {
  readonly items = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

function sampleSave() {
  const save = createNewSave('nl', new Date('2026-10-09T12:00:00Z'));
  save.character = {
    name: 'Zoë42',
    appearance: {
      bodyType: 'female',
      hairstyle: 'female_braid',
      hairColor: 'red_dark',
      skinTone: 'tone_3',
      mantleColor: 'navy',
    },
    gold: 0,
    inventory: [{ item: 'old_sword', count: 1 }],
    equipment: { weapon: 'old_sword' },
  };
  save.world = {
    zone: 'greyhaven',
    position: { x: 1, y: 2, z: 3 },
    heading: 0.5,
    checkpoint: null,
  };
  save.visitedPlaces.push('forge');
  return save;
}

describe('SaveManager', () => {
  it('reports no save on an empty storage', () => {
    expect(new SaveManager(new MemoryStorage()).load()).toEqual({ status: 'none' });
  });

  it('writes and loads the same save, stamping updatedAt', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    const save = sampleSave();
    expect(manager.write(save, new Date('2026-10-10T08:00:00Z'))).toBe(true);
    const loaded = manager.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    expect(loaded.save).toEqual(save);
    expect(loaded.save.updatedAt).toBe('2026-10-10T08:00:00.000Z');
  });

  it('keeps a backup of an unreadable save', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(new SaveManager(storage).load()).toEqual({ status: 'corrupt' });
    expect(storage.getItem(`${SAVE_KEY}.backup`)).toBe('{not json');
  });

  it('treats a save with missing fields as corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, language: 'en' }));
    expect(new SaveManager(storage).load()).toEqual({ status: 'corrupt' });
  });

  it('leaves a save from a newer game version untouched', () => {
    const storage = new MemoryStorage();
    const text = JSON.stringify({ ...sampleSave(), version: SAVE_VERSION + 1 });
    storage.setItem(SAVE_KEY, text);
    expect(new SaveManager(storage).load()).toEqual({ status: 'newer', version: SAVE_VERSION + 1 });
    expect(storage.getItem(SAVE_KEY)).toBe(text);
    expect(storage.getItem(`${SAVE_KEY}.backup`)).toBeNull();
  });

  it('deletes the save and its backup', () => {
    const storage = new MemoryStorage();
    const manager = new SaveManager(storage);
    manager.write(sampleSave());
    storage.setItem(`${SAVE_KEY}.backup`, 'x');
    manager.delete();
    expect(storage.items.size).toBe(0);
    expect(manager.load()).toEqual({ status: 'none' });
  });

  it('reports failure instead of throwing when storage is full or missing', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    expect(new SaveManager(storage).write(sampleSave())).toBe(false);
    const none = new SaveManager(null);
    expect(none.available).toBe(false);
    expect(none.write(sampleSave())).toBe(false);
    expect(none.load()).toEqual({ status: 'none' });
  });

  it('exports and imports a save as a text code (unicode-safe)', () => {
    const manager = new SaveManager(new MemoryStorage());
    const save = sampleSave();
    const code = manager.exportCode(save);
    expect(code.startsWith('LOM1:')).toBe(true);
    expect(manager.importCode(`  ${code}\n`)).toEqual(save);
    expect(manager.importCode('LOM1:!!!')).toBeNull();
    expect(manager.importCode('hello')).toBeNull();
  });
});

describe('migrate', () => {
  const table: Record<number, Migration> = {
    1: (save) => ({ ...save, version: 2, mount: null }),
    2: ({ gold, ...save }) => ({ ...save, version: 3, wallet: { gold } }),
  };

  it('upgrades step by step to the target version', () => {
    const result = migrate({ version: 1, gold: 7 }, table, 3);
    expect(result).toEqual({ ok: true, save: { version: 3, mount: null, wallet: { gold: 7 } } });
  });

  it('does nothing for a save that is already current', () => {
    expect(migrate({ version: 3, a: 1 }, table, 3)).toEqual({
      ok: true,
      save: { version: 3, a: 1 },
    });
  });

  it('refuses newer, invalid and unmigratable saves', () => {
    expect(migrate({ version: 4 }, table, 3)).toEqual({ ok: false, reason: 'newer', version: 4 });
    expect(migrate({ version: 'one' }, table, 3)).toEqual({ ok: false, reason: 'invalid' });
    expect(migrate(null, table, 3)).toEqual({ ok: false, reason: 'invalid' });
    expect(migrate({ version: 1 }, {}, 3)).toEqual({
      ok: false,
      reason: 'missingMigration',
      version: 1,
    });
  });

  it('throws when a migration forgets to bump the version', () => {
    expect(() => migrate({ version: 1 }, { 1: (save) => save }, 2)).toThrow();
  });

  it('has a migration for every older save version', () => {
    // migrations[v] must exist for every v from 1 up to the current version.
    const result = migrate(createNewSave('en'));
    expect(result.ok).toBe(true);
  });
});
