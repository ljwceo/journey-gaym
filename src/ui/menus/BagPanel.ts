import type { GameContext } from '../../core/GameContext';
import type { ItemDef } from '../../data/types';
import { button, el } from '../dom';
import type { Panel } from '../Overlays';
import { bindT } from './ConfirmPanel';

/** Bag rows are sorted by item type in this order (then as they were picked up). */
const TYPE_ORDER: readonly ItemDef['type'][] = [
  'potion',
  'weapon',
  'armor',
  'crystal',
  'quest',
  'recipe',
  'resource',
  'currency',
];

/**
 * The simple bag (I / B or the bag button): gold, level and XP, and every item with its count
 * and description. Potions have a Drink button. Item names stay English in both languages
 * (CLAUDE.md §2.6). The game is paused while the bag is open.
 */
export function bagPanel(
  ctx: GameContext,
  drink: (itemId: string) => void,
  xpLine: () => string,
  onClose: () => void,
): Panel {
  return {
    build: () => {
      const { t } = bindT(ctx);
      const character = ctx.session?.character;
      const data = ctx.data;
      const items = new Map(data?.items.items.map((item) => [item.id, item]) ?? []);
      const equipped = new Set(Object.values(character?.equipment ?? {}));
      const stacks = [...(character?.inventory ?? [])].sort(
        (a, b) =>
          TYPE_ORDER.indexOf(items.get(a.item)?.type ?? 'resource') -
          TYPE_ORDER.indexOf(items.get(b.item)?.type ?? 'resource'),
      );
      const rows = stacks.map((stack) => {
        const def = items.get(stack.item);
        const name = def?.name ?? stack.item;
        const action =
          def?.type === 'potion'
            ? el('button', {
                className: 'ui-chip',
                text: t('bag.drink'),
                attrs: { type: 'button', 'aria-label': `${t('bag.drink')}: ${name}` },
                onClick: () => drink(stack.item),
              })
            : equipped.has(stack.item)
              ? el('span', { className: 'ui-bag-equipped', text: t('bag.equipped') })
              : null;
        return el(
          'li',
          { className: 'ui-bag-row' },
          el(
            'div',
            { className: 'ui-bag-item' },
            el('span', { className: 'ui-bag-name', text: name }),
            stack.count > 1
              ? el('span', { className: 'ui-bag-count', text: `×${stack.count}` })
              : null,
            def?.description
              ? el('span', { className: 'ui-bag-desc', text: t(def.description) })
              : null,
          ),
          action,
        );
      });
      return el(
        'div',
        { className: 'ui-panel ui-menu ui-bag', attrs: { role: 'dialog' } },
        el('h2', { className: 'ui-heading', text: t('bag.title') }),
        el(
          'div',
          { className: 'ui-bag-stats' },
          el(
            'span',
            { className: 'ui-bag-gold' },
            el('span', { className: 'ui-hud-gold-coin' }),
            // "Gold" is a temporary name and stays English (data, not a text key).
            `${character?.gold ?? 0} ${items.get('gold')?.name ?? 'Gold'}`,
          ),
          el('span', { className: 'ui-bag-level', text: xpLine() }),
        ),
        rows.length > 0
          ? el('ul', { className: 'ui-bag-list' }, ...rows)
          : el('p', { className: 'ui-note', text: t('bag.empty') }),
        button(t('common.close'), () => ctx.overlays.close(), true),
      );
    },
    onClose,
  };
}
