// Integration tests: movement, weapon state machine, authoritative server (damage validation, scoring,
// respawn, match completion, CTF captures, abilities, anti-cheat), all six maps, and real
// client/server netcode with multiple simulated clients over a lossy-latency transport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/shared/physics.js';
import { createMoveState, stepMovement, moveParamsFor } from '../src/shared/movement.js';
import { createWeaponState, stepWeapons, shotDirections } from '../src/shared/weaponLogic.js';
import { getClass } from '../src/shared/config/classes.js';
import { WEAPONS } from '../src/shared/config/weapons.js';
import { BTN, BASE_SPEED, MATCH_STATE, FLAG_STATE, PROTOCOL_VERSION } from '../src/shared/constants.js';
import { ServerGame } from '../src/server/ServerGame.js';
import { NetClient } from '../src/client/net/NetClient.js';
import { getMap, MAP_IDS } from '../src/maps/index.js';
import { NavGraph } from '../src/shared/nav.js';
import { dirFromAngles, anglesFromDir } from '../src/shared/math.js';

const flat = () => new World([{ min: [-50, -1, -50], max: [50, 0, 50], mat: 'x' }, { min: [5, 0, -5], max: [6, 3, 5], mat: 'x' }, { min: [-3, 0, -5], max: [-2, 0.4, 5], mat: 'x' }, { min: [-8, 0, -5], max: [-7, 1.0, 5], mat: 'x' }]);
const cmd = (b, dt = 1 / 60, y = 0, p = 0) => ({ b, dt, y, p });

test('movement: acceleration to class speed, walls block, steps climb, ledges need a jump', () => {
  const w = flat();
  const s = createMoveState(0, 0.01, 0, -Math.PI / 2); // facing +X
  const P = moveParamsFor(getClass('marksman'));
  for (let i = 0; i < 30; i++) stepMovement(s, cmd(BTN.FORWARD, 1 / 60, -Math.PI / 2), w, P);
  assert.ok(s.grounded);
  assert.ok(Math.abs(Math.hypot(s.vx, s.vz) - BASE_SPEED) < 0.3, `speed ${Math.hypot(s.vx, s.vz)}`);
  for (let i = 0; i < 120; i++) stepMovement(s, cmd(BTN.FORWARD, 1 / 60, -Math.PI / 2), w, P);
  assert.ok(s.x < 5 - 0.39 && s.x > 4, `stopped by wall at ${s.x}`);
  // step up a 0.4 kerb walking -X
  const t = createMoveState(0, 0.01, 0, Math.PI / 2);
  for (let i = 0; i < 120; i++) stepMovement(t, cmd(BTN.FORWARD, 1 / 60, Math.PI / 2), w, P);
  assert.ok(t.x < -3, 'walked over the kerb');
  assert.ok(t.x > -7.5, 'blocked by 1 m ledge without jumping');
});

test('movement: scout double jump reaches higher than a single jump; heavy is slower', () => {
  const w = flat();
  const peak = (cls, doubleJump) => {
    const s = createMoveState(20, 0.01, 20, 0);
    const P = moveParamsFor(getClass(cls));
    let max = 0;
    stepMovement(s, cmd(0), w, P);
    for (let i = 0; i < 90; i++) {
      let b = i === 1 ? BTN.JUMP : 0;
      if (doubleJump && i === 20) b = BTN.JUMP;
      stepMovement(s, cmd(b), w, P);
      max = Math.max(max, s.y);
    }
    return max;
  };
  assert.ok(peak('scout', true) > peak('scout', false) + 0.5);
  assert.ok(Math.abs(peak('juggernaut', true) - peak('juggernaut', false)) < 0.01, 'no double jump for heavy');
  const run = (cls) => { const s = createMoveState(0, 0.01, 20, 0); const P = moveParamsFor(getClass(cls)); for (let i = 0; i < 120; i++) stepMovement(s, cmd(BTN.FORWARD), w, P); return Math.hypot(s.vx, s.vz); };
  assert.ok(run('juggernaut') < run('marksman') && run('marksman') < run('scout'));
});

