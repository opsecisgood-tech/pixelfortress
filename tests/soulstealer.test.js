// Soul-Stealer Shotgun: admin-only secondary, burning pellets with no falloff; whoever it kills rises as
// the holder's minion, which the holder can drive (K / L cycle, J frees).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerGame } from '../src/server/ServerGame.js';
import { PROTOCOL_VERSION, BTN, PF } from '../src/shared/constants.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { hitscanDamage } from '../src/shared/damage.js';

test('soul-stealer: secondary, burning pellets, no damage falloff', () => {
  const def = WEAPONS.soulstealer;
  assert.equal(def.slot, 1);
  assert.equal(def.name, 'Soul-Stealer Shotgun');
  assert.ok(def.pellets > 1 && def.adminOnly && def.burn);
  assert.equal(hitscanDamage(def, { dist: 1 }).damage, hitscanDamage(def, { dist: def.range - 0.1 }).damage);
});

function setup() {
  const evs = [], notices = [], msgs = [];
  const g = new ServerGame({
    mapId: 'dusty_depot', mode: 'tdm', botFill: 0, maxPlayers: 12, trustHostName: true,
    send: (c, m) => { msgs.push([c, m]); if (m.t === 'e') for (const e of m.e) evs.push([c, e]); if (m.t === 'notice') notices.push([c, m.text]); },
  });
  g.handleMessage(1, { t: 'hello', protocol: PROTOCOL_VERSION, name: 'owner', classId: 'soldier' });
  g.handleMessage(2, { t: 'hello', protocol: PROTOCOL_VERSION, name: 'Foe', classId: 'juggernaut' });
  g.handleMessage(3, { t: 'hello', protocol: PROTOCOL_VERSION, name: 'Other', classId: 'scout' });
  for (let i = 0; i < 30 * 6; i++) g.tick();
  const by = (n) => [...g.players.values()].find((p) => p.name === n);
  const me = by('owner');
  // make sure Foe and Other are both enemies of the owner
  for (const q of [by('Foe'), by('Other')]) if (q.team === me.team) { q.team = 1 - me.team; g.spawnPlayer(q); }
  return { g, evs, notices, msgs, me, foe: by('Foe'), other: by('Other') };
}

let seq = 1;
function cmd(g, conn, b, yaw = 0, pitch = 0, slot = 1, c = -1) {
  g.handleMessage(conn, { t: 'c', c: [[seq++, 1 / 60, b, yaw, pitch, slot, g.time, c], [seq++, 1 / 60, b, yaw, pitch, slot, g.time, c]] });
}
// stand the owner on the open road facing -Z with the victim a couple of metres ahead
function place(me, q) {
  me.ms.x = 32; me.ms.z = 4; me.ms.y = 0.03; me.ms.vx = me.ms.vz = 0;
  q.ms.x = 32; q.ms.z = 1.5; q.ms.y = 0.03; q.ms.vx = q.ms.vz = 0; q.spawnProtectUntil = 0;
}
function stealSoul(g, me, q) {
  q.hp = 20;
  for (let i = 0; i < 30 * 3 && q.alive; i++) {
    place(me, q);
    cmd(g, 1, i % 2 ? BTN.FIRE : 0);
    g.tick();
  }
  assert.equal(q.alive, false, 'killed by the shotgun');
  for (let i = 0; i < 30 * 2 && !q.alive; i++) { cmd(g, 1, 0); g.tick(); } // rises after a second
}

test('soul-stealer: only admins hand it out, it sits in the secondary slot and sets targets on fire', () => {
  const { g, me, foe } = setup();
  g.handleMessage(2, { t: 'chat', text: '/adminshotgun' });
  assert.notEqual(foe.weapons[1], 'soulstealer');
  g.handleMessage(1, { t: 'chat', text: '/adminshotgun' });
  assert.equal(me.weapons[1], 'soulstealer');
  for (let i = 0; i < 20; i++) { place(me, foe); cmd(g, 1, 0); g.tick(); }
  foe.hp = 5000; foe.maxHp = 5000;
  for (let i = 0; i < 8; i++) { place(me, foe); cmd(g, 1, i % 2 ? BTN.FIRE : 0); g.tick(); }
  assert.ok(foe.hp < 5000, 'pellets hit');
  assert.ok(foe.burn && foe.burn.src === 'soulstealer', 'target is burning');
  g.handleMessage(1, { t: 'chat', text: '/adminshotgun' });
  assert.notEqual(me.weapons[1], 'soulstealer', 'taken back');
});

