// The Admin Gun: admin-only, 5 s charge, heat-seeking beam that destroys whatever it touches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerGame } from '../src/server/ServerGame.js';
import { PROTOCOL_VERSION, BTN } from '../src/shared/constants.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { getClass } from '../src/shared/config/classes.js';
import { createWeaponState, stepWeapons } from '../src/shared/weaponLogic.js';

test('admin gun: charges for 5 seconds, fires by itself when full, drains if released', () => {
  const def = WEAPONS.admingun;
  assert.equal(def.chargeShot, 5);
  assert.equal(def.damage, 1000);
  const ws = createWeaponState(getClass('soldier'), 0, ['admingun', 'breacher', 'shovel']);
  const ctx = { alive: true, pid: 1, grounded: true };
  const step = (b, n) => { const out = []; for (let i = 0; i < n; i++) out.push(...stepWeapons(ws, { b, dt: 1 / 60, w: 0, y: 0, p: 0 }, ctx)); return out; };
  step(0, 30); // deploy
  let evs = step(BTN.FIRE, 60 * 4.5);
  assert.ok(evs.some((e) => e.type === 'chargestart'));
  assert.ok(!evs.some((e) => e.type === 'fire'), 'no shot before the charge completes');
  assert.ok(ws.w[0].charge > 0.85 && ws.w[0].charge < 1);
  evs = step(0, 60);
  assert.ok(evs.some((e) => e.type === 'chargestop' && !e.fired), 'releasing early drains the charge');
  assert.equal(ws.w[0].charge, 0);
  evs = step(BTN.FIRE, 60 * 5 + 2);
  assert.equal(evs.filter((e) => e.type === 'fire').length, 1, 'one blast after five seconds');
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
  const beam = evs.filter(([, e]) => e[0] === 'ab');
  assert.ok(beam.length >= 1);
  const [, e] = beam[0];
  assert.equal(e[1], me.id);
  assert.equal(e[3], 1, 'hit a player');
  assert.equal(e[4], foe.id);
  const pts = e[2];
  assert.ok(Math.abs(pts.at(-3) - 30) < 0.8, 'the path curved toward the target');
  // the impact event reaches every connected player (for the screen shake)
  assert.deepEqual([...new Set(beam.map(([c]) => c))].sort(), [1, 2, 3]);
  assert.ok(evs.some(([c, x]) => c === 2 && x[0] === 'agc' && x[1] === me.id && x[2] === 1), 'others see and hear the charge');
});

test('admin gun: teammates are safe; the beam stops at walls', () => {
  const { g, evs, me, mate } = setup();
  g.handleMessage(1, { t: 'chat', text: '/admingun' });
  const place = () => {
    me.ms.x = 32; me.ms.z = 4; me.ms.y = 0.03;
    mate.ms.x = 32; mate.ms.z = 0; mate.ms.y = 0.03; mate.team = me.team;
  };
  place();
  holdFire(g, 30 * 6, place, Math.PI / 2, 0); // face -x, toward the warehouse
  assert.ok(mate.alive);
  const ab = evs.find(([, e]) => e[0] === 'ab')[1];
  assert.equal(ab[3], 0, 'ended on the world');
});