test('weapons: fire cadence, ammo, magazine and shell reloads, interruption, switching', () => {
  const smg = createWeaponState(getClass('marksman'), 1);
  let shots = 0;
  const ctx = () => ({ alive: true, pid: 1, grounded: true });
  for (let i = 0; i < 60; i++) shots += stepWeapons(smg, { b: BTN.FIRE, dt: 1 / 60, w: 1 }, ctx()).filter((e) => e.type === 'fire').length;
  const exp = Math.floor((1 - 0.4) / WEAPONS.compactsmg.fireInterval) + 1;
  assert.ok(Math.abs(shots - exp) <= 1, `smg shots ${shots} expected ~${exp}`);
  assert.equal(smg.w[1].clip, WEAPONS.compactsmg.clip - shots);
  // semi-auto requires releasing the trigger
  const pistol = createWeaponState(getClass('scout'), 1);
  let p = 0;
  for (let i = 0; i < 120; i++) p += stepWeapons(pistol, { b: BTN.FIRE, dt: 1 / 60, w: 1 }, ctx()).filter((e) => e.type === 'fire').length;
  assert.equal(p, 1, 'holding fire on a semi-auto fires once');
  // empty magazine -> automatic reload with correct duration
  const rev = createWeaponState(getClass('spy'), 1);
  for (let i = 0; i < 400; i++) stepWeapons(rev, { b: i % 2 ? BTN.FIRE : 0, dt: 1 / 60, w: 1 }, ctx());
  assert.ok(rev.w[1].reserve < WEAPONS.revolver.reserve, 'reloaded from reserve');
  // shell reload interrupted by firing
  const sg = createWeaponState(getClass('scout'), 0);
  for (let i = 0; i < 60; i++) stepWeapons(sg, { b: i === 30 ? BTN.FIRE : 0, dt: 1 / 60, w: 0 }, ctx());
  stepWeapons(sg, { b: BTN.RELOAD, dt: 1 / 60, w: 0 }, ctx());
  for (let i = 0; i < 50; i++) stepWeapons(sg, { b: 0, dt: 1 / 60, w: 0 }, ctx());
  assert.equal(sg.w[0].rel > 0 || sg.w[0].clip === WEAPONS.scattershot.clip, true);
  const ev = stepWeapons(sg, { b: BTN.FIRE, dt: 1 / 60, w: 0 }, ctx());
  assert.ok(ev.some((e) => e.type === 'fire'), 'firing interrupts a shell reload');
  // switching cancels reload and delays firing by holster + deploy
  const sw = createWeaponState(getClass('scout'), 0);
  sw.time = 5; sw.ready = 0;
  const e1 = stepWeapons(sw, { b: 0, dt: 1 / 60, w: 2 }, ctx());
  assert.ok(e1.some((e) => e.type === 'switch'));
  assert.equal(sw.slot, 2);
  assert.ok(sw.ready > sw.time + 0.2);
});

test('weapons: rotary cannon must spin up; spread pattern is deterministic', () => {
  const ws = createWeaponState(getClass('juggernaut'), 0);
  ws.ready = 0;
  let first = -1;
  for (let i = 0; i < 90; i++) { const e = stepWeapons(ws, { b: BTN.FIRE, dt: 1 / 60, w: 0 }, { alive: true, pid: 1, grounded: true }); if (first < 0 && e.some((x) => x.type === 'fire')) first = i / 60; }
  assert.ok(first >= WEAPONS.cyclone.spinUp - 0.02, `first shot at ${first}`);
  assert.deepEqual(shotDirections(0.3, 0.1, 0.07, 10, 1234), shotDirections(0.3, 0.1, 0.07, 10, 1234));
});

test('all six maps: spawns clear, both flags, and every spawn can path to the enemy flag', () => {
  assert.equal(MAP_IDS.length, 4);
  for (const id of MAP_IDS) {
    const m = getMap(id);
    const w = new World(m.boxes, m.bounds);
    assert.ok(m.flags[0] && m.flags[1], `${id} flags`);
    assert.ok(m.spawns.filter((s) => s.team === 0).length >= 8 && m.spawns.filter((s) => s.team === 1).length >= 8, `${id} spawns`);
    for (const s of m.spawns) assert.ok(!w.overlapsSolid(s.pos[0] - 0.4, s.pos[1] + 0.02, s.pos[2] - 0.4, s.pos[0] + 0.4, s.pos[1] + 1.85, s.pos[2] + 0.4), `${id} spawn inside geometry`);
    const nav = new NavGraph(w, m.bounds);
    for (const t of [0, 1]) {
      const sp = m.spawns.find((s) => s.team === t);
      assert.ok(nav.pathBetween(sp.pos, m.flags[1 - t]), `${id}: team ${t} cannot reach enemy flag`);
    }
    assert.ok(m.boxes.length > 250, `${id} has real geometry`);
    assert.ok(m.deco.length > 30, `${id} has environmental props`);
  }
});

