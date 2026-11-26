// Unit tests: damage rules, class & weapon configuration, team assignment, flag state machine,
// awards and progression. Run with `npm test` (Node's built-in test runner, no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { falloffMult, hitscanDamage, explosionDamage, isBehind, applyDefense, fallDamage } from '../src/shared/damage.js';
import { CLASSES, CLASS_IDS, validateClasses, applyBalanceOverrides, resetBalance, getClass } from '../src/shared/config/classes.js';
import { WEAPONS, validateWeapons } from '../src/shared/config/weapons.js';
import { chooseTeam, canSwitchTeam, classAllowed } from '../src/shared/teams.js';
import { Flag } from '../src/shared/flag.js';
import { FLAG_STATE } from '../src/shared/constants.js';
import { assignAwards } from '../src/shared/awards.js';
import { computeMatchXp, levelFromXp, xpForLevel } from '../src/shared/config/progression.js';

test('exactly eight valid classes referencing real weapons in correct slots', () => {
  assert.equal(CLASS_IDS.length, 9);
  assert.deepEqual(validateClasses(WEAPONS), []);
  assert.deepEqual(validateWeapons(), []);
  assert.equal(getClass('juggernaut').health, 300);
  assert.equal(getClass('scout').speed, 1.15);
  assert.equal(getClass('spy').health, 100);
  for (const id of CLASS_IDS) assert.ok(CLASSES[id].ability.id, `${id} has an ability`);
});

test('balance overrides patch the single source of truth and can be reset', () => {
  applyBalanceOverrides({ juggernaut: { health: 280, ability: { cooldown: 25 } } });
  assert.equal(getClass('juggernaut').health, 280);
  assert.equal(getClass('juggernaut').ability.cooldown, 25);
  assert.equal(getClass('juggernaut').ability.radius, 6.5, 'unpatched nested fields preserved');
  resetBalance();
  assert.equal(getClass('juggernaut').health, 300);
});

test('hitscan falloff and headshot rules', () => {
  const pistol = WEAPONS.sidekick;
  assert.equal(falloffMult(pistol, 5), 1);
  assert.equal(falloffMult(pistol, pistol.range), pistol.minFalloff);
  assert.ok(falloffMult(pistol, 40) < 1 && falloffMult(pistol, 40) > pistol.minFalloff);
  const body = hitscanDamage(pistol, { dist: 5, headshot: false });
  const head = hitscanDamage(pistol, { dist: 5, headshot: true });
  assert.equal(body.damage, 15);
  assert.equal(head.damage, Math.round(15 * pistol.headshotMult));
  assert.equal(head.headshot, true);
  // shotguns don't headshot
  assert.equal(hitscanDamage(WEAPONS.scattershot, { dist: 1, headshot: true }).headshot, false);
});

test('sniper charge scales damage and scoped headshots double', () => {
  const r = WEAPONS.longshot;
  assert.equal(hitscanDamage(r, { dist: 50, scoped: false, charge: 1 }).damage, 50);
  assert.equal(hitscanDamage(r, { dist: 50, scoped: true, charge: 1 }).damage, 150);
  assert.equal(hitscanDamage(r, { dist: 50, scoped: true, charge: 1, headshot: true }).damage, 300);
  assert.equal(hitscanDamage(r, { dist: 50, scoped: false, headshot: true }).headshot, false, 'unscoped headshots do not count');
});

test('explosion damage falls off with distance', () => {
  assert.equal(explosionDamage(90, 0, 3.6), 90);
  assert.equal(explosionDamage(90, 3.6, 3.6), 0);
  const mid = explosionDamage(90, 1.8, 3.6, 0.35);
  assert.ok(mid < 90 && mid > 90 * 0.35);
});

test('back attack detection uses positions and orientation', () => {
  // victim at origin facing -Z (yaw 0); attacker behind at +Z facing -Z
  assert.equal(isBehind([0, 0, 2], 0, [0, 0, 0], 0), true);
  // attacker in front facing the victim (yaw PI looks toward +Z)
  assert.equal(isBehind([0, 0, -2], Math.PI, [0, 0, 0], 0), false);
  // attacker behind but looking away
  assert.equal(isBehind([0, 0, 2], Math.PI, [0, 0, 0], 0), false);
});

test('defensive modifiers', () => {
  assert.equal(applyDefense(100, { spawnProtected: true }), 0);
  assert.equal(applyDefense(100, { overcharged: true }), 50);
  assert.equal(applyDefense(100, { suppression: true, suppressionReduction: 0.35 }), 65);
  assert.equal(applyDefense(100, { isFire: true, fireDamageMult: 0.5 }), 50);
  assert.equal(fallDamage(10, 17, 6), 0);
  assert.equal(fallDamage(20, 17, 6), 18);
});

