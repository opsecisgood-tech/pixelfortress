// Server-simulated projectiles: rivets, syringes, flares, blast shells, bouncing charges, detonation charges.
import { getClass } from '../shared/config/classes.js';
import { shotDirections } from '../shared/weaponLogic.js';
import { rayAabb, round2 } from '../shared/math.js';

export const PROJECTILE_KINDS = ['rivet', 'syringe', 'flare', 'shell', 'charge', 'detcharge', 'arrow', 'bolt', 'sticky', 'hopshell'];
export const MAX_STICKIES = 8;

// Shared muzzle offset so client-predicted projectiles line up with server ones.
export function projectileOrigin(eye, yaw, pitch) {
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  return [eye[0] + right[0] * 0.18, eye[1] - 0.12, eye[2] + right[2] * 0.18];
}

export class Projectiles {
  constructor(game) {
    this.g = game;
    this.list = new Map();
    this.nextId = 1;
  }

  clear() { this.list.clear(); }

  spawnFromWeapon(p, def, ev, eye) {
    const pr = def.projectile;
    const dirs = shotDirections(ev.y, ev.p, ev.spread, def.pellets, ev.seed);
    const origin = projectileOrigin(eye, ev.y, ev.p);
    // don't spawn inside walls: if a wall is between eye and muzzle, start at eye
    const o = this.g.world.los(eye, origin) ? origin : eye;
    for (const d of dirs) {
      this.spawn({
        kind: pr.kind, owner: p.id, team: p.team, weaponId: def.id, pos: o,
        vel: [d[0] * pr.speed, d[1] * pr.speed + (pr.gravity > 8 ? 2.2 : 0), d[2] * pr.speed],
        gravity: pr.gravity, radius: pr.radius, life: pr.lifetime, bounce: pr.bounce || 0,
        explode: pr.explode || null, damage: def.damage, ignite: !!pr.ignite, fuseExplode: !!pr.fuseExplode,
        crit: def.crit, critMult: def.critMult, key: ev.shot,
        stick: !!pr.stick, noAutoExplode: !!pr.noAutoExplode, armTime: pr.armTime || 0, passPlayers: !!pr.passPlayers,
      });
    }
    if (pr.kind === 'sticky') this.capStickies(p.id);
  }

  // Keep at most MAX_STICKIES per owner: the oldest ones fizzle out.
  capStickies(ownerId) {
    const mine = [...this.list.values()].filter((q) => q.kind === 'sticky' && q.owner === ownerId).sort((a, b) => a.born - b.born);
    while (mine.length > MAX_STICKIES) this.fizzle(mine.shift());
  }

  // Owner pressed alt-fire: detonate every armed sticky bomb. Returns how many went off.
  detonateStickies(ownerId) {
    let n = 0;
    for (const pr of this.list.values()) {
      if (pr.kind !== 'sticky' || pr.owner !== ownerId || this.g.time - pr.born < pr.armTime) continue;
      pr.detonate = true; n++;
    }
    return n;
  }

  countStickies(ownerId) {
    let n = 0;
    for (const pr of this.list.values()) if (pr.kind === 'sticky' && pr.owner === ownerId) n++;
    return n;
  }

  fizzle(pr) {
    this.g.event(['i', pr.kind, round2(pr.x), round2(pr.y), round2(pr.z), 0, 1, 0, `${pr.owner}:${pr.key}`, 1], [pr.x, pr.y, pr.z]);
    this.remove(pr);
  }

  spawn(o) {
    const id = this.nextId++;
    const pr = {
      id, kind: o.kind, owner: o.owner, team: o.team, weaponId: o.weaponId,
      x: o.pos[0], y: o.pos[1], z: o.pos[2], vx: o.vel[0], vy: o.vel[1], vz: o.vel[2],
      gravity: o.gravity || 0, radius: o.radius || 0.1, born: this.g.time, die: this.g.time + (o.life || 3),
      bounce: o.bounce || 0, explode: o.explode, damage: o.damage, ignite: o.ignite, fuseExplode: o.fuseExplode,
      stick: !!o.stick, stuck: false, crit: o.crit || {}, critMult: o.critMult || 1, key: o.key || 0, detonate: false,
      noAutoExplode: !!o.noAutoExplode, armTime: o.armTime || 0, passPlayers: !!o.passPlayers,
    };
    this.list.set(id, pr);
    return pr;
  }