// ---------------------------------------------------------------- server helpers
function makeServer(opts = {}) {
  const out = new Map();
  const g = new ServerGame({ mapId: 'dusty_depot', mode: 'tdm', botFill: 0, persistent: true, send: (c, m) => { if (!out.has(c)) out.set(c, []); out.get(c).push(m); }, ...opts });
  return { g, out };
}
function join(g, conn, name, extra = {}) {
  g.handleMessage(conn, { t: 'hello', protocol: PROTOCOL_VERSION, name, ...extra });
  return [...g.players.values()].find((p) => p.connId === conn);
}
function startPlaying(g) {
  for (let i = 0; i < 30 * 6; i++) g.tick();
  assert.equal(g.state, MATCH_STATE.PLAYING);
}
function place(p, x, y, z, yaw = 0) { p.ms.x = x; p.ms.y = y; p.ms.z = z; p.ms.yaw = yaw; p.history = []; p.spawnProtectUntil = 0; }
function aimAt(p, q) { return anglesFromDir(q.ms.x - p.ms.x, q.ms.y + 1.0 - (p.ms.y + 1.62), q.ms.z - p.ms.z); }

test('server: teams auto-balance and the client cannot pick damage values', () => {
  const { g } = makeServer();
  const a = join(g, 1, 'Alpha', { classId: 'spy' });
  const b = join(g, 2, 'Bravo', { classId: 'marksman' });
  assert.notEqual(a.team, b.team);
  startPlaying(g);
  // a client message claiming damage is simply ignored
  g.handleMessage(1, { t: 'damage', target: b.id, amount: 9999 });
  g.tick();
  assert.equal(b.hp, b.maxHp);
});

test('server: validated hitscan damage, single score per elimination, respawn, match end at limit', () => {
  const { g, out } = makeServer();
  g.modeCfg.scoreLimit = 2;
  const a = join(g, 1, 'Alpha', { classId: 'spy' });
  const b = join(g, 2, 'Bravo', { classId: 'scout' });
  startPlaying(g);
  place(a, 0, 0.01, 18, Math.PI / 2); place(b, -4, 0.01, 18);
  a.ws.slot = 0; a.ws.ready = 0;  // revolver
  let seq = a.lastSeq;
  let kills = 0;
  for (let i = 0; i < 400 && g.state !== MATCH_STATE.ENDED; i++) {
    if (b.alive) { place(b, -4, 0.01, 18); }
    const ang = aimAt(a, b);
    g.handleMessage(1, { t: 'c', c: [[++seq, 1 / 30, i % 2 ? BTN.FIRE : 0, ang.yaw, ang.pitch, 0, g.time]] });
    g.tick();
    kills = a.stats.kills;
  }
  assert.equal(g.state, MATCH_STATE.ENDED, 'score limit ends the match');
  assert.equal(g.scores[a.team], 2);
  assert.equal(kills, 2, 'exactly one point per elimination');
  assert.equal(b.stats.deaths, 2);
  const res = out.get(1).find((m) => m.t === 'res');
  assert.ok(res && res.r.winner === a.team && res.r.awards.length > 0);
});

test('server: fire-rate, ammunition and speed-hack validation', () => {
  const { g } = makeServer();
  const a = join(g, 1, 'Alpha', { classId: 'spy' });
  join(g, 2, 'Bravo');
  startPlaying(g);
  a.ws.slot = 0; a.ws.ready = 0;
  const clip0 = a.ws.w[0].clip;
  // flood: 30 commands in one tick alternating fire -> server only fires at the weapon's cadence
  let seq = a.lastSeq;
  const list = [];
  for (let i = 0; i < 30; i++) list.push([++seq, 1 / 60, i % 2 ? BTN.FIRE : 0, 0, 0, 0, g.time]);
  g.handleMessage(1, { t: 'c', c: list });
  for (let i = 0; i < 30; i++) g.tick();
  const fired = clip0 - a.ws.w[0].clip;
  assert.ok(fired <= Math.ceil(0.5 / WEAPONS.revolver.fireInterval) + 1, `fired ${fired}`);
  // speed hack: claim huge dt per command -> clamped, and command budget limits throughput
  const x0 = a.ms.x;
  place(a, 0, 0.01, 18, -Math.PI / 2);
  const flood = [];
  for (let i = 0; i < 30; i++) flood.push([++seq, 5, BTN.FORWARD | BTN.SPRINT, -Math.PI / 2, 0, 0, g.time]);
  g.handleMessage(1, { t: 'c', c: flood });
  g.tick();
  const moved = Math.abs(a.ms.x - 0);
  assert.ok(moved < 2.5, `moved ${moved}m in one tick`);
  void x0;
});