test('soul-stealer: a kill rises as a minion the holder can drive, cycle and free', () => {
  const { g, evs, msgs, me, foe } = setup();
  g.handleMessage(1, { t: 'chat', text: '/adminshotgun' });
  for (let i = 0; i < 20; i++) { cmd(g, 1, 0); g.tick(); }
  const origTeam = foe.team;
  stealSoul(g, me, foe);
  assert.ok(evs.some(([, e]) => e[0] === 'ss' && e[1] === me.id && e[2] === foe.id), 'soul-steal effect broadcast');
  assert.equal(foe.alive, true, 'rose again');
  assert.equal(foe.minionOf, me.id);
  assert.equal(foe.team, me.team, 'fights for the holder');
  // ...but everyone still sees it on its own team: roster, its own snapshot, chat and results
  g.sendRoster(); g.sendSnapshots();
  const roster = msgs.filter(([, m]) => m.t === 'r').at(-1)[1];
  assert.equal(roster.players.find((q) => q.id === foe.id).team, origTeam, 'roster keeps the original team');
  assert.equal(msgs.filter(([c, m]) => c === 2 && m.t === 's').at(-1)[1].me.team, origTeam, 'the minion still sees itself on its team');
  assert.equal(g.teamOf(foe), origTeam);
  assert.ok(Math.abs(foe.ms.z - 1.5) < 1.5, 'rose where it fell');
  assert.ok(g.playerFlags(foe) & PF.MINION);
  assert.deepEqual(me.soul.list, [foe.id]);

  // the minion's own input does nothing
  const fz = foe.ms.z;
  for (let i = 0; i < 20; i++) { foe.minionBrain = null; g.handleMessage(2, { t: 'c', c: [[seq++, 1 / 60, BTN.FORWARD, 0, 0, 0, g.time]] }); g.tick(); }
  assert.ok(Math.abs(foe.ms.z - fz) < 0.05, 'minion cannot move itself');

  // L: take control
  g.handleMessage(1, { t: 'minion', a: 'next' });
  assert.equal(me.soul.ctl, foe.id);
  const ctl = msgs.filter(([c, m]) => c === 1 && m.t === 'mctl').at(-1)[1];
  assert.equal(ctl.c, foe.id);
  const mz = me.ms.z, z0 = foe.ms.z;
  // commands still meant for the holder's own body (in flight before the switch) move nobody
  for (let i = 0; i < 10; i++) { cmd(g, 1, BTN.FORWARD, 0, 0, 0, -1); g.tick(); }
  assert.ok(Math.abs(foe.ms.z - z0) < 0.05 && Math.abs(me.ms.z - mz) < 0.05);
  // driving: forward (-Z) walks the minion, the holder's body stays put
  for (let i = 0; i < 30; i++) { cmd(g, 1, BTN.FORWARD, 0, 0, 0, foe.id); g.tick(); }
  assert.ok(foe.ms.z < z0 - 1, 'the holder walks the minion');
  assert.ok(Math.abs(me.ms.z - mz) < 0.05, 'holder body stands still');
  const sn = msgs.filter(([c, m]) => c === 1 && m.t === 's').at(-1)[1];
  assert.equal(sn.me.lock, 1);
  assert.equal(sn.me.mn.c, foe.id);
  // L again cycles back to yourself
  g.handleMessage(1, { t: 'minion', a: 'next' });
  assert.equal(me.soul.ctl, -1);
  // K goes backward: wraps to the last minion
  g.handleMessage(1, { t: 'minion', a: 'prev' });
  assert.equal(me.soul.ctl, foe.id);
  // J frees the driven minion: original team back, control back to the player
  const sc = foe.spawnCount;
  g.handleMessage(1, { t: 'minion', a: 'free' });
  assert.equal(foe.minionOf, null);
  assert.equal(foe.team, origTeam);
  assert.equal(me.soul.ctl, -1);
  assert.ok(foe.alive && foe.spawnCount === sc + 1, 'freed alive, prediction reset');
  const z1 = foe.ms.z;
  for (let i = 0; i < 30; i++) { g.handleMessage(2, { t: 'c', c: [[seq++, 1 / 60, BTN.FORWARD, 0, 0, 0, g.time], [seq++, 1 / 60, BTN.FORWARD, 0, 0, 0, g.time]] }); g.tick(); }
  assert.ok(foe.ms.z < z1 - 1, 'the freed player moves again');
});

