// Cosmetic catalog, crate odds, drop rules, class restrictions, contracts and the profile economy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASS_IDS } from '../src/shared/config/classes.js';
import {
  ITEMS, ITEM_BY_ID, RARITIES, SLOTS, CRATES, STARTER_ITEMS, LEGACY_MAP, rarityOdds, rollCrate, crateForKills,
  canWear, sanitizeLoadouts, randomLoadouts,
} from '../src/shared/config/cosmetics.js';
import { makeContracts, advanceContracts, crateProgress, levelCrate, weekIndex, dayIndex } from '../src/shared/config/economy.js';
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

test('rarity weights strictly decrease and better crates shift odds upward', () => {
  for (let i = 1; i < RARITIES.length; i++) assert.ok(RARITIES[i].weight < RARITIES[i - 1].weight);
  let prevTop = 0;
  for (const c of CRATES) {
    const o = rarityOdds(c.id);
    assert.ok(Math.abs(o.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    const top = o[4] + o[5] + o[6];
    assert.ok(top > prevTop, `${c.id} better than previous`);
    prevTop = top;
  }
  const bronze = rarityOdds('bronze');
  for (let i = 1; i < bronze.length; i++) assert.ok(bronze[i] < bronze[i - 1], 'each rarity rarer than the last');
});

test('crate rolls follow the odds (seeded)', () => {
  const rnd = mulberry32(42);
  const n = 20000, counts = new Array(7).fill(0);
  for (let i = 0; i < n; i++) counts[rollCrate('bronze', rnd).rarity]++;
  const odds = rarityOdds('bronze');
  for (let r = 0; r < 4; r++) assert.ok(Math.abs(counts[r] / n - odds[r]) < 0.02, `rarity ${r}: ${counts[r] / n} vs ${odds[r]}`);
  assert.ok(counts[6] > 0 && counts[6] < n * 0.01, 'iridescent is very rare');
});

test('kill crates need 5+ eliminations and improve with more', () => {
  assert.equal(crateForKills(4), null);
  assert.equal(crateForKills(5), 'bronze');
  assert.equal(crateForKills(10), 'silver');
  assert.equal(crateForKills(15), 'gold');
  assert.equal(crateForKills(25), 'diamond');
  assert.equal(crateProgress(7).next.crate, 'silver');
  assert.equal(levelCrate(10), 'gold');
  assert.equal(levelCrate(15), 'silver');
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

test('contracts are deterministic per period and progress from match stats', () => {
  const d = makeContracts('daily', 20000);
  assert.deepEqual(d.map((c) => c.desc), makeContracts('daily', 20000).map((c) => c.desc));
  assert.equal(d.length, 3);
  const set = { list: [{ id: 'x', kind: 'kills', target: 10, progress: 0, done: false, reward: {} }, { id: 'y', kind: 'streak', target: 4, progress: 0, done: false, reward: {} }, { id: 'z', kind: 'classKills', cls: 'spy', target: 3, progress: 0, done: false, reward: {} }] };
  let done = advanceContracts(set, { stats: { kills: 6, bestStreak: 3, classKills: { spy: 2 } }, won: false, classes: ['spy'] });
  assert.equal(done.length, 0);
  done = advanceContracts(set, { stats: { kills: 6, bestStreak: 4, classKills: { spy: 1, scout: 5 } }, won: true, classes: ['spy'] });
  assert.deepEqual(done.map((c) => c.id), ['x', 'y', 'z']);
  assert.equal(set.list[0].progress, 10);
  assert.ok(weekIndex(Date.UTC(2026, 10, 23)) === weekIndex(Date.UTC(2026, 10, 29)), 'Mon..Sun same week');
  assert.ok(weekIndex(Date.UTC(2026, 10, 30)) === weekIndex(Date.UTC(2026, 10, 29)) + 1);
  assert.equal(dayIndex(0), 0);
});

test('profile economy: kill crates, opening, duplicates to scrap, crafting, class-locked equip', () => {
  const p = new Profile();
  assert.equal(p.data.crates.length, 1, 'welcome crate');
  const results = { winner: 0, mapId: 'dusty_depot', mode: 'tdm', awards: [], players: [{ id: 7, team: 0, classId: 'scout', stats: { kills: 11, deaths: 2, assists: 1, damage: 900, healing: 0, bestStreak: 4, score: 30, classKills: { scout: 11 } } }] };
  const s = p.applyMatch(results, 7, [], Date.UTC(2026, 10, 25, 12));
  assert.ok(s.rewards.crates.some((c) => c.type === 'silver' && /eliminations/.test(c.src)), 'silver kill crate for 11 kills');
  assert.ok(s.rewards.firstWin);
  const s2 = p.applyMatch(results, 7, [], Date.UTC(2026, 10, 25, 13));
  assert.ok(!s2.rewards.firstWin, 'first win only once a day');
  // open everything with a seeded rng
  const rnd = mulberry32(9);
  let opened = 0;
  while (p.data.crates.length) { const r = p.openCrate(p.data.crates[0].uid, rnd); assert.ok(r.item); if (r.duplicate) assert.ok(r.scrap > 0); opened++; }
  assert.ok(opened >= 3);
  // force a duplicate
  const own = Object.keys(p.data.inventory).find((id) => !STARTER_ITEMS.includes(id)) || STARTER_ITEMS[0];
  assert.equal(p.grantItem(own), true);
  // class restriction
  const spyHat = ITEMS.find((i) => i.classes && i.classes[0] === 'spy' && i.slot === 'hat');
  p.grantItem(spyHat.id);
  assert.equal(p.equip('scout', 'hat', spyHat.id), false);
  assert.equal(p.equip('spy', 'hat', spyHat.id), true);
  assert.equal(p.loadout('spy').hat, spyHat.id);
  assert.equal(p.equip('spy', 'hat', 'hat:crown:prismatic') && !p.owns('hat:crown:prismatic'), false, 'cannot equip unowned');
  // crafting
  p.data.scrap = 20;
  assert.equal(p.craftCrate('bronze'), true);
  assert.equal(p.data.scrap, 8);
  assert.equal(p.craftCrate('diamond'), false);
  // salvage unequips
  const sc = p.salvage(spyHat.id);
  assert.ok(sc > 0);
  assert.equal(p.loadout('spy').hat, null);
});