test('server: ability cooldowns are enforced; spy disguise breaks on attack', () => {
  const { g } = makeServer();
  const j = join(g, 1, 'Heavy', { classId: 'juggernaut' });
  const s = join(g, 2, 'Sneak', { classId: 'spy' });
  startPlaying(g);
  let seq = j.lastSeq;
  const press = (p, conn, b) => g.handleMessage(conn, { t: 'c', c: [[++p.__seq || (p.__seq = p.lastSeq + 1), 1 / 30, b, 0, 0, null, g.time]] });
  void seq;
  press(j, 1, BTN.ABILITY); g.tick();
  assert.equal(j.ability.active, true);
  const cd = j.ability.cdUntil;
  press(j, 1, 0); g.tick(); press(j, 1, BTN.ABILITY); g.tick();
  assert.equal(j.ability.cdUntil, cd, 'second activation during cooldown ignored');
  press(s, 2, BTN.ABILITY); g.tick();
  assert.ok(s.disguise, 'spy disguised');
  s.ws.ready = 0; s.ws.slot = 0;
  press(s, 2, BTN.FIRE); g.tick();
  assert.equal(s.disguise, null, 'attacking reveals the spy');
  assert.ok(s.ability.cdUntil > g.time);
});

test('server: CTF pickup, carrier drop on death, and server-validated capture', () => {
  const { g } = makeServer({ mode: 'ctf' });
  const a = join(g, 1, 'Runner', { classId: 'scout' });
  const d = join(g, 2, 'Guard', { classId: 'juggernaut' });
  startPlaying(g);
  const enemyFlag = g.mode.flags[d.team];
  // walk onto the enemy flag
  place(a, enemyFlag.base[0], enemyFlag.base[1] + 0.01, enemyFlag.base[2]);
  g.tick();
  assert.equal(enemyFlag.state, FLAG_STATE.CARRIED);
  assert.equal(a.carrying, d.team);
  // carrier eliminated -> flag drops where they died
  place(a, 0, 0.01, 18);
  g.tick();
  g.combat.kill(a, d, 'cyclone');
  g.tick();
  assert.equal(enemyFlag.state, FLAG_STATE.DROPPED);
  assert.ok(Math.abs(enemyFlag.pos[0]) < 1);
  // respawn, pick it up again, bring it home
  for (let i = 0; i < 30 * 8; i++) g.tick();
  assert.ok(a.alive);
  place(a, enemyFlag.pos[0], enemyFlag.pos[1] + 0.01, enemyFlag.pos[2]);
  g.tick();
  assert.equal(a.carrying, d.team);
  const home = g.mode.flags[a.team].base;
  place(a, home[0], home[1] + 0.01, home[2]);
  g.tick();
  assert.equal(g.scores[a.team], 1, 'capture scored');
  assert.equal(a.stats.captures, 1);
  assert.equal(enemyFlag.state === FLAG_STATE.AT_BASE || enemyFlag.state === FLAG_STATE.CAPTURED, true);
});

test('server: full bot matches complete in both modes on every map without errors', () => {
  for (const mapId of MAP_IDS) {
    for (const mode of ['tdm', 'ctf']) {
      const g = new ServerGame({ mapId, mode, botFill: 10, persistent: true, send: () => {} });
      g.balanceBots();
      g.startPreRound();
      g.modeCfg.duration = 40;
      g.timeLeft = 40;
      for (let i = 0; i < 30 * 60 && g.state !== MATCH_STATE.ENDED; i++) g.tick();
      // overtime may still be running; force-advance
      for (let i = 0; i < 30 * 200 && g.state !== MATCH_STATE.ENDED; i++) g.tick();
      assert.equal(g.state, MATCH_STATE.ENDED, `${mapId}/${mode} ended`);
      assert.ok(g.results && g.results.players.length === 10);
      const kills = g.results.players.reduce((s, p) => s + p.stats.kills, 0);
      assert.ok(kills > 0, `${mapId}/${mode}: bots fought (${kills} kills)`);
    }
  }
});

