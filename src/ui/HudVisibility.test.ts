import { describe, expect, it } from 'vitest';
import { playerFileSchema } from '../data/schemas';
import { readPublicJson } from '../test/loadPublic';
import { type HudBars, HudRules, HudVisibility } from './HudVisibility';

const player = playerFileSchema.parse(readPublicJson('data/player.json'));

function bars(): HudBars {
  return {
    hp: new HudVisibility(),
    mana: new HudVisibility(),
    energy: new HudVisibility(),
    xp: new HudVisibility(),
    gold: new HudVisibility(),
  };
}

function run(seconds: number, all: HudBars): void {
  // Small steps, like frames.
  for (let t = 0; t < seconds; t += 0.1) for (const v of Object.values(all)) v.update(0.1);
}

describe('HudVisibility', () => {
  it('is visible while it has a reason; timed reasons run out', () => {
    const v = new HudVisibility();
    expect(v.visible).toBe(false);
    v.show('a');
    v.show('b', 1);
    v.update(1.5);
    expect(v.visible).toBe(true);
    expect(v.has('b')).toBe(false);
    v.hide('a');
    expect(v.visible).toBe(false);
  });

  it('showing a reason again restarts its time', () => {
    const v = new HudVisibility();
    v.show('flash', 1);
    v.update(0.8);
    v.show('flash', 1);
    v.update(0.8);
    expect(v.visible).toBe(true);
  });
});

describe('HudRules (concept)', () => {
  const cfg = player.hud;

  it('shows HP, mana and energy only in a fight, and fades them after the XP bar', () => {
    const b = bars();
    const rules = new HudRules(b, cfg, player.lowHpThreshold);
    expect(b.hp.visible).toBe(false);
    rules.setCombat(true);
    expect(b.hp.visible && b.mana.visible && b.energy.visible).toBe(true);
    expect(b.xp.visible).toBe(false);
    rules.xpGained();
    rules.setCombat(false);
    expect(b.xp.visible).toBe(true);
    run(cfg.xpShowSeconds + 0.5, b);
    expect(b.hp.visible || b.mana.visible || b.energy.visible || b.xp.visible).toBe(false);
  });

  it('keeps the HP bar under 30 % HP until it is higher again', () => {
    const b = bars();
    const rules = new HudRules(b, cfg, player.lowHpThreshold);
    rules.setHpFraction(0.2);
    run(60, b);
    expect(b.hp.visible).toBe(true);
    rules.setHpFraction(0.5);
    expect(b.hp.visible).toBe(false);
  });

  it('shows gold at a shop and briefly when it changes', () => {
    const b = bars();
    const rules = new HudRules(b, cfg, player.lowHpThreshold);
    rules.goldChanged();
    expect(b.gold.visible).toBe(true);
    run(cfg.goldShowSeconds + 0.5, b);
    expect(b.gold.visible).toBe(false);
    rules.setShop(true);
    run(60, b);
    expect(b.gold.visible).toBe(true);
    rules.setShop(false);
    expect(b.gold.visible).toBe(false);
  });

  it('shows the energy bar after a dash until energy is full again, then fades', () => {
    const b = bars();
    const rules = new HudRules(b, cfg, player.lowHpThreshold);
    rules.setEnergyFraction(1);
    expect(b.energy.visible).toBe(false);
    rules.setEnergyFraction(0.75);
    expect(b.energy.visible).toBe(true);
    rules.setEnergyFraction(1);
    expect(b.energy.visible).toBe(true);
    run(cfg.barLingerSeconds + 0.5, b);
    expect(b.energy.visible).toBe(false);
  });
});
