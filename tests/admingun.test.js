// The Admin Gun: admin-only, 3 s charge, heat-seeking piercing beam that destroys every enemy it touches
// and burns round holes through the world.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerGame } from '../src/server/ServerGame.js';
import { PROTOCOL_VERSION, BTN } from '../src/shared/constants.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getClass } from '../src/shared/config/classes.js';
import { createWeaponState, stepWeapons } from '../src/shared/weaponLogic.js';

test('admin gun: charges for 3 seconds, fires by itself when full, drains if released', () => {
  const def = WEAPONS.admingun;
  assert.equal(def.chargeShot, 3);
  assert.equal(def.damage, 1000);
  const ws = createWeaponState(getClass('soldier'), 0, ['admingun', 'breacher', 'shovel']);
  const ctx = { alive: true, pid: 1, grounded: true };
  const step = (b, n) => { const out = []; for (let i = 0; i < n; i++) out.push(...stepWeapons(ws, { b, dt: 1 / 60, w: 0, y: 0, p: 0 }, ctx)); return out; };
  step(0, 30); // deploy
  let evs = step(BTN.FIRE, 60 * 2.7);
  assert.ok(evs.some((e) => e.type === 'chargestart'));
  assert.ok(!evs.some((e) => e.type === 'fire'), 'no shot before the charge completes');
  assert.ok(ws.w[0].charge > 0.85 && ws.w[0].charge < 1);
  evs = step(0, 60);
  assert.ok(evs.some((e) => e.type === 'chargestop' && !e.fired), 'releasing early drains the charge');
  assert.equal(ws.w[0].charge, 0);
  evs = step(BTN.FIRE, 60 * 3 + 2);
  assert.equal(evs.filter((e) => e.type === 'fire').length, 1, 'one blast after three seconds');
});

function setup() {
  const evs = [], notices = [];
  const g = new ServerGame({ mapId: 'dusty_depot', mode: 'tdm', botFill: 0, maxPlayers: 12, trustHostName: true, send: (c, m) => { if (m.t === 'e') for (const e of m.e) evs.push([c, e]); if (m.t === 'notice') notices.push([c, m.text]); } });
  g.handleMessage(1, { t: 'hello', protocol: PROTOCOL_VERSION, name: 'owner', classId: 'soldier' });
  g.handleMessage(2, { t: 'hello', protocol: PROTOCOL_VERSION, name: 'Foe', classId: 'juggernaut' });
  g.handleMessage(3, { t: 'hello', protocol: PROTOCOL_VERSION, name: 'Mate', classId: 'scout' });
  for (let i = 0; i < 30 * 6; i++) g.tick();
  const by = (n) => [...g.players.values()].find((p) => p.name === n);
  return { g, evs, notices, me: by('owner'), foe: by('Foe'), mate: by('Mate') };
}
function holdFire(g, frames, place, yaw = 0, pitch = 0) {
  let seq = 1;
  for (let i = 0; i < frames; i++) {
    g.handleMessage(1, { t: 'c', c: [[seq++, 1 / 60, BTN.FIRE, yaw, pitch, 0, g.time], [seq++, 1 / 60, BTN.FIRE, yaw, pitch, 0, g.time]] });
    g.tick();
    place();
  }
}

test('admin gun: only admins can hand it out; it survives respawns and can be taken back', () => {
  const { g, notices, me, foe } = setup();
  g.handleMessage(2, { t: 'chat', text: '/admingun' });
  assert.notEqual(foe.weapons[0], 'admingun');
  g.handleMessage(1, { t: 'chat', text: '/admingun nobody_here' });
  assert.match(notices.at(-1)[1], /No player called/);
  g.handleMessage(1, { t: 'chat', text: '/admingun' });
  assert.equal(me.weapons[0], 'admingun');
  g.combat.kill(me, null, 'fall');
  for (let i = 0; i < 30 * 6; i++) g.tick();
  assert.ok(me.alive);
  assert.equal(me.weapons[0], 'admingun', 'kept after respawning');
  g.handleMessage(1, { t: 'chat', text: '/admingun' });
  assert.notEqual(me.weapons[0], 'admingun');
});

