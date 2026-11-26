// Class abilities (server-authoritative): Adrenaline Rush, Disguise, Recon Sweep, Turret, Overcharge,
// Suppression, Thermal Burst, Detonation Charge. Scout's innate double jump lives in shared movement.
import { getClass, CLASSES, CLASS_IDS } from '../shared/config/classes.js';
import { ABILITY_SOURCES } from '../shared/config/weapons.js';
import { dirFromAngles, round2, wrapAngle } from '../shared/math.js';
import { applyImpulse } from '../shared/movement.js';
import { otherTeam } from '../shared/constants.js';

const TURRET = ABILITY_SOURCES.turret;

export class Abilities {
  constructor(game) {
    this.g = game;
    this.turrets = new Map();
    this.charges = new Map();   // ownerId -> projectile id
    this.nextTurretId = 1;
  }

  clear() {
    this.turrets.clear();
    this.charges.clear();
  }

  isActive(p, id) {
    return p.ability.active && getClass(p.classId).ability.id === id && p.ability.activeUntil > this.g.time;
  }

  isOvercharged(p) {
    if (this.isActive(p, 'overcharge')) return true;
    if (p.overchargedBy) {
      const doc = this.g.players.get(p.overchargedBy);
      if (doc && doc.alive && doc.healTarget === p.id && this.isActive(doc, 'overcharge')) return true;
    }
    return false;
  }

  use(p) {
    const cls = getClass(p.classId);
    const ab = cls.ability;
    const t = this.g.time;
    switch (ab.id) {
      case 'disguise':
        if (p.disguise) { this.reveal(p); return; }
        if (t < p.ability.cdUntil) return;
        this.disguise(p);
        return;
      case 'adrenaline':
      case 'esp':
      case 'suppression':
        if (t < p.ability.cdUntil || p.ability.active) return;
        p.ability.active = true;
        p.ability.activeUntil = t + ab.duration;
        p.ability.cdUntil = t + ab.duration + ab.cooldown;
        this.g.event(['ab', p.id, ab.id, 1], p.ms);
        return;
      case 'turret':
        if (t < p.ability.cdUntil) { this.notice(p, 'Turret on cooldown'); return; }
        this.placeTurret(p);
        return;
      case 'overcharge':
        if (p.ability.active || p.ability.charge < 1) { if (p.ability.charge < 1) this.notice(p, `Overcharge ${Math.floor(p.ability.charge * 100)}%`); return; }
        p.ability.active = true;
        p.ability.activeUntil = t + ab.duration;
        this.g.event(['ab', p.id, ab.id, 1], p.ms);
        return;
      case 'thermalburst':
        if (t < p.ability.cdUntil) return;
        p.ability.cdUntil = t + ab.cooldown;
        this.thermalBurst(p, ab);
        return;
      case 'detcharge': {
        const existing = this.charges.get(p.id);
        if (existing !== undefined) {
          const pr = this.g.projectiles.list.get(existing);
          if (pr) { pr.detonate = true; p.ability.cdUntil = t + ab.cooldown; this.charges.delete(p.id); return; }
          this.charges.delete(p.id);
        }
        if (t < p.ability.cdUntil) return;
        this.throwCharge(p, ab);
        return;
      }
      default:
    }
  }

  notice(p, text) {
    if (p.connId !== null) this.g.send(p.connId, { t: 'notice', text, short: true });
  }

  // ---------------- Spy
  disguise(p) {
    const enemyTeam = otherTeam(p.team);
    const enemies = [...this.g.players.values()].filter((q) => q.team === enemyTeam);
    const pick = enemies.length ? enemies[Math.floor(Math.random() * enemies.length)] : null;
    const classId = pick ? pick.classId : CLASS_IDS[Math.floor(Math.random() * 8)];
    p.disguise = { team: enemyTeam, classId: classId === 'spy' ? 'scout' : classId, fakeId: pick ? pick.id : 0, until: this.g.time + getClass('spy').ability.duration };
    p.ability.active = true;
    p.ability.activeUntil = p.disguise.until;
    this.g.event(['ab', p.id, 'disguise', 1], p.ms);
  }

  reveal(p) {
    if (!p.disguise) return;
    p.disguise = null;
    p.ability.active = false;
    p.ability.activeUntil = 0;
    p.ability.cdUntil = this.g.time + getClass('spy').ability.cooldown;
    this.g.event(['ab', p.id, 'disguise', 0], p.ms);
  }

