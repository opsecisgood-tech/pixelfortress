// The Titan admin transformation: command validation, gem progression, gem powers and the Snap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerGame } from '../src/server/ServerGame.js';
import { PROTOCOL_VERSION, MATCH_STATE } from '../src/shared/constants.js';
import { STONES, TITAN, TFX } from '../src/shared/config/titan.js';

function setup(n = 4) {
  const sent = [];
  const g = new ServerGame({ mapId: 'dusty_depot', mode: 'tdm', botFill: 0, maxPlayers: 12, trustHostName: true, send: (c, m) => sent.push([c, m]) });
  const hello = (conn, name) => g.handleMessage(conn, { t: 'hello', protocol: PROTOCOL_VERSION, name, classId: 'soldier' });
  hello(1, 'owner');
  for (let i = 2; i <= n; i++) hello(i, `P${i}`);
  for (let i = 0; i < 30 * 6; i++) g.tick();
  const byName = (nm) => [...g.players.values()].find((p) => p.name === nm);
  const notices = () => sent.filter(([c, m]) => c === 1 && m.t === 'notice').map(([, m]) => m.text);
  return { g, sent, byName, notices, me: byName('owner') };
}
// stand q right in front of p, both on open floor
function face(g, p, q, d = 2.5) {
  p.ms.x = 32; p.ms.z = 4; p.ms.y = 0.03; p.ms.yaw = 0; p.ms.pitch = 0; p.ms.vx = p.ms.vy = p.ms.vz = 0;
  q.ms.x = 32; q.ms.z = 4 - d; q.ms.y = 0.03; q.ms.vx = q.ms.vy = q.ms.vz = 0;
  q.spawnProtectUntil = 0;
}

test('titan: admin-only command, validated names, transform and revert', () => {
  const { g, byName, notices, me } = setup(3);
  const other = byName('P2');
  g.handleMessage(2, { t: 'chat', text: '/titan owner' });
  assert.equal(me.titan, undefined, 'non-admins cannot transform anyone');
  g.handleMessage(1, { t: 'chat', text: '/titan nobody_here' });
  assert.match(notices().at(-1), /No player called/);
  g.handleMessage(1, { t: 'chat', text: '/titan' });
  assert.match(notices().at(-1), /Usage/);
  g.handleMessage(1, { t: 'chat', text: '/titan P2' });
  assert.ok(other.titan);
  assert.equal(other.classId, 'titan');
  assert.deepEqual(other.weapons, ['titanfist', 'titanfist', 'titanfist']);
  assert.equal(other.maxHp, TITAN.health);
  assert.equal(other.titan.stones.length, 0, 'starts with an empty gauntlet');
  g.handleMessage(2, { t: 'class', classId: 'scout' });
  assert.equal(other.classId, 'titan', 'cannot switch class away while transformed');
  for (let i = 0; i < 30 * 5; i++) g.tick();
  assert.equal(other.classId, 'titan');
  g.handleMessage(1, { t: 'chat', text: '/untitan P2' });
  assert.equal(other.titan, null);
  assert.equal(other.classId, 'soldier');
  assert.notDeepEqual(other.weapons, ['titanfist', 'titanfist', 'titanfist']);
});

test('titan: each confirmed kill adds one new random gem, never a duplicate', () => {
  const { g, byName, me } = setup(4);
  g.titans.transform(me);
  const enemies = [...g.players.values()].filter((q) => q.team !== me.team);
  const seen = new Set();
  for (let k = 0; k < 8; k++) {
    const v = enemies[k % enemies.length];
    if (!v.alive) g.spawnPlayer(v);
    g.combat.kill(v, me, 'titanfist');
    for (const s of me.titan.stones) seen.add(s);
    assert.equal(me.titan.stones.length, Math.min(6, k + 1));
    assert.equal(new Set(me.titan.stones).size, me.titan.stones.length, 'no duplicates');
  }
  assert.deepEqual([...seen].sort(), [...STONES].sort());
  void byName;
});

