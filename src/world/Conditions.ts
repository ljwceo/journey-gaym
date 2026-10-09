import type { Condition } from '../data/types';

/** What conditions can look at. Grows with later phases (items, seasons, ...). */
export interface ConditionContext {
  level: number;
  completedQuests: ReadonlySet<string>;
}

/** Evaluates a data-driven condition from triggers.json (e.g. "Sultan defeated and level 5"). */
export function evaluateCondition(condition: Condition, ctx: ConditionContext): boolean {
  switch (condition.type) {
    case 'always':
      return true;
    case 'never':
      return false;
    case 'level':
      return ctx.level >= condition.min;
    case 'questCompleted':
      return ctx.completedQuests.has(condition.quest);
    case 'all':
      return condition.of.every((child) => evaluateCondition(child, ctx));
    case 'any':
      return condition.of.some((child) => evaluateCondition(child, ctx));
  }
}