  remove(pr) { this.list.delete(pr.id); }

  // Destroy enemy projectiles in a radius (Thermal Burst). Returns count.
  destroyNear(pos, radius, team) {
    let n = 0;
    for (const pr of [...this.list.values()]) {
      if (pr.team === team) continue;
      if (Math.hypot(pr.x - pos[0], pr.y - pos[1], pr.z - pos[2]) <= radius) {
        this.g.event(['i', pr.kind, round2(pr.x), round2(pr.y), round2(pr.z), 0, 1, 0, `${pr.owner}:${pr.key}`, 1], [pr.x, pr.y, pr.z]);
        this.remove(pr); n++;
      }
    }
    return n;
  }

  detonate(pr) {
    const owner = this.g.players.get(pr.owner) || null;
    const ex = pr.explode;
    this.g.combat.explode([pr.x, pr.y, pr.z], {
      owner, team: pr.team, weaponId: pr.weaponId, damage: pr.damage, radius: ex.radius, minMult: ex.minMult,
      knockback: ex.knockback, selfKnockback: ex.selfKnockback, selfMult: ex.selfMult, noEnemy: !!ex.noEnemy, hopper: !!ex.hopper,
      directTarget: pr.directTarget || null, critMult: pr.crit.directHit ? pr.critMult : 0, key: `${pr.owner}:${pr.key}`,
    });
    this.remove(pr);
  }

