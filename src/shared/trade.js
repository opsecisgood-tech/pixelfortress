// Player-to-player trades: pure rules shared by the client (trade window, applying a finished trade)
// and the tests. A trade is two offers { items: [itemId...], keys: n }; each player edits only their
// own offer, both press Ready, then both Confirm. Changing an offer clears both Ready/Confirm flags, so
// nobody can swap items after the other side agreed. When both have confirmed, each player's game
// applies the swap to their own profile exactly once (tracked by trade id).
import { getItem, STARTER_ITEMS } from './config/cosmetics.js';

export const TRADE_LIMITS = { maxItems: 12, maxKeys: 99 };

// Items that can be traded: owned, real catalog items, not part of the free starter set.
export function isTradeable(id, inventory) {
  const it = getItem(id);
  return !!(it && inventory?.[id] && !it.starter && !STARTER_ITEMS.includes(id));
}

export function cleanOffer(o) {
  const items = [...new Set((Array.isArray(o?.items) ? o.items : []).filter((id) => typeof id === 'string' && getItem(id)))].slice(0, TRADE_LIMITS.maxItems);
  const keys = Math.max(0, Math.min(TRADE_LIMITS.maxKeys, Math.floor(+o?.keys || 0)));
  return { items, keys };
}

// Can this player give this offer right now? data = profile data ({ inventory, keys }).
export function checkOffer(offer, data) {
  const o = cleanOffer(offer);
  for (const id of o.items) if (!isTradeable(id, data.inventory)) return { ok: false, reason: `You no longer own ${getItem(id)?.name || 'an item'} in this trade.` };
  if (o.keys > (data.keys || 0)) return { ok: false, reason: 'You no longer have enough keys for this trade.' };
  return { ok: true, offer: o };
}

/**
 * Apply a finished trade to one player's profile data (mutates). give = this player's offer,
 * get = the other player's offer. Returns { ok, reason?, received: [ids], duplicates: [ids] }.
 * Idempotent per trade id (data.tradesApplied).
 */
export function applyTrade(data, tradeId, give, get) {
  data.tradesApplied ||= [];
  if (data.tradesApplied.includes(tradeId)) return { ok: true, already: true, received: [], duplicates: [] };
  const chk = checkOffer(give, data);
  if (!chk.ok) return chk;
  const g = chk.offer, r = cleanOffer(get);
  for (const id of g.items) {
    delete data.inventory[id];
    data.newItems = (data.newItems || []).filter((x) => x !== id);
  }
  data.keys = (data.keys || 0) - g.keys + r.keys;
  const received = [], duplicates = [];
  for (const id of r.items) {
    if (data.inventory[id]) { duplicates.push(id); continue; }
    data.inventory[id] = 1;
    (data.newItems ||= []).push(id);
    received.push(id);
  }
  data.tradesApplied.push(tradeId);
  if (data.tradesApplied.length > 100) data.tradesApplied.splice(0, data.tradesApplied.length - 100);
  return { ok: true, received, duplicates };
}

// Field names of one side of a trade document.
export const sideKeys = (side) => ({ items: `${side}Items`, keys: `${side}Keys`, ready: `${side}Ready`, confirm: `${side}Confirm`, done: `${side}Done` });
export const offerOf = (t, side) => cleanOffer({ items: t?.[`${side}Items`], keys: t?.[`${side}Keys`] });
