import type { GameContext } from '../../core/GameContext';
import type { ShopDef } from '../../data/types';
import { countItem, GOLD_ITEM } from '../../systems/Inventory';
import { button, el } from '../dom';
import type { Panel } from '../Overlays';
import { bindT } from './ConfirmPanel';

export type BuyResult = 'bought' | 'notEnough';

/**
 * A simple shop (Marco): every item with its price, how many you already have, and a Buy
 * button (one at a time). Your gold shows at the top. The game waits while it is open.
 * Item names and "Gold" stay English (data, not text keys).
 */
export function shopPanel(
  ctx: GameContext,
  merchant: string,
  shop: ShopDef,
  buy: (itemId: string, price: number) => BuyResult,
  onClose: () => void,
): Panel {
  // The last purchase (or why it failed), kept while the panel redraws.
  let message = '';
  return {
    build: () => {
      const { t } = bindT(ctx);
      const character = ctx.session?.character;
      const items = new Map(ctx.data?.items.items.map((item) => [item.id, item]) ?? []);
      const gold = items.get(GOLD_ITEM)?.name ?? 'Gold';
      const rows = shop.items.map((entry) => {
        const def = items.get(entry.item);
        const name = def?.name ?? entry.item;
        const owned = countItem(character?.inventory ?? [], entry.item);
        return el(
          'li',
          { className: 'ui-bag-row' },
          el(
            'div',
            { className: 'ui-bag-item' },
            el('span', { className: 'ui-bag-name', text: name }),
            el('span', {
              className: 'ui-shop-price',
              text: t('shop.price', { price: entry.price, gold }),
            }),
            def?.description
              ? el('span', { className: 'ui-bag-desc', text: t(def.description) })
              : null,
            owned > 0
              ? el('span', { className: 'ui-bag-desc', text: t('shop.owned', { count: owned }) })
              : null,
          ),
          el('button', {
            className: 'ui-chip',
            text: t('shop.buy'),
            attrs: { type: 'button', 'aria-label': `${t('shop.buy')}: ${name}` },
            onClick: () => {
              const result = buy(entry.item, entry.price);
              message =
                result === 'bought'
                  ? t('shop.bought', { item: name })
                  : t('shop.notEnough', { gold });
              ctx.overlays.refreshTop();
            },
          }),
        );
      });
      return el(
        'div',
        { className: 'ui-panel ui-menu ui-bag ui-shop', attrs: { role: 'dialog' } },
        el('h2', { className: 'ui-heading', text: `${t('shop.title')} · ${merchant}` }),
        el(
          'div',
          { className: 'ui-bag-stats' },
          el(
            'span',
            { className: 'ui-bag-gold' },
            el('span', { className: 'ui-hud-gold-coin' }),
            `${character?.gold ?? 0} ${gold}`,
          ),
        ),
        el('ul', { className: 'ui-bag-list' }, ...rows),
        el('p', { className: 'ui-shop-message', attrs: { 'aria-live': 'polite' }, text: message }),
        button(t('common.close'), () => ctx.overlays.close(), true),
      );
    },
    onClose,
  };
}