  update(dt) {
    const g = this.g;
    for (const pr of [...this.list.values()]) {
      if (pr.detonate) { this.detonate(pr); continue; }
      if (g.time >= pr.die) {
        if (pr.explode && !pr.noAutoExplode && (pr.fuseExplode || pr.kind === 'shell' || pr.kind === 'hopshell' || pr.kind === 'detcharge')) this.detonate(pr);
        else if (pr.kind === 'sticky') this.fizzle(pr);
        else this.remove(pr);
        continue;
      }
      if (pr.stuck) {
        if (pr.kind === 'charge') {
          for (const q of g.players.values()) {
            if (q.alive && q.team !== pr.team && Math.hypot(q.ms.x - pr.x, q.ms.y + 0.8 - pr.y, q.ms.z - pr.z) < 1.1) { pr.directTarget = q; this.detonate(pr); break; }
          }
        }
        continue;
      }
      pr.vy -= pr.gravity * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(pr.vx, pr.vy, pr.vz) * dt / 0.6));
      const sdt = dt / steps;
      for (let s = 0; s < steps && this.list.has(pr.id); s++) {
        const dx = pr.vx * sdt, dy = pr.vy * sdt, dz = pr.vz * sdt;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-6) break;
        const nx = dx / len, ny = dy / len, nz = dz / len;
        let bestT = len, hitPlayer = null, hitTurret = null;
        const wh = g.world.raycast(pr.x, pr.y, pr.z, nx, ny, nz, len + pr.radius);
        let worldT = wh ? Math.max(0, wh.t - pr.radius) : Infinity;
        if (worldT < bestT) bestT = worldT; else worldT = Infinity;
        if (pr.kind !== 'detcharge' && !pr.passPlayers) {
          for (const q of g.players.values()) {
            if (!q.alive || q.team === pr.team) continue;
            if (g.time - pr.born < 0.03 && q.id === pr.owner) continue;
            if (q.id === pr.ignore) continue;
            const hb = getClass(q.classId).hitbox;
            const r = pr.radius + 0.05;
            const hh = q.ms.crouch ? hb.height * 0.68 : hb.height;
            const t = rayAabb(pr.x, pr.y, pr.z, nx, ny, nz, q.ms.x - hb.width / 2 - r, q.ms.y - r, q.ms.z - hb.width / 2 - r, q.ms.x + hb.width / 2 + r, q.ms.y + hh + r, q.ms.z + hb.width / 2 + r, bestT);
            if (t >= 0 && t < bestT) { bestT = t; hitPlayer = q; hitTurret = null; }
          }
          for (const tu of g.abilities.turrets.values()) {
            if (tu.team === pr.team || tu.id === pr.ignoreTurret) continue;
            const t = rayAabb(pr.x, pr.y, pr.z, nx, ny, nz, tu.x - 0.55, tu.y, tu.z - 0.55, tu.x + 0.55, tu.y + 1.25, tu.z + 0.55, bestT);
            if (t >= 0 && t < bestT) { bestT = t; hitTurret = tu; hitPlayer = null; }
          }
        }
        pr.x += nx * bestT; pr.y += ny * bestT; pr.z += nz * bestT;
        if (hitPlayer) { this.onHitPlayer(pr, hitPlayer); break; }
        if (hitTurret) { this.onHitTurret(pr, hitTurret); break; }
        if (worldT !== Infinity && wh) { this.onHitWorld(pr, wh.normal); break; }
      }
    }
  }

  onHitPlayer(pr, q) {
    const owner = this.g.players.get(pr.owner) || null;
    if (pr.kind === 'sticky') { pr.vx *= -0.15; pr.vz *= -0.15; pr.vy = Math.min(pr.vy, 0); pr.ignore = q.id; return; } // bombs bounce off players
    if (pr.explode) { pr.directTarget = q; this.detonate(pr); return; }
    let dmg = pr.damage, crit = false;
    if (pr.crit.vsBurning && q.burn) { dmg *= pr.critMult; crit = true; }
    this.g.combat.damage(q, dmg, owner, pr.weaponId, { crit, point: [pr.x, pr.y, pr.z], isFire: pr.ignite });
    if (pr.ignite && q.alive) this.g.combat.ignite(q, owner, 6, 5);
    this.g.event(['i', pr.kind, round2(pr.x), round2(pr.y), round2(pr.z), 0, 0, 0, `${pr.owner}:${pr.key}`, 2], [pr.x, pr.y, pr.z]);
    this.remove(pr);
  }

  onHitTurret(pr, tu) {
    const owner = this.g.players.get(pr.owner) || null;
    if (pr.kind === 'sticky') { pr.vx *= -0.15; pr.vz *= -0.15; pr.vy = Math.min(pr.vy, 0); pr.ignoreTurret = tu.id; return; }
    if (pr.explode) { this.detonate(pr); return; }
    this.g.abilities.damageTurret(tu, pr.damage, owner);
    this.g.event(['i', pr.kind, round2(pr.x), round2(pr.y), round2(pr.z), 0, 0, 0, `${pr.owner}:${pr.key}`, 0], [pr.x, pr.y, pr.z]);
    this.remove(pr);
  }

  onHitWorld(pr, n) {
    if (pr.stick) {
      pr.stuck = true; pr.vx = pr.vy = pr.vz = 0;
      pr.x += n[0] * 0.08; pr.y += n[1] * 0.08; pr.z += n[2] * 0.08;
      this.g.event(['i', pr.kind, round2(pr.x), round2(pr.y), round2(pr.z), n[0], n[1], n[2], `${pr.owner}:${pr.key}`, 3], [pr.x, pr.y, pr.z]);
      return;
    }
    if (pr.bounce > 0) {
      const d = pr.vx * n[0] + pr.vy * n[1] + pr.vz * n[2];
      pr.vx = (pr.vx - (1 + pr.bounce) * d * n[0]) * 0.8;
      pr.vy = (pr.vy - (1 + pr.bounce) * d * n[1]);
      pr.vz = (pr.vz - (1 + pr.bounce) * d * n[2]) * 0.8;
      pr.x += n[0] * 0.02; pr.y += n[1] * 0.02; pr.z += n[2] * 0.02;
      if (Math.hypot(pr.vx, pr.vy, pr.vz) < 1.2 && n[1] > 0.5) { pr.vx = pr.vy = pr.vz = 0; pr.stuck = true; }
      return;
    }
    if (pr.explode) { this.detonate(pr); return; }
    this.g.event(['i', pr.kind, round2(pr.x), round2(pr.y), round2(pr.z), n[0], n[1], n[2], `${pr.owner}:${pr.key}`, 0], [pr.x, pr.y, pr.z]);
    this.remove(pr);
  }

  snapshot() {
    const out = [];
    for (const pr of this.list.values()) {
      out.push([pr.id, PROJECTILE_KINDS.indexOf(pr.kind), round2(pr.x), round2(pr.y), round2(pr.z), round2(pr.vx), round2(pr.vy), round2(pr.vz), pr.owner, pr.key, pr.team, round2(pr.gravity)]);
    }
    return out;
  }
}