test('admin gun: the beam bends toward an enemy, kills through protection, every player is told', () => {
  const { g, evs, me, foe } = setup();
  g.handleMessage(1, { t: 'chat', text: '/admingun' });
  // aim straight down the open road; the enemy stands off to the side
  const place = () => {
    me.ms.x = 32; me.ms.z = 4; me.ms.y = 0.03; me.ms.vx = me.ms.vz = 0;
    foe.ms.x = 29.8; foe.ms.z = -3.5; foe.ms.y = 0.03; foe.spawnProtectUntil = g.time + 10;
  };
  place();
  holdFire(g, 30 * 6, () => { if (foe.alive) place(); });
  assert.equal(foe.alive, false, 'destroyed by the beam');
  const beam = evs.filter(([, e]) => e[0] === 'agb');
  assert.ok(beam.length >= 1);
  const [, e] = beam[0];
  assert.equal(e[1], me.id);
  assert.deepEqual(e[3], [foe.id], 'hit the enemy');
  const pts = e[2];
  const near = []; for (let i = 0; i < pts.length; i += 3) near.push(Math.hypot(pts[i] - 29.8, pts[i + 2] + 3.5));
  assert.ok(Math.min(...near) < 1, 'the path curved through the target');
  // the impact event reaches every connected player (for the screen shake)
  assert.deepEqual([...new Set(beam.map(([c]) => c))].sort(), [1, 2, 3]);
  assert.ok(evs.some(([c, x]) => c === 2 && x[0] === 'agc' && x[1] === me.id && x[2] === 1), 'others see and hear the charge');
});

test('admin gun: pierces walls (burning round holes shots pass through) and hits several enemies; teammates are safe', () => {
  const { g, evs, me, foe, mate } = setup();
  const foe2 = g.createPlayer({ name: 'Foe2', team: foe.team, classId: 'scout', isBot: false, connId: null, token: 'x' });
  g.spawnPlayer(foe2);
  g.handleMessage(1, { t: 'chat', text: '/admingun' });
  // shoot west down the road at two enemies in a line, with a teammate between them off to the side
  const place = () => {
    me.ms.x = 36; me.ms.z = 0; me.ms.y = 0.03; me.ms.vx = me.ms.vz = 0;
    if (foe.alive) { foe.ms.x = 31; foe.ms.z = 0; foe.ms.y = 0.03; foe.spawnProtectUntil = 0; }
    if (foe2.alive) { foe2.ms.x = 28; foe2.ms.z = 0.3; foe2.ms.y = 0.03; foe2.spawnProtectUntil = 0; }
    mate.team = me.team; mate.ms.x = 33; mate.ms.z = 0; mate.ms.y = 0.03;
  };
  place();
  holdFire(g, 30 * 4, place, Math.PI / 2, 0); // yaw +90deg = facing -x
  const ab = evs.find(([, e]) => e[0] === 'agb')[1];
  assert.equal(ab[3].length, 2, 'both enemies were hit by one beam');
  assert.ok(!foe.alive && !foe2.alive);
  assert.ok(mate.alive, 'the teammate in its path is unharmed');
  assert.ok(g.holes.length >= 1, 'holes were burnt through the warehouse');
  assert.ok(ab[4].length >= 12, 'hole entries/exits sent for the rim effects');
  // a shot along the beam's line now passes through the first hole it made
  const h = g.holes[0];
  const d = [h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]];
  const l = Math.hypot(...d);
  const o = [h.a[0] - d[0] / l, h.a[1] - d[1] / l, h.a[2] - d[2] / l];
  const r = g.world.raycast(o[0], o[1], o[2], d[0] / l, d[1] / l, d[2] / l, l + 2);
  assert.ok(!r || r.t > l + 0.5, 'shots fly through the hole');
});

test('admin gun holes are real gaps: fall through a floor hole, crouch through a wall hole', async () => {
  const { World } = await import('../src/shared/physics.js');
  const { createMoveState, stepMovement, moveParamsFor } = await import('../src/shared/movement.js');
  const w = new World([{ min: [-10, -1, -10], max: [10, 0, 10] }, { min: [-5, 0, -3], max: [5, 4, -2.5] }]);
  const P = moveParamsFor(getClass('soldier'));
  const r = WEAPONS.admingun.holeRadius;
  w.setHoles([{ a: [0, 0.01, 0], b: [0, -1.01, 0], r, box: 0 }]);
  let s = createMoveState(0, 0.001, 0, 0);
  for (let i = 0; i < 60; i++) stepMovement(s, { b: 0, dt: 1 / 60, y: 0, p: 0 }, w, P);
  assert.ok(s.y < -1, 'fell through the floor hole');
  w.setHoles([{ a: [0, 0.65, -2.49], b: [0, 0.65, -3.01], r, box: 1 }]);
  const walk = (crouch) => { const m = createMoveState(0, 0.001, 0, 0); for (let i = 0; i < 150; i++) stepMovement(m, { b: BTN.FORWARD | (crouch ? BTN.CROUCH : 0), dt: 1 / 60, y: 0, p: 0 }, w, P); return m; };
  assert.ok(walk(false).z > -2.2, 'standing up you bump into the rim');
  assert.ok(walk(true).z < -3.2, 'crouched you fit through');
  // the floor right next to the wall hole is untouched
  s = createMoveState(0, 0.001, -2.0, 0);
  for (let i = 0; i < 60; i++) stepMovement(s, { b: 0, dt: 1 / 60, y: 0, p: 0 }, w, P);
  assert.ok(s.y > -0.01, 'the floor beside the hole still holds you');
});
