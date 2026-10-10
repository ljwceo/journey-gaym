import type { GameContext } from '../../core/GameContext';
import type { ItemDef } from '../../data/types';
import { isGear, wornCount } from '../../systems/Gear';
import type { ItemStack } from '../../systems/Inventory';
import type { FromPackResult, ToPackResult } from '../../systems/PackAnimal';
import { button, el } from '../dom';
import type { Panel } from '../Overlays';
import { itemNameEl } from './BagPanel';
import { bindT } from './ConfirmPanel';

/** What the pack panel needs from the world (the world does the rules and saving). */
export interface PackActions {
  toPack(itemId: string, count: number): ToPackResult;
  fromPack(itemId: string, count: number): FromPackResult;
  /** Your equip load, as in the bag. */
  playerLoad(): { kg: number; maxKg: number; tierId: string; tierLabel: string };
  /** What the animal carries (kg). */
  packKg(): number;
}

/**
 * The pack animal's bag (talk to Biscuit): what it carries (Take) and what is in your bag
 * (Load), with both loads at the top. Worn gear stays on you. Stacks move one at a time, or
 * all at once with All. The game waits while it is open. Names stay English (data).
 */
export function packPanel(
  ctx: GameContext,
  animal: string,
  maxKg: number,
  actions: PackActions,
  onClose: () => void,
): Panel {
  // Why the last move failed, kept while the panel redraws.
  let message = '';
  return {
    build: () => {
      const { t } = bindT(ctx);
      const character = ctx.session?.character;
      const items = new Map(ctx.data?.items.items.map((item) => [item.id, item]) ?? []);
      const equipment = character?.equipment ?? {};
      const kg = (value: number): string =>
        value.toLocaleString(ctx.i18n.language, { maximumFractionDigits: 1 });
      const refresh = (failure: string): void => {
        message = failure;
        ctx.overlays.refreshTop();
      };

      const row = (
        stack: ItemStack,
        movable: number,
        label: string,
        move: (count: number) => void,
      ): HTMLElement => {
        const def: ItemDef | undefined = items.get(stack.item);
        const name = def?.name ?? stack.item;
        const chip = (text: string, count: number): HTMLElement =>
          el('button', {
            className: 'ui-chip',
            text,
            attrs: { type: 'button', 'aria-label': `${text}: ${name}` },
            onClick: () => move(count),
          });
        return el(
          'li',
          { className: 'ui-bag-row' },
          el(
            'div',
            { className: 'ui-bag-item' },
            itemNameEl(ctx, def, stack.item),
            stack.count > 1
              ? el('span', { className: 'ui-bag-count', text: `×${stack.count}` })
              : null,
            isGear(def)
              ? el('span', {
                  className: 'ui-bag-gear',
                  text: t('bag.weight', { kg: kg(def?.weight ?? 0) }),
                })
              : null,
          ),
          movable > 0
            ? el(
                'div',
                { className: 'ui-pack-actions' },
                chip(label, 1),
                movable > 1 ? chip(t('pack.all'), movable) : null,
              )
            : el('span', { className: 'ui-bag-equipped', text: t('bag.equipped') }),
        );
      };

      const failure = (result: ToPackResult | FromPackResult): string =>
        result === 'tooHeavy'
          ? t('hud.packTooHeavy', { name: animal })
          : result === 'worn'
            ? t('hud.packWorn')
            : '';

      const packRows = (character?.pack ?? []).map((stack) =>
        row(stack, stack.count, t('pack.fromPack'), (count) =>
          refresh(failure(actions.fromPack(stack.item, count))),
        ),
      );
      const bagRows = (character?.inventory ?? []).map((stack) =>
        row(stack, stack.count - wornCount(equipment, stack.item), t('pack.toPack'), (count) =>
          refresh(failure(actions.toPack(stack.item, count))),
        ),
      );
      const load = actions.playerLoad();
      return el(
        'div',
        { className: 'ui-panel ui-menu ui-bag ui-pack', attrs: { role: 'dialog' } },
        el('h2', { className: 'ui-heading', text: t('pack.title', { name: animal }) }),
        el(
          'p',
          { className: `ui-bag-load ui-bag-load-${load.tierId}` },
          t('bag.load', { kg: kg(load.kg), max: kg(load.maxKg), tier: t(load.tierLabel) }),
        ),
        el(
          'p',
          { className: 'ui-bag-load' },
          t('pack.load', { name: animal, kg: kg(actions.packKg()), max: kg(maxKg) }),
        ),
        el('p', { className: 'ui-note', text: t('pack.note', { name: animal }) }),
        el('h3', { className: 'ui-bag-subheading', text: t('pack.theirs', { name: animal }) }),
        packRows.length > 0
          ? el('ul', { className: 'ui-bag-list' }, ...packRows)
          : el('p', { className: 'ui-note', text: t('pack.emptyPack', { name: animal }) }),
        el('h3', { className: 'ui-bag-subheading', text: t('pack.yours') }),
        bagRows.length > 0
          ? el('ul', { className: 'ui-bag-list' }, ...bagRows)
          : el('p', { className: 'ui-note', text: t('pack.emptyBag') }),
        el('p', { className: 'ui-shop-message', attrs: { 'aria-live': 'polite' }, text: message }),
        button(t('common.close'), () => ctx.overlays.close(), true),
      );
    },
    onClose,
  };
}