  // ---------------- Mechanic turret
  placeTurret(p) {
    const g = this.g;
    const eye = g.eyePos(p);
    const dir = dirFromAngles(p.ms.yaw, Math.min(p.ms.pitch, -0.15));
    const hit = g.world.raycast(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], 4.5);
    let px, pz;
    if (hit) { px = eye[0] + dir[0] * (hit.t - 0.6); pz = eye[2] + dir[2] * (hit.t - 0.6); }
    else { px = eye[0] + dir[0] * 3; pz = eye[2] + dir[2] * 3; }
    const floor = g.world.floorBelow(px, pz, Math.max(p.ms.y + 1.2, eye[1] - 0.2), 0.3);
    if (!Number.isFinite(floor) || p.ms.y - floor > 2.5 || floor - p.ms.y > 1.3) { this.notice(p, 'Cannot build here'); return; }
    if (g.world.overlapsSolid(px - 0.45, floor + 0.02, pz - 0.45, px + 0.45, floor + 1.2, pz + 0.45)) { this.notice(p, 'Not enough room'); return; }
    for (const r of g.map.spawnRooms) {
      if (r.team !== p.team && px > r.min[0] && px < r.max[0] && pz > r.min[2] && pz < r.max[2]) { this.notice(p, 'Cannot build in enemy spawn'); return; }
    }
    // replace existing (max active per player)
    const max = getClass(p.classId).ability.maxActive || 1;
    const mine = [...this.turrets.values()].filter((t) => t.owner === p.id);
    while (mine.length >= max) this.destroyTurret(mine.shift(), null, true);
    const tu = {
      id: this.nextTurretId++, owner: p.id, team: p.team, x: px, y: floor, z: pz, yaw: p.ms.yaw,
      hp: TURRET.maxHp * 0.5, maxHp: TURRET.maxHp, ammo: TURRET.maxAmmo, building: TURRET.buildTime, target: -1, nextFire: 0,
    };
    this.turrets.set(tu.id, tu);
    p.ability.cdUntil = g.time + getClass(p.classId).ability.cooldown;
    p.stats.turretsBuilt++;
    g.event(['tb', tu.id, p.id, round2(px), round2(floor), round2(pz)], [px, floor, pz]);
  }

  repairTurret(tu, hp, ammo) {
    tu.hp = Math.min(tu.maxHp, tu.hp + hp);
    tu.ammo = Math.min(TURRET.maxAmmo, tu.ammo + ammo);
  }

  damageTurret(tu, dmg, attacker) {
    if (!this.turrets.has(tu.id)) return;
    tu.hp -= dmg;
    if (attacker && attacker.connId !== null) this.g.event(['d', attacker.id, -100 - tu.id, Math.round(dmg), round2(tu.x), round2(tu.y + 0.8), round2(tu.z), 0, 'turret'], null, null, [attacker.id]);
    if (tu.hp <= 0) this.destroyTurret(tu, attacker);
  }

  destroyTurret(tu, attacker, silent = false) {
    this.turrets.delete(tu.id);
    if (attacker && !silent) { attacker.stats.score += 1; attacker.stats.defenses += 0; }
    this.g.event(['td', tu.id, round2(tu.x), round2(tu.y), round2(tu.z), attacker ? attacker.id : -1], [tu.x, tu.y, tu.z]);
  }

  updateTurrets(dt) {
    const g = this.g;
    for (const tu of [...this.turrets.values()]) {
      if (tu.building > 0) {
        tu.building -= dt;
        tu.hp = Math.min(tu.maxHp, tu.hp + (TURRET.maxHp * 0.5 / TURRET.buildTime) * dt);
        continue;
      }
      const head = [tu.x, tu.y + 0.95, tu.z];
      let target = tu.target >= 0 ? g.players.get(tu.target) : null;
      const validT = (q) => q && q.alive && q.team !== tu.team && !q.disguise &&
        Math.hypot(q.ms.x - tu.x, q.ms.y - tu.y, q.ms.z - tu.z) <= TURRET.range && g.world.los(head, [q.ms.x, q.ms.y + 1.1, q.ms.z]);
      if (!validT(target)) {
        target = null;
        let bd = Infinity;
        for (const q of g.players.values()) {
          if (!validT(q)) continue;
          const d = Math.hypot(q.ms.x - tu.x, q.ms.y - tu.y, q.ms.z - tu.z);
          if (d < bd) { bd = d; target = q; }
        }
      }
      tu.target = target ? target.id : -1;
      if (!target) continue;
      const tx = target.ms.x - tu.x, tz = target.ms.z - tu.z;
      const want = Math.atan2(-tx, -tz);
      const diff = wrapAngle(want - tu.yaw);
      const step = TURRET.turnRate * dt;
      tu.yaw = wrapAngle(tu.yaw + Math.max(-step, Math.min(step, diff)));
      if (Math.abs(diff) < 0.2 && g.time >= tu.nextFire && tu.ammo > 0) {
        tu.nextFire = g.time + TURRET.fireInterval;
        tu.ammo--;
        const aim = [target.ms.x - head[0], target.ms.y + 1.0 - head[1], target.ms.z - head[2]];
        const al = Math.hypot(...aim);
        const s = TURRET.spread;
        const d = [aim[0] / al + (Math.random() - 0.5) * s * 2, aim[1] / al + (Math.random() - 0.5) * s * 2, aim[2] / al + (Math.random() - 0.5) * s * 2];
        const dl = Math.hypot(...d);
        const dir = [d[0] / dl, d[1] / dl, d[2] / dl];
        const owner = g.players.get(tu.owner);
        const fake = owner || { id: -1, team: tu.team };
        const hit = g.combat.trace(fake, head, dir, TURRET.range + 2, g.time);
        if (hit.kind === 'player') g.combat.damage(hit.target, TURRET.damage, owner || null, 'turret', { point: hit.point });
        g.event(['tf', tu.id, round2(hit.point[0]), round2(hit.point[1]), round2(hit.point[2]), hit.kind === 'player' ? 1 : 0], head);
      }
    }
  }

  // ---------------- Incinerator
  thermalBurst(p, ab) {
    const g = this.g;
    const c = [p.ms.x, p.ms.y + 1, p.ms.z];
    for (const q of g.players.values()) {
      if (!q.alive || q === p) continue;
      const d = Math.hypot(q.ms.x - c[0], q.ms.y + 1 - c[1], q.ms.z - c[2]);
      if (d > ab.radius) continue;
      if (!g.world.los(c, [q.ms.x, q.ms.y + 1, q.ms.z])) continue;
      if (q.team === p.team) { q.burn = null; continue; }
      const dx = q.ms.x - c[0], dz = q.ms.z - c[2];
      const l = Math.hypot(dx, dz) || 1;
      const k = ab.knockback * (getClass(q.classId).id === 'juggernaut' ? 0.5 : 1);
      applyImpulse(q.ms, (dx / l) * k, 5, (dz / l) * k);
      g.combat.damage(q, ab.damage, p, 'thermalburst', { isFire: true });
      if (q.alive) g.combat.ignite(q, p, 6, 4);
    }
    for (const tu of [...this.turrets.values()]) {
      if (tu.team !== p.team && Math.hypot(tu.x - c[0], tu.z - c[2]) < ab.radius) this.damageTurret(tu, ab.damage * 2, p);
    }
    const n = g.projectiles.destroyNear(c, ab.radius, p.team);
    g.event(['ab', p.id, 'thermalburst', 1, n], p.ms);
  }

  // ---------------- Demolitionist
  throwCharge(p, ab) {
    const g = this.g;
    const eye = g.eyePos(p);
    const d = dirFromAngles(p.ms.yaw, p.ms.pitch);
    const pr = g.projectiles.spawn({
      kind: 'detcharge', owner: p.id, team: p.team, weaponId: 'detcharge', pos: eye,
      vel: [d[0] * 15 + p.ms.vx * 0.3, d[1] * 15 + 3, d[2] * 15 + p.ms.vz * 0.3], gravity: 14, radius: 0.15,
      life: ab.duration, stick: true, damage: ab.damage,
      explode: { radius: ab.radius, minMult: 0.3, knockback: 10, selfKnockback: 12, selfMult: 0.5 }, key: -(g.time * 100 | 0),
    });
    this.charges.set(p.id, pr.id);
    p.ability.cdUntil = g.time + 1;
    g.event(['ab', p.id, 'detcharge', 1], p.ms);
  }

  removeOwned(pid) {
    for (const tu of [...this.turrets.values()]) if (tu.owner === pid) this.destroyTurret(tu, null, true);
    const ch = this.charges.get(pid);
    if (ch !== undefined) { this.g.projectiles.list.delete(ch); this.charges.delete(pid); }
  }

  onOwnerDeath(p) {
    if (p.classId === 'doctor') p.ability.charge *= 0.0; // overcharge lost on death
  }

  update(dt) {
    const g = this.g;
    for (const p of g.players.values()) {
      const ab = getClass(p.classId).ability;
      if (p.ability.active && g.time >= p.ability.activeUntil) {
        p.ability.active = false;
        if (ab.id === 'disguise' && p.disguise) this.reveal(p);
        else if (ab.id === 'overcharge') { p.ability.charge = 0; }
        g.event(['ab', p.id, ab.id, 0], p.ms);
      }
      if (ab.id === 'overcharge' && p.ability.active) {
        p.ability.charge = Math.max(0, (p.ability.activeUntil - g.time) / ab.duration);
        if (p.healTarget >= 0) { const q = g.players.get(p.healTarget); if (q) q.overchargedBy = p.id; }
      }
      // charge auto-cleanup
      const ch = this.charges.get(p.id);
      if (ch !== undefined && !g.projectiles.list.has(ch)) { this.charges.delete(p.id); p.ability.cdUntil = g.time + ab.cooldown; }
    }
    this.updateTurrets(dt);
  }

  snapshotTurrets() {
    const out = [];
    for (const tu of this.turrets.values()) {
      out.push([tu.id, tu.team, round2(tu.x), round2(tu.y), round2(tu.z), round2(tu.yaw), Math.ceil(tu.hp), tu.maxHp, tu.owner, tu.ammo, tu.building > 0 ? 1 : 0, tu.target]);
    }
    return out;
  }

  snapshotCharges() {
    const out = [];
    for (const [owner, id] of this.charges) out.push([owner, id]);
    return out;
  }
}

export { CLASSES };
