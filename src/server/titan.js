// The Titan (admin command /titan <player>): server-authoritative transformation, gem progression and
// gem powers. Everything here is decided by the server; clients only send action requests
// ({ t: 'titan', a: 'punch' | 'grab' | 'time' | 'timeval' | 'mind' | 'reality' | 'space' | 'soul' | 'snap' })
// and the server validates gems, cooldowns, range and line of sight before anything happens.
import { MATCH_STATE } from '../shared/constants.js';
import { getClass, resolveWeapons } from '../shared/config/classes.js';
import { STONES, STONE_INFO, TITAN, TFX, stoneMask, ALL_STONES } from '../shared/config/titan.js';
import { createWeaponState } from '../shared/weaponLogic.js';
import { dirFromAngles, round2 } from '../shared/math.js';

const T = TITAN;
const r2 = round2;

export class TitanSystem {
  constructor(game) {
    this.g = game;
    this.illusions = new Map();  // id -> { id, owner, mat, min, max, until }
    this.portals = new Map();    // id -> { id, owner, kind (0 entrance, 1 exit), x, y, z, floor, yaw, at }
    this.nextId = 1;
  }

  clear() {
    this.illusions.clear();
    this.portals.clear();
    for (const p of this.g.players.values()) {
      this.releaseControl(p); this.releaseGrab(p, false);
      if (p.titan) { p.titan.snapUsed = false; p.titan.snapAt = 0; p.titan.cd = {}; }
    }
  }

  // ---------------------------------------------------------------- transform / revert
  transform(p) {
    if (p.titan) return false;
    p.titan = { stones: [], cd: {}, timeStep: T.time.defaultStep, sample: null, control: null, grab: null, soulUntil: 0, snapUsed: false, snapAt: 0, prevClass: p.classId, prevNext: p.nextClassId };
    p.disguise = null;
    if (p.cloak) p.cloak.on = false;
    this.g.abilities.removeOwned(p.id);
    p.classId = 'titan'; p.nextClassId = 'titan';
    this.applyLoadout(p, true);
    this.resync(p);
    this.g.rosterDirty = true;
    this.g.event(['ti', 'on', p.id, r2(p.ms.x), r2(p.ms.y), r2(p.ms.z)]);
    return true;
  }

  revert(p) {
    if (!p.titan) return false;
    this.releaseControl(p); this.releaseGrab(p, false);
    for (const [id, il] of this.illusions) if (il.owner === p.id) this.illusions.delete(id);
    for (const [id, po] of this.portals) if (po.owner === p.id) this.portals.delete(id);
    for (const q of this.g.players.values()) if (q.timeBy === p.id) { q.timeTarget = 1; q.timeUntil = 0; }
    p.classId = p.titan.prevClass || 'scout';
    p.nextClassId = p.classId;
    p.titan = null;
    const cls = getClass(p.classId);
    p.weapons = resolveWeapons(p.classId, p.weaponPicks?.[p.classId]);
    p.ws = createWeaponState(cls, 0, p.weapons);
    p.maxHp = cls.health;
    p.hp = Math.min(p.hp, p.maxHp);
    this.resync(p);
    this.g.rosterDirty = true;
    this.g.event(['ti', 'off', p.id, r2(p.ms.x), r2(p.ms.y), r2(p.ms.z)]);
    return true;
  }

  // Make the player's game rebuild its weapons and body in place (same position and facing).
  resync(p) {
    if (!p.alive) return;
    p.spawnCount++;
    p.spawnYaw = p.ms.yaw;
    p.cmdQueue = [];
  }

  // Titan weapons and health (on transform and after every respawn).
  applyLoadout(p, heal) {
    p.weapons = [T.fist, T.fist, T.fist];
    p.ws = createWeaponState(getClass('titan'), 0, p.weapons);
    p.ws.time = 0;
    p.maxHp = T.health;
    if (heal && p.alive) p.hp = T.health;
  }

  onSpawn(p) {
    if (!p.titan) return;
    p.classId = 'titan'; p.nextClassId = 'titan';
    this.applyLoadout(p, true);
  }

  // ---------------------------------------------------------------- gems
  onKill(killer, victim) {
    if (!killer?.titan || killer === victim) return;
    this.award(killer);
  }