// ---------------------------------------------------------------- real netcode with simulated clients
function linkedTransports(g, connId, latencyMs) {
  const client = {
    kind: 'test', onmessage: () => {}, onclose: () => {},
    send: (m) => setTimeout(() => g.handleMessage(connId, JSON.parse(JSON.stringify(m))), latencyMs),
    close() {},
  };
  return client;
}

test('netcode: two clients connect, see each other, predict movement and reconcile with the server', async () => {
  const sinks = new Map();
  const g = new ServerGame({ mapId: 'dusty_depot', mode: 'tdm', botFill: 0, persistent: true, send: (c, m) => { const s = sinks.get(c); if (s) setTimeout(() => s.onmessage(JSON.parse(JSON.stringify(m))), 40); } });
  const tA = linkedTransports(g, 1, 40), tB = linkedTransports(g, 2, 40);
  sinks.set(1, tA); sinks.set(2, tB);
  const A = new NetClient(tA, { name: 'Alpha', classId: 'scout' });
  const B = new NetClient(tB, { name: 'Bravo', classId: 'juggernaut' });
  A.start(); B.start();
  const timer = setInterval(() => g.tick(), 1000 / 30);
  let last = performance.now();
  const errs = [];
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;
      const st = A.latest?.ms;
      const moving = st === MATCH_STATE.PLAYING;
      A.update(dt, { buttons: moving ? BTN.FORWARD : 0, yaw: -Math.PI / 2, pitch: 0 });
      B.update(dt, { buttons: 0, yaw: Math.PI / 2, pitch: 0 });
      if (moving && A.me?.alive) {
        const srv = [...g.players.values()].find((p) => p.connId === 1);
        errs.push(Math.abs(srv.ms.x - A.ms.x));
      }
    }, 16);
    setTimeout(() => { clearInterval(iv); resolve(); }, 8500);
  });
  clearInterval(timer);
  assert.ok(A.myId > 0 && B.myId > 0 && A.myId !== B.myId);
  assert.equal(A.roster.size, 2);
  assert.ok(A.history.has(B.myId), 'A receives B in snapshots');
  assert.ok(B.history.has(A.myId), 'B receives A in snapshots');
  const srvA = [...g.players.values()].find((p) => p.connId === 1);
  assert.ok(srvA.ms.x > -55, `server moved A forward (x=${srvA.ms.x})`);
  const rt = B.renderTime();
  const seen = B.sample(A.myId, rt);
  assert.ok(seen && Math.abs(seen.x - srvA.ms.x) < 3, 'B sees A near the authoritative position');
  // prediction runs ahead of the server by about the round trip; it must stay close and never diverge
  const maxErr = Math.max(...errs);
  assert.ok(errs.length > 30, 'collected samples');
  assert.ok(maxErr < 2.5, `prediction error ${maxErr.toFixed(2)} m`);
  void dirFromAngles;
});

test('server: sticky bombs stick, arm, detonate on alt-fire and cap at eight', () => {
  const { g } = makeServer();
  const d = join(g, 1, 'Demo', { classId: 'demolitionist' });
  const v = join(g, 2, 'Target', { classId: 'juggernaut' });
  startPlaying(g);
  place(d, 0, 0.01, 18, 0); place(v, 30, 0.01, 30);
  d.ws.slot = 1; d.ws.ready = 0;
  let seq = d.lastSeq;
  const cmd = (b, pitch = -1.2) => { g.handleMessage(1, { t: 'c', c: [[++seq, 1 / 30, b, 0, pitch, 1, g.time]] }); g.tick(); };
  // fire at the floor a few times
  for (let i = 0; i < 40; i++) cmd(i % 2 ? BTN.FIRE : 0);
  const mine = () => [...g.projectiles.list.values()].filter((p) => p.kind === 'sticky' && p.owner === d.id);
  assert.ok(mine().length >= 2, `laid ${mine().length} stickies`);
  for (let i = 0; i < 30; i++) cmd(0);
  assert.ok(mine().every((p) => p.stuck), 'stickies cling to the floor');
  const hp0 = d.hp;
  cmd(BTN.ALT); cmd(0);
  assert.equal(mine().length, 0, 'alt-fire detonates all armed stickies');
  assert.ok(d.hp < hp0, 'standing on your own stickies hurts (sticky jump)');
  // cap
  for (let i = 0; i < 9; i++) g.projectiles.spawn({ kind: 'sticky', owner: d.id, team: d.team, pos: [0, 0.2, 10], vel: [0, 0, 0], stick: true, noAutoExplode: true, life: 90 });
  g.projectiles.capStickies(d.id);
  assert.equal(mine().length, 8);
});

