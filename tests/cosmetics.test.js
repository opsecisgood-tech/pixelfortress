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