  award(p, which = null) {
    const own = p.titan.stones;
    const left = STONES.filter((s) => !own.includes(s));
    if (!left.length) return null;
    const s = which && left.includes(which) ? which : left[Math.floor(Math.random() * left.length)];
    own.push(s);
    this.g.event(['ti', 'stone', p.id, STONES.indexOf(s), own.length]);
    this.g.send(p.connId, { t: 'notice', text: `${STONE_INFO[s].name} gem claimed: ${STONE_INFO[s].power}.` });
    if (own.length === STONES.length) this.g.send(p.connId, { t: 'notice', text: 'All six gems claimed. Press E to Snap.' });
    this.g.rosterDirty = true;
    return s;
  }

  mask(p) { return p.titan ? stoneMask(p.titan.stones) : 0; }
  has(p, s) { return !!p.titan?.stones.includes(s); }

  // ---------------------------------------------------------------- death / leave cleanup
  onDeath(p) {
    this.releaseControl(p);
    this.releaseGrab(p, false);
    // anyone controlling or holding this player lets go
    for (const q of this.g.players.values()) {
      if (q.titan?.control?.target === p.id) this.releaseControl(q);
      if (q.titan?.grab?.target === p.id) this.releaseGrab(q, false);
    }
    p.stunUntil = 0; p.sapUntil = 0;
  }
  onLeave(p) {
    this.onDeath(p);
    if (p.titan) {
      for (const [id, il] of this.illusions) if (il.owner === p.id) this.illusions.delete(id);
      for (const [id, po] of this.portals) if (po.owner === p.id) this.portals.delete(id);
    }
    for (const q of this.g.players.values()) if (q.timeBy === p.id) { q.timeTarget = 1; q.timeUntil = 0; }
  }

  // ---------------------------------------------------------------- input hooks (ServerGame)
  // Who actually receives this player's commands this tick (the Mind gem redirects them).
  commandTarget(p) {
    const c = p.titan?.control;
    if (!c) return p;
    const q = this.g.players.get(c.target);
    return q && q.alive ? q : p;
  }
  // Commands from a mind-controlled player are ignored while the control lasts.
  ignoresInput(p) { return !!p.mindBy; }
  // Movement lock: held by a Grab (no movement at all) or stunned (no buttons, physics continue).
  filterCommand(p, cmd) {
    if (p.grabbedBy) return null;
    let c = cmd;
    if (p.stunUntil > this.g.time) c = { ...c, b: 0 };
    const ts = p.timeScale ?? 1;
    if (Math.abs(ts - 1) > 1e-3) c = { ...c, dt: c.dt * ts };
    return c;
  }
  moveMult(p) {
    let m = 1;
    if (p.sapUntil > this.g.time) m *= T.soul.sapMove;
    return m;
  }
  damageMult(attacker) { return attacker?.sapUntil > this.g.time ? T.soul.sapDamage : 1; }

  fxBits(p) {
    const t = this.g.time;
    let f = 0;
    if (p.stunUntil > t) f |= TFX.STUN;
    if (p.grabbedBy) f |= TFX.GRAB;
    if (p.mindBy) f |= TFX.MIND;
    if (p.sapUntil > t) f |= TFX.SAP;
    if (p.soulSeenUntil > t) f |= TFX.SOUL;
    if (Math.abs((p.timeScale ?? 1) - 1) > 0.02) f |= TFX.TIME;
    if (p.titan?.control) f |= TFX.CONTROL;
    return f;
  }