test('team assignment balances players and rejects full rooms', () => {
  assert.equal(chooseTeam([], 6), 0);
  assert.equal(chooseTeam([{ team: 0 }], 6), 1);
  assert.equal(chooseTeam([{ team: 0 }, { team: 0 }, { team: 1 }], 6), 1);
  assert.equal(chooseTeam([{ team: 0, isBot: true }, { team: 1 }], 6), 0, 'equal sizes -> fewer humans');
  const full = [{ team: 0 }, { team: 1 }];
  assert.equal(chooseTeam(full, 1), -1);
  assert.equal(chooseTeam([{ team: 0 }], 1), 1);
  const ps = [{ id: 1, team: 0 }, { id: 2, team: 0 }, { id: 3, team: 1 }];
  assert.equal(canSwitchTeam(ps, 1, 1, 6), true);
  assert.equal(canSwitchTeam(ps, 3, 0, 6), false, 'would stack red');
  assert.equal(canSwitchTeam(ps, 1, 0, 6), false, 'already on that team');
  assert.equal(canSwitchTeam(ps, 1, 5, 6), false, 'invalid team id');
  assert.equal(classAllowed([{ id: 1, team: 0, classId: 'spy' }], 0, 'spy', 1), false);
  assert.equal(classAllowed([{ id: 1, team: 0, classId: 'spy' }], 1, 'spy', 1), true);
});

test('flag state machine: pickup, drop, return, capture', () => {
  const red = new Flag(0, [-40, 0, 0], { dropReturnTime: 10, returnTouchTime: 2 });
  const blue = new Flag(1, [40, 0, 0]);
  assert.equal(red.tryPickup({ id: 5, team: 0, alive: true, carrying: -1 }), null, 'own team cannot take');
  assert.equal(red.tryPickup({ id: 6, team: 1, alive: false, carrying: -1 }), null, 'dead players cannot take');
  const ev = red.tryPickup({ id: 7, team: 1, alive: true, carrying: -1 });
  assert.equal(ev.type, 'pickup');
  assert.equal(red.state, FLAG_STATE.CARRIED);
  assert.equal(red.tryPickup({ id: 8, team: 1, alive: true, carrying: -1 }), null, 'already carried');
  red.follow([0, 0, 5]);
  assert.deepEqual(red.pos, [0, 0, 5]);
  assert.equal(red.drop([1, 0, 5]).type, 'drop');
  assert.equal(red.state, FLAG_STATE.DROPPED);
  // defenders standing on it return it
  red.update(1, [3], []);
  assert.equal(red.state, FLAG_STATE.RETURNING);
  red.update(0.5, [3], [9]);
  assert.equal(red.state, FLAG_STATE.DROPPED, 'contested pauses return');
  const r = red.update(5, [3], []);
  assert.equal(r.type, 'return');
  assert.equal(red.state, FLAG_STATE.AT_BASE);
  // timeout return
  red.tryPickup({ id: 7, team: 1, alive: true, carrying: -1 });
  red.drop([0, 0, 0]);
  assert.equal(red.update(11).reason, 'timeout');
  // capture requires own flag at base
  red.tryPickup({ id: 7, team: 1, alive: true, carrying: -1 });
  blue.tryPickup({ id: 2, team: 0, alive: true, carrying: -1 });
  assert.equal(red.canCapture(7, blue), false, 'own flag away -> cannot capture');
  blue.resetToBase('test');
  assert.equal(red.canCapture(7, blue), true);
  assert.equal(red.capture().type, 'capture');
  assert.equal(red.state, FLAG_STATE.CAPTURED);
  red.update(0.2);
  assert.equal(red.state, FLAG_STATE.AT_BASE);
});

test('awards spread across different contributions', () => {
  const mk = (id, s) => ({ id, name: `p${id}`, team: id % 2, classId: 'scout', stats: { kills: 0, assists: 0, damage: 0, healing: 0, captures: 0, defenses: 0, returns: 0, pickups: 0, turretKills: 0, score: 0, ...s } });
  const players = [mk(1, { kills: 20, damage: 3000, assists: 2 }), mk(2, { healing: 4000, assists: 15 }), mk(3, { kills: 18, damage: 2900, defenses: 6 })];
  const awards = assignAwards(players, 'tdm');
  const byId = Object.fromEntries(awards.map((a) => [a.id, a.playerId]));
  assert.equal(byId.eliminations, 1);
  assert.equal(byId.healing, 2);
  assert.equal(byId.damage, 3, 'second award yields to a close runner-up');
  assert.ok(!awards.some((a) => a.id === 'captures'), 'CTF-only awards excluded in TDM');
});