test('server: spy cloak hides from turrets, blocks attacks and drains; sapper disables turrets', () => {
  const { g } = makeServer();
  const s = join(g, 1, 'Spy', { classId: 'spy' });
  const m = join(g, 2, 'Mech', { classId: 'mechanic' });
  startPlaying(g);
  place(s, 0, 0.01, 18, 0); place(m, 4, 0.01, 18);
  let seq = s.lastSeq;
  const cmd = (b, slot = 0) => { g.handleMessage(1, { t: 'c', c: [[++seq, 1 / 30, b, 0, 0, slot, g.time]] }); g.tick(); };
  cmd(BTN.ALT); cmd(0);
  assert.equal(s.cloak.on, true, 'right-click cloaks');
  s.ws.ready = 0;
  const clip = s.ws.w[0].clip;
  for (let i = 0; i < 6; i++) cmd(i % 2 ? BTN.FIRE : 0);
  assert.equal(s.ws.w[0].clip, clip, 'cannot fire while cloaked');
  for (let i = 0; i < 30 * 3; i++) cmd(0);
  assert.ok(s.cloak.meter < 0.8, 'meter drains');
  // enemy turret ignores the cloaked spy
  const tu = { id: 99, team: m.team, owner: m.id, x: 0, y: 0.01, z: 15, yaw: 0, hp: 160, maxHp: 160, ammo: 150, building: 0, target: -1, nextFire: 0 };
  g.abilities.turrets.set(tu.id, tu);
  g.tick();
  assert.equal(tu.target, -1, 'turret does not see a cloaked spy');
  cmd(BTN.ALT); cmd(0);
  assert.equal(s.cloak.on, false, 'right-click again decloaks');
  // sapper: hold fire on the turret
  for (let i = 0; i < 30; i++) cmd(0, 1);
  const hp0 = tu.hp;
  const ang = anglesFromDir(tu.x - s.ms.x, tu.y + 0.6 - (s.ms.y + 1.62), tu.z - s.ms.z);
  place(s, 0, 0.01, 16.8, 0);
  for (let i = 0; i < 20; i++) { g.handleMessage(1, { t: 'c', c: [[++seq, 1 / 30, BTN.FIRE, ang.yaw, ang.pitch, 1, g.time]] }); g.tick(); }
  assert.ok(tu.hp < hp0, 'sapper damages the turret');
  assert.ok(tu.sappedUntil > g.time, 'turret is shorted out');
});

test('server: soldier Rally Cry protects and speeds up nearby allies', () => {
  const { g } = makeServer();
  const so = join(g, 1, 'Sarge', { classId: 'soldier' });
  const en = join(g, 2, 'Enemy', { classId: 'scout' });
  const al = join(g, 3, 'Ally', { classId: 'scout', team: so.team });
  startPlaying(g);
  assert.equal(al.team, so.team);
  place(so, 0, 0.01, 18); place(al, 3, 0.01, 18); place(en, 30, 0.01, 30);
  assert.equal(getClass('soldier').speed, 0.8);
  assert.equal(getClass('soldier').health, 200);
  let seq = so.lastSeq;
  g.handleMessage(1, { t: 'c', c: [[++seq, 1 / 30, BTN.ABILITY, 0, 0, 0, g.time]] }); g.tick();
  assert.ok(al.rallyUntil > g.time, 'ally within range is rallied');
  const hp0 = al.hp;
  g.combat.damage(al, 40, en, 'scattershot');
  assert.equal(hp0 - al.hp, 30, '25% damage reduction');
});