  // ---------------------------------------------------------------- aiming helpers
  eye(p) { return this.g.eyePos(p); }
  aimTarget(p, range, { enemiesOnly = true, cone = 0.14 } = {}) {
    const eye = this.eye(p);
    const fwd = dirFromAngles(p.ms.yaw, p.ms.pitch);
    let best = null, bestScore = -Infinity;
    for (const q of this.g.players.values()) {
      if (q === p || !q.alive) continue;
      if (enemiesOnly && q.team === p.team) continue;
      const c = [q.ms.x, q.ms.y + 1.1, q.ms.z];
      const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const d = Math.hypot(...v);
      if (d > range) continue;
      const cos = (v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]) / (d || 1);
      const ang = Math.acos(Math.min(1, cos));
      if (ang > cone + 0.55 / Math.max(1, d)) continue;
      if (!this.g.world.los(eye, c)) continue;
      const score = -ang * 4 - d * 0.02;
      if (score > bestScore) { bestScore = score; best = q; }
    }
    return best;
  }
  ray(p, range) {
    const eye = this.eye(p);
    const f = dirFromAngles(p.ms.yaw, p.ms.pitch);
    const hit = this.g.world.raycast(eye[0], eye[1], eye[2], f[0], f[1], f[2], range);
    return { eye, f, hit, point: hit ? [eye[0] + f[0] * hit.t, eye[1] + f[1] * hit.t, eye[2] + f[2] * hit.t] : [eye[0] + f[0] * range, eye[1] + f[1] * range, eye[2] + f[2] * range] };
  }

  ready(p, key) { return (p.titan.cd[key] || 0) <= this.g.time; }
  cool(p, key, sec) { p.titan.cd[key] = this.g.time + (p.admin?.nocd ? 0.15 : sec); }
  say(p, text) { this.g.send(p.connId, { t: 'notice', text }); }

  // ---------------------------------------------------------------- actions
  action(p, msg) {
    const g = this.g;
    if (!p.titan || !msg || typeof msg.a !== 'string') return;
    if (g.state === MATCH_STATE.ENDED) return;
    // time-strength changes are allowed even while dead
    if (msg.a === 'timeval') return this.setTimeStep(p, msg.v);
    if (!p.alive || p.grabbedBy || p.stunUntil > g.time) return;
    const need = { punch: 'power', grab: 'power', time: 'time', mind: 'mind', reality: 'reality', space: 'space', soul: 'soul' }[msg.a];
    if (need && !this.has(p, need)) { this.say(p, `You need the ${STONE_INFO[need].name} gem for that.`); return; }
    switch (msg.a) {
      case 'punch': return this.punch(p);
      case 'grab': return p.titan.grab ? this.releaseGrab(p, true) : this.grab(p);
      case 'time': return this.time(p);
      case 'mind': return p.titan.control ? this.releaseControl(p) : this.mind(p);
      case 'reality': return this.reality(p);
      case 'space': return this.space(p);
      case 'soul': return this.soul(p);
      case 'snap': return this.snap(p);
      default:
    }
  }

  // POWER: P - Power Punch
  punch(p) {
    if (!this.ready(p, 'punch')) return;
    this.cool(p, 'punch', T.punch.cooldown);
    const q = this.aimTarget(p, T.punch.range, { cone: 0.45 });
    const g = this.g;
    if (!q) { g.event(['ti', 'punch', p.id, -1, 0, 0, 0], p.ms); return; }
    const dx = q.ms.x - p.ms.x, dz = q.ms.z - p.ms.z, l = Math.hypot(dx, dz) || 1;
    q.ms.vx = (dx / l) * T.punch.knock; q.ms.vz = (dz / l) * T.punch.knock; q.ms.vy = T.punch.up; q.ms.grounded = false;
    q.stunUntil = g.time + T.punch.stun;
    g.event(['ti', 'punch', p.id, q.id, r2(q.ms.x), r2(q.ms.y + 1.1), r2(q.ms.z)], p.ms);
    g.combat.damage(q, T.punch.damage, p, 'powerpunch', { point: [q.ms.x, q.ms.y + 1.1, q.ms.z] });
  }

  // POWER: G - Grab (G again throws early)
  grab(p) {
    if (!this.ready(p, 'grab')) return;
    const q = this.aimTarget(p, T.grab.range, { cone: 0.45 });
    if (!q || q.grabbedBy) { this.say(p, 'Nobody in reach to grab.'); return; }
    this.cool(p, 'grab', T.grab.cooldown);
    this.releaseControl(q);
    p.titan.grab = { target: q.id, until: this.g.time + T.grab.hold };
    q.grabbedBy = p.id;
    this.g.event(['ti', 'grab', p.id, q.id, 1], p.ms);
  }
  releaseGrab(p, thrown) {
    const gr = p.titan?.grab;
    if (!gr) return;
    p.titan.grab = null;
    const q = this.g.players.get(gr.target);
    if (!q) return;
    q.grabbedBy = 0;
    if (!q.alive) return;
    if (thrown && p.alive) {
      const f = dirFromAngles(p.ms.yaw, 0);
      q.ms.vx = f[0] * T.grab.throwSpeed; q.ms.vz = f[2] * T.grab.throwSpeed; q.ms.vy = T.grab.throwUp; q.ms.grounded = false;
      q.stunUntil = this.g.time + T.grab.stun;
      this.g.event(['ti', 'grab', p.id, q.id, 0], p.ms);
      this.g.combat.damage(q, T.grab.damage, p, 'gemgrab', {});
    } else {
      this.g.event(['ti', 'grab', p.id, q.id, 2], p.ms);
    }
  }

  // TIME: 1 - apply the current strength to the aimed player (allies too: speed them up)
  setTimeStep(p, v) {
    const n = T.time.steps.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(+v || 0)));
    p.titan.timeStep = i;
    // a strength change also retunes everyone currently under this Titan's spell
    const val = T.time.steps[i];
    for (const q of this.g.players.values()) if (q.timeBy === p.id && q.timeUntil > this.g.time) q.timeTarget = val;
  }
  time(p) {
    if (!this.ready(p, 'time')) return;
    const q = this.aimTarget(p, T.time.range, { enemiesOnly: false, cone: 0.2 });
    if (!q) { this.say(p, 'Aim at a player to bend their time.'); return; }
    this.cool(p, 'time', T.time.cooldown);
    const val = T.time.steps[p.titan.timeStep] ?? 0.6;
    q.timeTarget = val; q.timeUntil = this.g.time + T.time.duration; q.timeBy = p.id;
    if (q.timeScale === undefined) q.timeScale = 1;
    this.g.event(['ti', 'time', p.id, q.id, val]);
  }

  // MIND: 2 - take control of an enemy (2 again releases)
  mind(p) {
    if (!this.ready(p, 'mind')) return;
    const q = this.aimTarget(p, T.mind.range, { cone: 0.2 });
    if (!q || q.mindBy || q.titan) { this.say(p, q?.titan ? 'Another Titan resists.' : 'Aim at an enemy to take their mind.'); return; }
    this.cool(p, 'mind', T.mind.cooldown);
    if (q.grabbedBy) { const h = this.g.players.get(q.grabbedBy); if (h) this.releaseGrab(h, false); }
    p.titan.control = { target: q.id, until: this.g.time + T.mind.duration };
    q.mindBy = p.id;
    q.cmdQueue = [];
    // the Titan's own body stands still while his mind is elsewhere
    p.ms.vx = 0; p.ms.vz = 0;
    this.g.event(['ti', 'mind', p.id, q.id, 1]);
  }
  releaseControl(p) {
    const c = p.titan?.control;
    if (!c) return;
    p.titan.control = null;
    const q = this.g.players.get(c.target);
    if (q) { q.mindBy = 0; q.cmdQueue = []; q.cmdBudget = 0; }
    this.g.event(['ti', 'mind', p.id, c.target, 0]);
  }

  // REALITY: R - aim at a prop to copy it, aim at a floor or wall to place an illusion of the copy
  reality(p) {
    if (!this.ready(p, 'reality')) return;
    const { eye, f, hit, point } = this.ray(p, Math.max(T.reality.sampleRange, T.reality.placeRange));
    if (!hit) { this.say(p, 'Aim at a prop to copy it, or at the ground to place an illusion.'); return; }
    const b = hit.box;
    const w = b.maxX - b.minX, h = b.maxY - b.minY, d = b.maxZ - b.minZ;
    const propSized = b.mat && w <= T.reality.maxDim && d <= T.reality.maxDim && h <= T.reality.maxDim && h >= 0.25 && hit.normal[1] < 0.5;
    if (propSized || (b.mat && !p.titan.sample && w <= T.reality.maxDim && d <= T.reality.maxDim && h <= T.reality.maxDim)) {
      p.titan.sample = { mat: b.mat, size: [r2(w), r2(h), r2(d)] };
      this.cool(p, 'reality', 0.4);
      this.g.send(p.connId, { t: 'notice', text: `Reality gem copied a ${b.mat.replace(/_/g, ' ')} (${w.toFixed(1)}×${h.toFixed(1)}×${d.toFixed(1)} m). Aim at the ground and press R to place illusions.` });
      this.g.event(['ti', 'sample', p.id, r2(point[0]), r2(point[1]), r2(point[2])], p.ms);
      return;
    }
    const sm = p.titan.sample;
    if (!sm) { this.say(p, 'Copy a prop first: aim at a crate, barrel or other object and press R.'); return; }
    if (hit.t > T.reality.placeRange) return;
    // stand the copy on the floor under the aimed point (pulled back from walls)
    const bx = point[0] - f[0] * (sm.size[0] / 2 + 0.1), bz = point[2] - f[2] * (sm.size[2] / 2 + 0.1);
    const floor = this.g.world.floorBelow(bx, bz, Math.max(point[1], eye[1] - 0.2) + 0.05, 0.2);
    if (!Number.isFinite(floor)) return;
    const min = [bx - sm.size[0] / 2, floor, bz - sm.size[2] / 2], max = [bx + sm.size[0] / 2, floor + sm.size[1], bz + sm.size[2] / 2];
    const mine = [...this.illusions.values()].filter((i) => i.owner === p.id).sort((a, b2) => a.id - b2.id);
    while (mine.length >= T.reality.max) this.illusions.delete(mine.shift().id);
    const id = this.nextId++;
    this.illusions.set(id, { id, owner: p.id, team: p.team, mat: sm.mat, min: min.map(r2), max: max.map(r2), until: this.g.time + T.reality.life, armAt: this.g.time + 0.6 });
    this.cool(p, 'reality', T.reality.cooldown);
    this.g.event(['ti', 'ill', p.id, r2(bx), r2(floor), r2(bz)]);
  }

  // SPACE: F - place portals (first an entrance, then an exit; new ones replace the oldest)
  space(p) {
    if (!this.ready(p, 'space')) return;
    const { f, point, hit } = this.ray(p, T.space.range);
    const back = hit ? 0.9 : 0;
    const x = point[0] - f[0] * back, z = point[2] - f[2] * back;
    const floor = this.g.world.floorBelow(x, z, point[1] + 0.3, 0.3);
    if (!Number.isFinite(floor) || point[1] - floor > 8) { this.say(p, 'Aim at the ground or a wall to open a portal.'); return; }
    if (this.g.world.overlapsSolid(x - 0.45, floor + 0.05, z - 0.45, x + 0.45, floor + 1.9, z + 0.45)) { this.say(p, 'No room for a portal there.'); return; }
    const mine = [...this.portals.values()].filter((q) => q.owner === p.id).sort((a, b) => a.at - b.at);
    let kind = 0;
    if (mine.length === 1) kind = 1 - mine[0].kind;
    else if (mine.length >= 2) { const old = mine[0]; kind = old.kind; this.portals.delete(old.id); }
    const id = this.nextId++;
    // face the Titan
    const yaw = Math.atan2(p.ms.x - x, p.ms.z - z);
    this.portals.set(id, { id, owner: p.id, kind, x: r2(x), y: r2(floor + 1.1), z: r2(z), floor, yaw: r2(yaw), at: this.g.time });
    this.cool(p, 'space', T.space.cooldown);
    this.g.event(['ti', 'portal', p.id, kind, r2(x), r2(floor + 1.1), r2(z)]);
  }

  // SOUL: 3 - pulse: every enemy revealed (orange) and nearby enemies sapped
  soul(p) {
    if (!this.ready(p, 'soul')) return;
    this.cool(p, 'soul', T.soul.cooldown);
    const g = this.g, t = g.time;
    p.titan.soulUntil = t + T.soul.duration;
    let sapped = 0;
    for (const q of g.players.values()) {
      if (q.team === p.team || q === p) continue;
      q.soulSeenUntil = t + T.soul.duration;
      q.soulSeenBy = p.team;
      if (q.alive && Math.hypot(q.ms.x - p.ms.x, q.ms.y - p.ms.y, q.ms.z - p.ms.z) <= T.soul.sapRadius) { q.sapUntil = t + T.soul.sapTime; sapped++; }
    }
    g.event(['ti', 'soul', p.id, r2(p.ms.x), r2(p.ms.y + 1.2), r2(p.ms.z), sapped]);
  }

  // SNAP: E with all six gems - once per match
  snap(p) {
    const g = this.g;
    if (this.mask(p) !== ALL_STONES) { this.say(p, `The Snap needs all six gems (${p.titan.stones.length}/6).`); return; }
    if (p.titan.snapUsed || p.titan.snapAt) { this.say(p, 'The Snap can only be used once per match.'); return; }
    p.titan.snapAt = g.time + T.snap.windup;
    g.event(['ti', 'snapwind', p.id, r2(p.ms.x), r2(p.ms.y), r2(p.ms.z)]);
  }
  resolveSnap(p) {
    const g = this.g;
    p.titan.snapAt = 0;
    p.titan.snapUsed = true;
    if (!p.alive) return;
    // everyone else who is alive is eligible (bots included); half of them, picked at random, turn to dust
    const pool = [...g.players.values()].filter((q) => q !== p && q.alive && !q.admin?.god);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const n = Math.round(pool.length / 2);
    const chosen = pool.slice(0, n);
    g.event(['ti', 'snap', p.id, pool.length, chosen.map((q) => q.id)]);
    for (const q of chosen) {
      if (!q.alive) continue;
      this.onDeath(q);
      q.hp = 0;
      if (q.team === p.team) q.damageLog = []; // nobody else gets credit for an ally the Snap removes
      // enemies count as the Titan's kills; allies are simply removed (no team kill)
      g.combat.kill(q, q.team !== p.team ? p : null, 'snap', 0);
    }
    this.say(p, `The Snap: ${chosen.length} of ${pool.length} turned to dust.`);
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    const g = this.g, t = g.time;
    for (const p of g.players.values()) {
      // time distortion: ramp smoothly toward the target, back to normal when it ends
      if (p.timeScale !== undefined) {
        if (p.timeUntil && p.timeUntil <= t) { p.timeTarget = 1; p.timeUntil = 0; }
        const target = p.alive ? (p.timeTarget ?? 1) : 1;
        const step = T.time.rampPerSec * dt;
        p.timeScale += Math.max(-step, Math.min(step, target - p.timeScale));
        if (Math.abs(p.timeScale - 1) < 1e-3 && target === 1) { p.timeScale = undefined; p.timeTarget = 1; p.timeBy = 0; }
        else {
          // cooldowns run at the same pace as the player's time
          const ts = p.timeScale;
          if (p.ability.cdUntil > t) p.ability.cdUntil += dt * (1 - ts);
          if (p.titan) for (const k of Object.keys(p.titan.cd)) if (p.titan.cd[k] > t) p.titan.cd[k] += dt * (1 - ts);
        }
      }
      if (!p.titan) continue;
      const ti = p.titan;
      // mind control expiry
      if (ti.control) {
        const q = g.players.get(ti.control.target);
        if (!p.alive || !q || !q.alive || ti.control.until <= t) this.releaseControl(p);
        else { p.ms.vx = 0; p.ms.vz = 0; }
      }
      // grab: hold the target in front of the gauntlet, throw when time runs out
      if (ti.grab) {
        const q = g.players.get(ti.grab.target);
        if (!p.alive || !q || !q.alive) this.releaseGrab(p, false);
        else if (ti.grab.until <= t) this.releaseGrab(p, true);
        else {
          const f = dirFromAngles(p.ms.yaw, 0);
          const x = p.ms.x + f[0] * 1.6, z = p.ms.z + f[2] * 1.6, y = p.ms.y + 0.9;
          if (!g.world.overlapsSolid(x - 0.35, y + 0.05, z - 0.35, x + 0.35, y + 1.7, z + 0.35)) { q.ms.x = x; q.ms.y = y; q.ms.z = z; }
          q.ms.vx = 0; q.ms.vy = 0; q.ms.vz = 0; q.ms.grounded = false;
        }
      }
      if (ti.snapAt && ti.snapAt <= t) this.resolveSnap(p);
      // a bot Titan snaps as soon as the gauntlet is complete
      if (p.isBot && p.alive && !ti.snapUsed && !ti.snapAt && this.mask(p) === ALL_STONES && g.state === MATCH_STATE.PLAYING) this.snap(p);
      // portals: walking into your entrance carries you out of your exit
      if (p.alive && (ti.portalReady ?? 0) <= t) {
        const mine = [...this.portals.values()].filter((q) => q.owner === p.id);
        const ent = mine.find((q) => q.kind === 0), ex = mine.find((q) => q.kind === 1);
        if (ent && ex && Math.hypot(p.ms.x - ent.x, p.ms.z - ent.z) < T.space.radius && p.ms.y > ent.floor - 0.6 && p.ms.y < ent.y + 0.4) {
          const fx = Math.sin(ex.yaw), fz = Math.cos(ex.yaw);
          let nx = ex.x + fx * 1.3, nz = ex.z + fz * 1.3, ny = ex.floor + 0.02;
          if (g.world.overlapsSolid(nx - 0.4, ny + 0.05, nz - 0.4, nx + 0.4, ny + 1.8, nz + 0.4)) { nx = ex.x; nz = ex.z; }
          const from = [r2(p.ms.x), r2(p.ms.y), r2(p.ms.z)];
          const sp = Math.min(8, Math.hypot(p.ms.vx, p.ms.vz));
          p.ms.x = nx; p.ms.y = ny; p.ms.z = nz; p.ms.vx = fx * sp; p.ms.vz = fz * sp; p.ms.vy = 0;
          p.history = [];
          ti.portalReady = t + T.space.travelCooldown;
          g.event(['ti', 'warp', p.id, ...from, r2(nx), r2(ny), r2(nz), r2(ex.yaw + Math.PI)]);
        }
      }
    }
    // illusions: an enemy who touches one is hurt once and the illusion shatters
    for (const [id, il] of this.illusions) {
      if (il.until <= t || !g.players.has(il.owner)) { this.illusions.delete(id); continue; }
      if (il.armAt > t || g.state === MATCH_STATE.PREROUND) continue;
      const owner = g.players.get(il.owner);
      for (const q of g.players.values()) {
        if (!q.alive || q.team === il.team) continue;
        const { x, y, z } = q.ms;
        if (x + 0.42 < il.min[0] || x - 0.42 > il.max[0] || z + 0.42 < il.min[2] || z - 0.42 > il.max[2] || y + 1.8 < il.min[1] || y > il.max[1] + 0.05) continue;
        this.illusions.delete(id);
        g.event(['ti', 'illhit', q.id, r2((il.min[0] + il.max[0]) / 2), r2((il.min[1] + il.max[1]) / 2), r2((il.min[2] + il.max[2]) / 2), il.owner]);
        g.combat.damage(q, T.reality.damage, owner, 'illusion', { raw: false });
        break;
      }
    }
  }

  // ---------------------------------------------------------------- replication
  snapshot() {
    if (!this.illusions.size && !this.portals.size) return null;
    return {
      il: [...this.illusions.values()].map((i) => [i.id, i.mat, ...i.min, ...i.max]),
      po: [...this.portals.values()].map((q) => [q.id, q.owner, q.kind, q.x, q.y, q.z, q.yaw]),
    };
  }
  me(p) {
    const t = this.g.time, ti = p.titan;
    if (!ti) return null;
    const cd = {};
    for (const k of ['punch', 'grab', 'time', 'mind', 'reality', 'space', 'soul']) cd[k] = Math.max(0, r2((ti.cd[k] || 0) - t));
    return {
      s: this.mask(p), cd, ts: ti.timeStep, sm: ti.sample?.mat || null,
      ctl: ti.control ? ti.control.target : -1, ctlT: ti.control ? r2(ti.control.until - t) : 0,
      gr: ti.grab ? ti.grab.target : -1, soul: ti.soulUntil > t ? r2(ti.soulUntil - t) : 0,
      snap: ti.snapUsed ? 2 : ti.snapAt ? 3 : this.mask(p) === ALL_STONES ? 1 : 0,
    };
  }
}