test('xp is computed from stats with anti-exploit caps; level curve is monotonic', () => {
  const x = computeMatchXp({ kills: 3, assists: 2, healing: 450, captures: 1 }, true, true);
  assert.equal(x.total, 3 * 50 + 2 * 25 + 4 * 20 + 150 + 100 + 150);
  const capped = computeMatchXp({ kills: 10000 }, false, true);
  assert.equal(capped.lines[0].count, 40);
  for (let l = 1; l < 50; l++) assert.ok(xpForLevel(l + 1) > xpForLevel(l));
  assert.equal(levelFromXp(0).level, 1);
  assert.equal(levelFromXp(xpForLevel(1)).level, 2);
});

test('weapon loadouts: every class has a valid arsenal and picks are sanitized', async () => {
  const { resolveWeapons, sanitizeWeaponLoadouts } = await import('../src/shared/config/classes.js');
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    assert.equal(c.arsenal.length, 3, `${id} arsenal has 3 slots`);
    c.arsenal.forEach((list, slot) => {
      assert.equal(list[0], c.weapons[slot], `${id} default listed first`);
      assert.ok(list.length >= 1, `${id} slot ${slot} has at least one weapon`);
      for (const w of list) assert.equal(WEAPONS[w].slot, slot, `${w} in slot ${slot}`);
    });
  }
  assert.deepEqual(resolveWeapons('scout', ['kickback', 'claymore', '<x>']), ['kickback', 'sidekick', 'streetbat']);
  assert.deepEqual(resolveWeapons('demolitionist', null), CLASSES.demolitionist.weapons);
  const all = sanitizeWeaponLoadouts({ spy: ['longsix', 'derringer', 'stiletto'], scout: 'junk' });
  assert.deepEqual(all.spy, ['longsix', 'derringer', 'stiletto']);
  assert.deepEqual(all.scout, CLASSES.scout.weapons);
});

test('key rewards: only human-vs-human kills count, anti-farm caps, winners only', async () => {
  const { computeKeyRewards, KEY_RULES } = await import('../src/shared/rewards.js');
  const players = [
    { id: 1, team: 0, presence: 300 }, { id: 2, team: 0, presence: 300 }, { id: 3, team: 0, presence: 10 },
    { id: 10, team: 1, presence: 300 }, { id: 11, team: 1, presence: 300 }, { id: 12, team: 1, presence: 300 },
    { id: 50, team: 1, isBot: true, presence: 300 },
  ];
  const k = (killer, victim, team = 0) => ({ killer, victim, team, killerTeam: team, victimTeam: 1 - team });
  // 30 bot kills never count
  const botKills = Array.from({ length: 30 }, () => k(1, 50));
  let r = computeKeyRewards({ kills: botKills, players, winner: 0, duration: 300 });
  assert.equal(r.teams[0].counted, 0);
  assert.deepEqual(r.keys, {});
  // farming one victim is capped (pair cap 3, victim cap 5)
  r = computeKeyRewards({ kills: Array.from({ length: 20 }, () => k(1, 10)), players, winner: 0, duration: 300 });
  assert.equal(r.teams[0].counted, KEY_RULES.PAIR_CAP);
  assert.equal(r.teams[0].qualified, false);
  // 12 legitimate kills spread across three enemies -> qualifies
  const legit = [];
  for (const v of [10, 11, 12]) for (const killer of [1, 2]) legit.push(k(killer, v), k(killer, v));
  r = computeKeyRewards({ kills: legit, players, winner: 0, duration: 300 });
  assert.equal(r.teams[0].counted, 12);
  assert.equal(r.teams[0].qualified, true);
  assert.equal(r.keys[1], 2, 'base key + personal bonus (6 kills)');
  assert.equal(r.keys[2], 2);
  assert.equal(r.keys[3], undefined, 'joined too late and got no kills');
  assert.equal(r.keys[10], undefined, 'losing team gets nothing');
  // same kills but the team lost / draw / match too short -> nothing
  assert.deepEqual(computeKeyRewards({ kills: legit, players, winner: 1, duration: 300 }).keys, {});
  assert.deepEqual(computeKeyRewards({ kills: legit, players, winner: -1, duration: 300 }).keys, {});
  assert.deepEqual(computeKeyRewards({ kills: legit, players, winner: 0, duration: 30 }).keys, {});
  // unknown ids (not in the server's player list) never count
  r = computeKeyRewards({ kills: Array.from({ length: 12 }, (_, i) => k(1, 900 + i)), players, winner: 0, duration: 300 });
  assert.equal(r.teams[0].counted, 0);
});