test('titan: gem powers need their gem and respect cooldowns', () => {
  const { g, byName, notices, me } = setup(3);
  g.titans.transform(me);
  const foe = [...g.players.values()].find((q) => q.team !== me.team);
  face(g, me, foe);
  g.handleMessage(1, { t: 'titan', a: 'punch' });
  assert.match(notices().at(-1), /Power gem/);
  g.titans.award(me, 'power');
  const hp = foe.hp;
  g.handleMessage(1, { t: 'titan', a: 'punch' });
  assert.equal(foe.hp, hp - TITAN.punch.damage);
  assert.ok(foe.stunUntil > g.time, 'punch stuns (ragdoll)');
  assert.ok(Math.hypot(foe.ms.vx, foe.ms.vz) > 10 && foe.ms.vy > 5, 'heavy knockback');
  g.handleMessage(1, { t: 'titan', a: 'punch' });
  assert.equal(foe.hp, hp - TITAN.punch.damage, 'cooldown blocks a second punch');
  // a stunned player's buttons do nothing
  const f = g.titans.filterCommand(foe, { b: 1, dt: 1 / 60, y: 0, p: 0 });
  assert.equal(f.b, 0);
  void byName;
});

test('titan: grab holds then throws; time gem scales a player smoothly and resets', () => {
  const { g, me } = setup(3);
  g.titans.transform(me);
  g.titans.award(me, 'power'); g.titans.award(me, 'time');
  const foe = [...g.players.values()].find((q) => q.team !== me.team);
  face(g, me, foe);
  g.handleMessage(1, { t: 'titan', a: 'grab' });
  assert.equal(foe.grabbedBy, me.id);
  assert.equal(g.titans.filterCommand(foe, { b: 1, dt: 1 / 60 }), null, 'held players cannot move');
  g.tick();
  assert.ok(Math.abs(foe.ms.y - (me.ms.y + 0.9)) < 0.01, 'held up in front of the gauntlet');
  for (let i = 0; i < 30 * (TITAN.grab.hold + 0.3); i++) g.tick();
  assert.equal(foe.grabbedBy, 0, 'thrown when the hold ends');
  for (let i = 0; i < 30 * 3; i++) g.tick();
  if (!foe.alive) g.spawnPlayer(foe);
  face(g, me, foe, 8);
  g.handleMessage(1, { t: 'titan', a: 'timeval', v: 0 });
  g.handleMessage(1, { t: 'titan', a: 'time' });
  assert.equal(foe.timeTarget, TITAN.time.steps[0]);
  g.tick();
  assert.ok(foe.timeScale < 1 && foe.timeScale > TITAN.time.steps[0], 'ramps rather than snapping');
  for (let i = 0; i < 30; i++) g.tick();
  assert.ok(Math.abs(foe.timeScale - TITAN.time.steps[0]) < 1e-6);
  assert.equal(g.titans.filterCommand(foe, { b: 0, dt: 0.1 }).dt.toFixed(3), (0.1 * TITAN.time.steps[0]).toFixed(3), 'movement/weapons run on scaled time');
  assert.ok(g.titans.fxBits(foe) & TFX.TIME);
  g.handleMessage(1, { t: 'titan', a: 'timeval', v: 7 });
  assert.equal(foe.timeTarget, TITAN.time.steps[7], 'strength can be changed while it lasts');
  for (let i = 0; i < 30 * (TITAN.time.duration + 3); i++) g.tick();
  assert.equal(foe.timeScale, undefined, 'back to normal time');
});

