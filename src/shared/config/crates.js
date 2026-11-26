// Crate tiers: spend keys (earned at the end of winning matches, see shared/rewards.js) to open crates.
// Better crates cost more keys and have better rarity odds; per key spent, the chance of an Epic-or-
// better item still rises with tier, so saving keys for a bigger crate is worthwhile, while even the
// cheapest crate can drop anything up to Mythic.
import { RARITIES, ITEMS_BY_RARITY } from './cosmetics.js';

// odds: percent per rarity index [common, uncommon, rare, epic, legendary, mythic, iridescent]
export const CRATE_TIERS = [
  {
    id: 'supply', name: 'Supply Crate', cost: 1, tagline: 'A sturdy plywood shipping crate.',
    odds: [52, 28, 13, 5, 1.6, 0.4, 0],
  },
  {
    id: 'armored', name: 'Armored Crate', cost: 3, tagline: 'The same crate in armored blue. Rare or better guaranteed.',
    odds: [0, 0, 58, 27, 11, 3.5, 0.5],
  },
  {
    id: 'vault', name: 'Vault Crate', cost: 6, tagline: 'A steel vault box. Epic or better guaranteed.',
    odds: [0, 0, 0, 56, 30, 11, 3],
  },
];
export const CRATE_BY_ID = Object.fromEntries(CRATE_TIERS.map((c) => [c.id, c]));
for (const c of CRATE_TIERS) {
  const sum = c.odds.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1e-6) throw new Error(`${c.id} odds sum to ${sum}`);
  if (c.odds.length !== RARITIES.length) throw new Error(`${c.id} odds length`);
}

// Pick a rarity index from a tier's odds. rnd() in [0, 1).
export function rollRarity(tier, rnd = Math.random) {
  let r = rnd() * 100;
  for (let i = 0; i < tier.odds.length; i++) {
    if (tier.odds[i] <= 0) continue;
    r -= tier.odds[i];
    if (r < 0) return i;
  }
  for (let i = tier.odds.length - 1; i >= 0; i--) if (tier.odds[i] > 0) return i;
  return 0;
}

/**
 * Roll one crate. owned(id) -> bool. Duplicates are avoided: if every item of the rolled rarity is
 * owned, the next rarity up with something new is used; if the player owns everything from that
 * rarity up, they get keys back instead (refund).
 * Returns { item, rarity, refund }.
 */
export function rollCrate(tier, owned, rnd = Math.random) {
  const rolled = rollRarity(tier, rnd);
  for (let r = rolled; r < RARITIES.length; r++) {
    const pool = ITEMS_BY_RARITY[r].filter((it) => !owned(it.id));
    if (pool.length) return { item: pool[Math.floor(rnd() * pool.length)], rarity: r, rolled, refund: 0 };
  }
  return { item: null, rarity: rolled, rolled, refund: Math.max(1, Math.ceil(tier.cost / 2)) };
}

// Chance (percent) of Epic or better per key spent - shown in the crate screen.
export const epicPerKey = (tier) => tier.odds.slice(3).reduce((a, b) => a + b, 0) / tier.cost;
