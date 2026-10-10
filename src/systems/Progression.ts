import type { PlayerConfig } from '../data/types';

/** Level and XP towards the next level (the `progress` part of the save). */
export interface LevelState {
  level: number;
  xp: number;
}

/**
 * XP needed to go from `level` to `level + 1` (player.json `xpToNextLevel`). Past the end of
 * the table every level costs as much as the last step; at the highest level there is no
 * next level (Infinity).
 */
export function xpToNext(player: PlayerConfig, level: number): number {
  if (level >= player.maxLevel) return Infinity;
  const table = player.xpToNextLevel;
  return table[Math.min(level - 1, table.length - 1)] ?? Infinity;
}

/** How full the XP bar is (0–1); full at the highest level. */
export function xpFraction(player: PlayerConfig, state: LevelState): number {
  const need = xpToNext(player, state.level);
  return Number.isFinite(need) ? Math.min(1, state.xp / need) : 1;
}

/**
 * Adds XP and goes up as many levels as it pays for. Returns the number of levels gained.
 * At the highest level XP is no longer collected.
 */
export function addXp(player: PlayerConfig, state: LevelState, amount: number): number {
  if (amount <= 0 || state.level >= player.maxLevel) return 0;
  state.xp += Math.floor(amount);
  let gained = 0;
  for (;;) {
    const need = xpToNext(player, state.level);
    if (state.xp < need) break;
    state.xp -= need;
    state.level++;
    gained++;
    if (state.level >= player.maxLevel) {
      state.xp = 0;
      break;
    }
  }
  return gained;
}

/** Gold lost when dying: a fraction of what you carry, rounded down (concept: 10%). */
export function deathGoldLoss(gold: number, fraction: number): number {
  return Math.floor(Math.max(0, gold) * fraction);
}