test('titan: mind control drives the target and always gives control back', () => {
  const { g, me } = setup(3);
  g.titans.transform(me);
  g.titans.award(me, 'mind');
  const foe = [...g.players.values()].find((q) => q.team !== me.team);
  face(g, me, foe, 6);
  g.handleMessage(1, { t: 'titan', a: 'mind' });
  assert.equal(foe.mindBy, me.id);
  const fz = foe.ms.z, mz = me.ms.z;
  for (let i = 0; i < 20; i++) {
    g.handleMessage(1, { t: 'c', c: [[1000 + i * 2, 1 / 60, 1, 0, 0, 0, g.time], [1001 + i * 2, 1 / 60, 1, 0, 0, 0, g.time]] });
    g.handleMessage(foe.connId, { t: 'c', c: [[500 + i, 1 / 60, 2, 0, 0, 0, g.time]] });
    g.tick();
  }
  assert.ok(foe.ms.z < fz - 1, 'the Titan walks the target forward');
  assert.ok(Math.abs(me.ms.z - mz) < 0.05, 'the Titan stands still meanwhile');
  g.combat.kill(me, null, 'admin');
  assert.equal(foe.mindBy, 0, 'released when the Titan dies');
});

test('titan: portals carry only the Titan; illusions hurt an enemy once', () => {
  const { g, me } = setup(3);
  g.titans.transform(me);
  g.titans.award(me, 'space'); g.titans.award(me, 'reality');
  // place two portals by hand (the aiming path is covered in the browser)
  g.titans.portals.set(1, { id: 1, owner: me.id, kind: 0, x: 32, y: 1.13, z: 0, floor: 0.03, yaw: 0, at: 0 });
  g.titans.portals.set(2, { id: 2, owner: me.id, kind: 1, x: 20, y: 1.13, z: 0, floor: 0.03, yaw: 0, at: 1 });
  const foe = [...g.players.values()].find((q) => q.team !== me.team);
  foe.ms.x = 32; foe.ms.z = 0; foe.ms.y = 0.03;
  me.ms.x = 32.2; me.ms.z = 0.2; me.ms.y = 0.03;
  g.tick();
  assert.ok(Math.hypot(me.ms.x - 20, me.ms.z - 1.3) < 0.6, 'the Titan comes out in front of the exit');
  assert.ok(Math.hypot(foe.ms.x - 32, foe.ms.z) < 1, 'others do not travel');
  // illusion
  g.titans.illusions.set(9, { id: 9, owner: me.id, team: me.team, mat: 'crate', min: [27.5, 0.03, -0.6], max: [28.7, 1.23, 0.6], until: g.time + 60, armAt: 0 });
  foe.ms.x = 28; foe.ms.z = 0; foe.ms.y = 0.03; foe.spawnProtectUntil = 0;
  const hp = foe.hp;
  g.tick();
  assert.equal(foe.hp, hp - TITAN.reality.damage);
  assert.equal(g.titans.illusions.size, 0, 'shatters after one hit');
  g.tick();
  assert.equal(foe.hp, hp - TITAN.reality.damage, 'no repeated damage');
});

test('titan: the Snap needs all six gems, removes half, once per match', () => {
  const { g, notices, me } = setup(9);
  g.titans.transform(me);
  g.handleMessage(1, { t: 'titan', a: 'snap' });
  assert.match(notices().at(-1), /all six gems/);
  while (g.titans.award(me));
  const others = [...g.players.values()].filter((q) => q !== me && q.alive);
  assert.equal(others.length, 8);
  g.handleMessage(1, { t: 'titan', a: 'snap' });
  for (let i = 0; i < 30 * (TITAN.snap.windup + 0.2); i++) g.tick();
  const left = others.filter((q) => q.alive).length;
  assert.equal(left, 4, 'half of the eight are gone');
  assert.ok(me.alive);
  assert.equal(g.state === MATCH_STATE.ENDED, false);
  g.handleMessage(1, { t: 'titan', a: 'snap' });
  assert.match(notices().at(-1), /once per match/);
  // no team kill credit for allies the Snap removed
  const kills = me.stats.kills;
  assert.ok(kills <= others.filter((q) => q.team !== me.team).length);
  g.changeMap(g.mapId, g.modeId);
  assert.equal(me.titan.snapUsed, false, 'available again next match');
});