test('soul-stealer: several minions, and they are all freed when the holder dies', () => {
  const { g, me, foe, other } = setup();
  g.handleMessage(1, { t: 'chat', text: '/adminshotgun' });
  for (let i = 0; i < 20; i++) { cmd(g, 1, 0); g.tick(); }
  const teams = [foe.team, other.team];
  stealSoul(g, me, foe);
  foe.ms.x = 20; // out of the way
  stealSoul(g, me, other);
  assert.equal(me.soul.list.length, 2);
  g.handleMessage(1, { t: 'minion', a: 'next' });
  assert.equal(me.soul.ctl, foe.id);
  g.handleMessage(1, { t: 'minion', a: 'next' });
  assert.equal(me.soul.ctl, other.id);
  g.handleMessage(1, { t: 'minion', a: 'prev' });
  assert.equal(me.soul.ctl, foe.id);
  g.combat.kill(me, null, 'fall');
  assert.equal(foe.minionOf, null);
  assert.equal(other.minionOf, null);
  assert.deepEqual([foe.team, other.team], teams);
  assert.equal(me.soul, null);
});

test('soul-stealer: a minion that dies is freed and respawns normally', () => {
  const { g, me, foe } = setup();
  g.handleMessage(1, { t: 'chat', text: '/adminshotgun' });
  for (let i = 0; i < 20; i++) { cmd(g, 1, 0); g.tick(); }
  const origTeam = foe.team;
  stealSoul(g, me, foe);
  g.combat.kill(foe, null, 'fall');
  assert.equal(foe.minionOf, null);
  assert.equal(foe.team, origTeam);
  for (let i = 0; i < 30 * 8; i++) { cmd(g, 1, 0); g.tick(); }
  assert.ok(foe.alive && foe.minionOf == null);
});

test('soul-stealer: soul heads home in on an enemy standing well off to the side', () => {
  const { g, me, foe } = setup();
  assert.equal(WEAPONS.soulstealer.projectile.kind, 'soulhead');
  g.handleMessage(1, { t: 'chat', text: '/adminshotgun' });
  for (let i = 0; i < 20; i++) { cmd(g, 1, 0); g.tick(); }
  foe.hp = 5000; foe.maxHp = 5000;
  // facing -Z down the road; the enemy stands ~30 degrees to the left, 9 m away
  const at = () => { me.ms.x = 32; me.ms.z = 4; me.ms.y = 0.03; me.ms.vx = me.ms.vz = 0; foe.ms.x = 27.5; foe.ms.z = -3.8; foe.ms.y = 0.03; foe.ms.vx = foe.ms.vz = 0; foe.spawnProtectUntil = 0; };
  at();
  for (let i = 0; i < 4; i++) { at(); cmd(g, 1, i === 1 ? BTN.FIRE : 0); g.tick(); }
  const heads = [...g.projectiles.list.values()].filter((pr) => pr.kind === 'soulhead');
  assert.equal(heads.length, WEAPONS.soulstealer.pellets, 'one head per pellet');
  assert.ok(heads.every((pr) => pr.variant >= 0 && pr.variant < 9));
  for (let i = 0; i < 30 * 1.5; i++) { at(); cmd(g, 1, 0); g.tick(); }
  assert.ok(5000 - foe.hp >= WEAPONS.soulstealer.damage * 3, `most heads curved into the target (took ${5000 - foe.hp})`);
  assert.equal(foe.burn?.src, 'soulstealer');
});
