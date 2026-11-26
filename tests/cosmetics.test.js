// Cosmetic catalog, class restrictions, server loadout validation and the profile inventory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS } from '../src/shared/config/classes.js';
import {
  ITEMS, ITEM_BY_ID, RARITIES, SLOTS, STARTER_ITEMS, LEGACY_MAP, canWear, sanitizeLoadouts, randomLoadouts,
} from '../src/shared/config/cosmetics.js';
import { mulberry32 } from '../src/shared/math.js';
import { Profile } from '../src/client/progression/Profile.js';

test('catalog has hundreds of unique items covering every slot and rarity', () => {
  assert.ok(ITEMS.length >= 500, `only ${ITEMS.length} items`);
  assert.equal(ITEM_BY_ID.size, ITEMS.length, 'ids are unique');
  for (const slot of SLOTS) {
    const inSlot = ITEMS.filter((i) => i.slot === slot);
    assert.ok(inSlot.length >= 20, `${slot} has ${inSlot.length}`);
  }
  for (let r = 0; r < RARITIES.length; r++) assert.ok(ITEMS.some((i) => i.rarity === r), `rarity ${r} present`);
  for (const id of STARTER_ITEMS) assert.ok(ITEM_BY_ID.has(id), `starter ${id}`);
  for (const m of Object.values(LEGACY_MAP)) for (const id of Object.values(m)) assert.ok(ITEM_BY_ID.has(id), `legacy ${id}`);
});

test('every class has class-locked items in hats, masks, accessories, skins and poses', () => {
  for (const cls of CLASS_IDS) {
    for (const slot of ['hat', 'mask', 'accessory', 'weaponSkin', 'victoryPose']) {
      assert.ok(ITEMS.some((i) => i.slot === slot && i.classes && i.classes.includes(cls)), `${cls} ${slot}`);
    }
  }
  const spyHat = ITEMS.find((i) => i.classes && i.classes[0] === 'spy' && i.slot === 'hat');
  assert.ok(canWear(spyHat, 'spy'));
  assert.ok(!canWear(spyHat, 'scout'));
});

test('server loadout sanitizer rejects unknown, wrong-slot and wrong-class items', () => {
  const spyMask = ITEMS.find((i) => i.classes && i.classes[0] === 'spy' && i.slot === 'mask').id;
  const lo = sanitizeLoadouts({ scout: { hat: 'hat:crown:golden', mask: spyMask, accessory: 'hat:beanie:classic', gloves: '<script>' }, spy: { mask: spyMask } });
  assert.equal(lo.scout.hat, 'hat:crown:golden');
  assert.equal(lo.scout.mask, null);
  assert.equal(lo.scout.accessory, null);
  assert.equal(lo.scout.gloves, null);
  assert.equal(lo.spy.mask, spyMask);
  assert.deepEqual(Object.keys(sanitizeLoadouts(null)).sort(), [...CLASS_IDS].sort());
  const bots = randomLoadouts(mulberry32(3));
  for (const cls of CLASS_IDS) for (const slot of SLOTS) { const id = bots[cls][slot]; if (id) assert.ok(canWear(ITEM_BY_ID.get(id), cls)); }
});

test('profile inventory: starter items, match results grant XP only, class-locked equip', () => {
  const p = new Profile();
  for (const id of STARTER_ITEMS) assert.ok(p.owns(id), `owns starter ${id}`);
  assert.equal(p.data.crates, undefined, 'no crate economy');
  const results = { winner: 0, mapId: 'dusty_depot', mode: 'tdm', awards: [], players: [{ id: 7, team: 0, classId: 'scout', stats: { kills: 11, deaths: 2, assists: 1, damage: 900, healing: 0, bestStreak: 4, score: 30, classKills: { scout: 11 } } }] };
  const owned = p.ownedCount();
  const s = p.applyMatch(results, 7, []);
  assert.ok(s.xp.total > 0);
  assert.equal(s.rewards, undefined);
  assert.equal(p.ownedCount(), owned, 'matches do not grant items');
  // granting (for a future acquisition system) and class restriction
  const spyHat = ITEMS.find((i) => i.classes && i.classes[0] === 'spy' && i.slot === 'hat');
  assert.equal(p.grantItem(spyHat.id), false);
  assert.equal(p.grantItem(spyHat.id), true, 'second grant is a duplicate');
  assert.equal(p.equip('scout', 'hat', spyHat.id), false);
  assert.equal(p.equip('spy', 'hat', spyHat.id), true);
  assert.equal(p.loadout('spy').hat, spyHat.id);
  assert.equal(p.equip('spy', 'hat', 'hat:crown:prismatic'), false, 'cannot equip unowned');
  assert.equal(p.equip('spy', 'hat', null), true);
  assert.equal(p.loadout('spy').hat, null);
});

test('crates: tier odds are valid, better tiers give more per key, rolls avoid duplicates', async () => {
  const { CRATE_TIERS, CRATE_BY_ID, rollRarity, rollCrate, epicPerKey } = await import('../src/shared/config/crates.js');
  assert.equal(CRATE_TIERS.length, 3);
  for (let i = 1; i < CRATE_TIERS.length; i++) {
    assert.ok(CRATE_TIERS[i].cost > CRATE_TIERS[i - 1].cost);
    assert.ok(epicPerKey(CRATE_TIERS[i]) > epicPerKey(CRATE_TIERS[i - 1]), 'more keys = better value');
  }
  // the empirical distribution matches the advertised odds
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const tier = CRATE_BY_ID.armored, n = 40000, hist = new Array(7).fill(0);
  for (let i = 0; i < n; i++) hist[rollRarity(tier, rnd)]++;
  tier.odds.forEach((p, r) => assert.ok(Math.abs(hist[r] / n * 100 - p) < 1.2, `rarity ${r}: ${hist[r] / n * 100} vs ${p}`));
  assert.equal(hist[0] + hist[1], 0, 'armored crates never drop common/uncommon');
  // no duplicates while unowned items remain
  const owned = new Set();
  for (let i = 0; i < 200; i++) { const r = rollCrate(CRATE_BY_ID.vault, (id) => owned.has(id), rnd); assert.ok(r.item && !owned.has(r.item.id)); owned.add(r.item.id); }
  // owning everything from the rolled rarity up gives keys back
  const all = rollCrate(CRATE_BY_ID.vault, () => true, rnd);
  assert.equal(all.item, null); assert.ok(all.refund >= 1);
});
