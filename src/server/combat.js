// Server-side combat resolution: hitscan traces with lag compensation, melee, flame cones, healing
// beams, repair beams, explosions, damage modifiers, eliminations, assists and score attribution.
import { WEAPONS, ABILITY_SOURCES } from '../shared/config/weapons.js';
import { getClass, CLASSES } from '../shared/config/classes.js';
import { SCORE_VALUES, MATCH_DEFAULTS } from '../shared/config/modes.js';
import { PLAYER_HEIGHT, CROUCH_HEIGHT, MATCH_STATE } from '../shared/constants.js';
import { hitscanDamage, explosionDamage, isBehind, applyDefense } from '../shared/damage.js';
import { shotDirections } from '../shared/weaponLogic.js';
import { applyImpulse, eyeHeight } from '../shared/movement.js';
import { rayAabb, dirFromAngles, round2 } from '../shared/math.js';

export class Combat {
  constructor(game) {
    this.g = game;
  }

  // Player hitboxes at a (possibly rewound) position.
  hitboxes(q, pos) {
    const cls = getClass(q.classId);
    const hb = cls.hitbox;
    const scale = pos.c ? CROUCH_HEIGHT / PLAYER_HEIGHT : 1;
    const h = hb.height * scale;
    const hw = hb.width / 2;
    const hh = hb.head / 2;
    const headBottom = pos.y + h - hb.head;
    return {
      body: [pos.x - hw, pos.y, pos.z - hw, pos.x + hw, headBottom, pos.z + hw],
      head: [pos.x - hh, headBottom, pos.z - hh, pos.x + hh, pos.y + h + 0.02, pos.z + hh],
    };
  }

  /**
   * Trace a shot. Returns nearest hit: { kind: 'player'|'turret'|'world'|'none', t, point, target, headshot, normal }
   */
  trace(shooter, origin, dir, range, rewindTime) {
    const g = this.g;
    const [ox, oy, oz] = origin;
    const [dx, dy, dz] = dir;
    let best = { kind: 'none', t: range };
    const wh = g.world.raycast(ox, oy, oz, dx, dy, dz, range);
    if (wh) best = { kind: 'world', t: wh.t, normal: wh.normal };
    for (const q of g.players.values()) {
      if (q === shooter || !q.alive || q.team === shooter.team) continue;
      const pos = g.positionAt(q, rewindTime);
      const boxes = this.hitboxes(q, pos);
      const th = rayAabb(ox, oy, oz, dx, dy, dz, ...boxes.head, best.t);
      const tb = rayAabb(ox, oy, oz, dx, dy, dz, ...boxes.body, best.t);
      if (th >= 0 && (tb < 0 || th <= tb + 0.05) && th < best.t) best = { kind: 'player', t: th, target: q, headshot: true };
      else if (tb >= 0 && tb < best.t) best = { kind: 'player', t: tb, target: q, headshot: false };
    }
    for (const tu of g.abilities.turrets.values()) {
      if (tu.team === shooter.team) continue;
      const t = rayAabb(ox, oy, oz, dx, dy, dz, tu.x - 0.5, tu.y, tu.z - 0.5, tu.x + 0.5, tu.y + 1.2, tu.z + 0.5, best.t);
      if (t >= 0 && t < best.t) best = { kind: 'turret', t, target: tu };
    }
    best.point = [ox + dx * best.t, oy + dy * best.t, oz + dz * best.t];
    return best;
  }

  fire(p, ev, lt) {
    const def = WEAPONS[ev.weaponId];
    const eye = this.g.eyePos(p);
    switch (def.type) {
      case 'hitscan': return this.fireHitscan(p, def, ev, eye, lt);
      case 'projectile': return this.g.projectiles.spawnFromWeapon(p, def, ev, eye);
      case 'flame': return this.fireFlame(p, def, ev, eye);
      case 'repair': return this.fireRepair(p, def, ev, eye, lt);
      default:
    }
  }

  fireHitscan(p, def, ev, eye, lt) {
    const dirs = shotDirections(ev.y, ev.p, ev.spread, def.pellets, ev.seed);
    const ends = [];
    const perTarget = new Map();
    for (const d of dirs) {
      const hit = this.trace(p, eye, d, def.range, lt);
      ends.push([round2(hit.point[0]), round2(hit.point[1]), round2(hit.point[2]), hit.kind === 'player' ? 1 : hit.kind === 'world' ? 0 : hit.kind === 'turret' ? 3 : 2]);
      if (hit.kind === 'player') {
        const { damage, headshot } = hitscanDamage(def, { dist: hit.t, headshot: hit.headshot, charge: ev.charge, scoped: ev.scoped });
        const acc = perTarget.get(hit.target) || { dmg: 0, headshot: false, point: hit.point, n: 0 };
        acc.dmg += damage; acc.headshot = acc.headshot || headshot; acc.n++;
        perTarget.set(hit.target, acc);
      } else if (hit.kind === 'turret') {
        this.g.abilities.damageTurret(hit.target, hitscanDamage(def, { dist: hit.t }).damage, p);
      }
    }
    this.g.event(['f', p.id, def.id, ev.shot, round2(eye[0]), round2(eye[1]), round2(eye[2]), ends], p.ms, p.id);
    for (const [target, acc] of perTarget) {
      // knockback weapons push proportionally to how many pellets connected
      const knock = def.knockback ? def.knockback * (acc.n / def.pellets) : 0;
      this.damage(target, acc.dmg, p, def.id, { headshot: acc.headshot, point: acc.point, knock });
      if (def.id === 'longshot' || def.scope) this.reveal(target, p);
    }
  }

  reveal(target, by) {
    const cls = getClass(by.classId);
    if (cls.passive.id === 'recon' && target.alive) target.revealedUntil = this.g.time + cls.passive.revealTime;
  }

  fireFlame(p, def, ev, eye) {
    const f = def.flame;
    const fwd = dirFromAngles(ev.y, ev.p);
    for (const q of this.g.players.values()) {
      if (q === p || !q.alive || q.team === p.team) continue;
      const c = [q.ms.x, q.ms.y + 1.0, q.ms.z];
      const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const d = Math.hypot(...v);
      if (d > f.range + 0.5) continue;
      const cos = (v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]) / (d || 1);
      const ang = Math.acos(Math.min(1, cos));
      if (ang > f.angle && d > 1.2) continue;
      if (!this.g.world.los(eye, c)) continue;
      let mult = d <= def.effectiveRange ? 1 : f.farMult;
      let crit = false;
      if (def.crit.fromBehind && isBehind([p.ms.x, 0, p.ms.z], p.ms.yaw, [q.ms.x, 0, q.ms.z], q.ms.yaw)) { mult *= def.critMult; crit = true; }
      this.damage(q, def.damage * mult, p, def.id, { isFire: true, point: c, crit });
      if (q.alive) this.ignite(q, p, f.afterburnDps, f.afterburnTime);
    }
    // turrets
    for (const tu of this.g.abilities.turrets.values()) {
      if (tu.team === p.team) continue;
      const d = Math.hypot(tu.x - eye[0], tu.y + 0.6 - eye[1], tu.z - eye[2]);
      if (d < f.range) this.g.abilities.damageTurret(tu, def.damage * 0.8, p);
    }
  }

  ignite(q, attacker, dps, time) {
    const cls = getClass(q.classId);
    const mult = cls.passive.fireDamageMult || 1;
    q.burn = { until: this.g.time + time * (mult < 1 ? 0.5 : 1), attacker: attacker ? attacker.id : -1, dps: dps * mult, acc: q.burn?.acc || 0 };
  }

  fireRepair(p, def, ev, eye, lt) {
    const dir = dirFromAngles(ev.y, ev.p);
    if (def.sapper) {
      // Sapper: only works on enemy turrets (shorts them out and drains their health)
      let best = null, bt = Infinity;
      for (const tu of this.g.abilities.turrets.values()) {
        if (tu.team === p.team) continue;
        const t = rayAabb(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], tu.x - 0.6, tu.y, tu.z - 0.6, tu.x + 0.6, tu.y + 1.3, tu.z + 0.6, def.repair.range);
        if (t >= 0 && t < bt && this.g.world.los(eye, [tu.x, tu.y + 0.7, tu.z])) { bt = t; best = tu; }
      }
      if (!best) return;
      best.sappedUntil = this.g.time + 0.45;
      this.g.abilities.damageTurret(best, def.damage, p);
      this.g.event(['f', p.id, def.id, ev.shot, round2(eye[0]), round2(eye[1]), round2(eye[2]), [[round2(best.x), round2(best.y + 0.7), round2(best.z), 3]]], p.ms, p.id);
      return;
    }
    // allied turret?
    let repaired = false;
    for (const tu of this.g.abilities.turrets.values()) {
      if (tu.team !== p.team) continue;
      const t = rayAabb(eye[0], eye[1], eye[2], dir[0], dir[1], dir[2], tu.x - 0.6, tu.y, tu.z - 0.6, tu.x + 0.6, tu.y + 1.3, tu.z + 0.6, def.repair.range);
      if (t >= 0) {
        this.g.abilities.repairTurret(tu, def.repair.hpPerTick, def.repair.ammoPerTick);
        repaired = true;
        this.g.event(['f', p.id, def.id, ev.shot, round2(eye[0]), round2(eye[1]), round2(eye[2]), [[round2(tu.x), round2(tu.y + 0.7), round2(tu.z), 3]]], p.ms, p.id);
        break;
      }
    }
    if (repaired) return;
    const hit = this.trace(p, eye, dir, def.range, lt);
    this.g.event(['f', p.id, def.id, ev.shot, round2(eye[0]), round2(eye[1]), round2(eye[2]), [[round2(hit.point[0]), round2(hit.point[1]), round2(hit.point[2]), hit.kind === 'player' ? 1 : 0]]], p.ms, p.id);
    if (hit.kind === 'player') this.damage(hit.target, def.damage, p, def.id, { point: hit.point });
    else if (hit.kind === 'turret') this.g.abilities.damageTurret(hit.target, def.damage, p);
  }

  melee(p, ev, lt) {
    const def = WEAPONS[ev.weaponId];
    const m = def.melee;
    const eye = this.g.eyePos(p);
    const fwd = dirFromAngles(p.ms.yaw, p.ms.pitch);
    let best = null, bestScore = -Infinity;
    for (const q of this.g.players.values()) {
      if (q === p || !q.alive || q.team === p.team) continue;
      const pos = this.g.positionAt(q, lt);
      const c = [pos.x, pos.y + 1.0, pos.z];
      const v = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const d = Math.hypot(...v);
      const hb = getClass(q.classId).hitbox;
      if (d > m.range + hb.width * 0.6 + 0.4) continue;
      const cos = (v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]) / (d || 1);
      if (Math.acos(Math.min(1, cos)) > m.angle + 0.35 / Math.max(0.6, d)) continue;
      if (!this.g.world.los(eye, c)) continue;
      const score = cos * 2 - d * 0.3;
      if (score > bestScore) { bestScore = score; best = { q, pos, c, d }; }
    }
    if (best) {
      const q = best.q;
      let dmg = def.damage, crit = false, backstab = false;
      const behind = isBehind([p.ms.x, 0, p.ms.z], p.ms.yaw, [best.pos.x, 0, best.pos.z], q.ms.yaw);
      if (m.backstab && behind) { dmg = getClass(p.classId).backstab?.damage || 200; backstab = true; }
      else if (def.crit.fromBehind && behind) { dmg *= def.critMult; crit = true; }
      if (def.crit.vsBurning && q.burn) { dmg *= def.critMult; crit = true; }
      // airborne strike after a rocket jump (or within a moment of landing): critical, instant elimination
      if (def.crit.blastJump && ((p.ms.blastJump && !p.ms.grounded) || p.ms.blastLand > 0)) { dmg = Math.max(dmg, 1000); crit = true; }
      if (m.overchargeOnHit && getClass(p.classId).ability.id === 'overcharge' && !p.ability.active) {
        p.ability.charge = Math.min(1, p.ability.charge + m.overchargeOnHit);
      }
      this.damage(q, dmg, p, def.id, { crit, backstab, point: best.c, knock: 2.5 });
      if (backstab) p.stats.backstabs++;
      this.g.event(['mh', p.id, 2, round2(best.c[0]), round2(best.c[1]), round2(best.c[2])], p.ms);
      return;
    }
    // turrets: repair own, hit enemy
    for (const tu of this.g.abilities.turrets.values()) {
      const d = Math.hypot(tu.x - eye[0], tu.y + 0.6 - eye[1], tu.z - eye[2]);
      if (d > m.range + 0.7) continue;
      const v = [tu.x - eye[0], tu.y + 0.6 - eye[1], tu.z - eye[2]];
      const cos = (v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]) / (d || 1);
      if (cos < 0.5) continue;
      if (tu.team === p.team) {
        if (m.repair) this.g.abilities.repairTurret(tu, m.repair.hp, m.repair.ammo);
        this.g.event(['mh', p.id, 3, round2(tu.x), round2(tu.y + 0.6), round2(tu.z)], p.ms);
      } else {
        this.g.abilities.damageTurret(tu, def.damage, p);
        this.g.event(['mh', p.id, 1, round2(tu.x), round2(tu.y + 0.6), round2(tu.z)], p.ms);
      }
      return;
    }
    // world
    const wh = this.g.world.raycast(eye[0], eye[1], eye[2], fwd[0], fwd[1], fwd[2], m.range);
    if (wh) {
      const pt = [eye[0] + fwd[0] * wh.t, eye[1] + fwd[1] * wh.t, eye[2] + fwd[2] * wh.t];
      this.g.event(['mh', p.id, 1, round2(pt[0]), round2(pt[1]), round2(pt[2])], p.ms);
    } else this.g.event(['mh', p.id, 0, 0, 0, 0], p.ms);
  }

  // Healing beam (called each beam event, ~10 Hz while fire held)
  beam(p, ev) {
    const def = WEAPONS[ev.weaponId];
    const b = def.beam;
    const g = this.g;
    const eye = g.eyePos(p);
    let target = p.healTarget >= 0 ? g.players.get(p.healTarget) : null;
    const valid = (q, range) => q && q.alive && q.team === p.team && q !== p &&
      Math.hypot(q.ms.x - p.ms.x, q.ms.y - p.ms.y, q.ms.z - p.ms.z) <= range && g.world.los(eye, [q.ms.x, q.ms.y + 1.1, q.ms.z]);
    if (!valid(target, b.breakRange)) {
      target = null;
      const fwd = dirFromAngles(p.ms.yaw, p.ms.pitch);
      let bestCos = Math.cos(b.lockAngle);
      for (const q of g.players.values()) {
        if (!valid(q, b.range)) continue;
        const v = [q.ms.x - eye[0], q.ms.y + 1.0 - eye[1], q.ms.z - eye[2]];
        const d = Math.hypot(...v);
        const cos = (v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2]) / d;
        if (cos > bestCos) { bestCos = cos; target = q; }
      }
    }
    const prev = p.healTarget;
    p.healTarget = target ? target.id : -1;
    if (prev !== p.healTarget && target) g.event(['beam', p.id, target.id], p.ms);
    if (!target) return;
    const over = g.abilities.isActive(p, 'overcharge');
    const mult = over ? getClass(p.classId).ability.healMult : 1;
    const dt = def.fireInterval;
    let healed = 0;
    const max = target.maxHp, overMax = max * b.overhealMax;
    if (target.hp < max) {
      healed = Math.min(max - target.hp, b.healRate * mult * dt);
    } else if (target.hp < overMax) {
      healed = Math.min(overMax - target.hp, b.healRate * b.overhealRate * mult * dt);
    }
    target.hp += healed;
    if (target.burn) target.burn.until -= dt * 2;
    target.healedBy.set(p.id, g.time);
    if (healed > 0) {
      p.stats.healing += healed;
      p.healAcc = (p.healAcc || 0) + healed;
      if (p.healAcc >= SCORE_VALUES.healPerPoint) { p.healAcc -= SCORE_VALUES.healPerPoint; p.stats.score += 1; }
    }
    if (!over) {
      const cls = getClass(p.classId);
      const rate = target.hp < max ? 1 : 0.5;
      p.ability.charge = Math.min(1, p.ability.charge + Math.max(healed, b.healRate * dt * 0.25) * cls.ability.chargePerHp * rate * (g.state === MATCH_STATE.PREROUND ? 4 : 1));
    }
  }

  updateBeams() {
    for (const p of this.g.players.values()) {
      if (p.healTarget >= 0 && (this.g.time - p.lastBeam > 0.25 || !p.alive)) p.healTarget = -1;
    }
  }

  /**
   * Explosion at point. opts: { owner, weaponId, damage, radius, minMult, knockback, selfKnockback, selfMult, directTarget, critMult, team }
   */
  explode(pt, o) {
    const g = this.g;
    const owner = o.owner;
    for (const q of g.players.values()) {
      if (!q.alive) continue;
      const self = owner && q.id === owner.id;
      if (!self && owner && q.team === o.team) continue;
      if (!self && o.noEnemy) continue; // Sky Hopper: harmless to everyone else
      const hb = getClass(q.classId).hitbox;
      // distance from explosion to the player's box
      const cx = Math.max(q.ms.x - hb.width / 2, Math.min(pt[0], q.ms.x + hb.width / 2));
      const cy = Math.max(q.ms.y, Math.min(pt[1], q.ms.y + hb.height));
      const cz = Math.max(q.ms.z - hb.width / 2, Math.min(pt[2], q.ms.z + hb.width / 2));
      const dist = Math.hypot(cx - pt[0], cy - pt[1], cz - pt[2]);
      if (dist > o.radius) continue;
      const center = [q.ms.x, q.ms.y + 1.0, q.ms.z];
      const lift = [pt[0], pt[1] + 0.15, pt[2]];
      if (!g.world.los(lift, center) && !g.world.los(lift, [q.ms.x, q.ms.y + 1.7, q.ms.z])) continue;
      const direct = o.directTarget && o.directTarget.id === q.id;
      let dmg = explosionDamage(o.damage, direct ? 0 : dist, o.radius, o.minMult ?? 0.35);
      let crit = false;
      if (direct && o.critMult) { dmg *= o.critMult; crit = true; }
      if (self) {
        const cls = getClass(q.classId);
        dmg *= (o.selfMult ?? 0.5) * (cls.passive.selfDamageMult || 1);
      }
      // knockback
      const kb = self ? (o.selfKnockback ?? o.knockback) : o.knockback;
      if (kb) {
        let kx = center[0] - pt[0], ky = center[1] - pt[1] + 0.6, kz = center[2] - pt[2];
        const kl = Math.hypot(kx, ky, kz) || 1;
        const qc = getClass(q.classId);
        const k = kb * (1 - 0.6 * dist / o.radius) * (qc.id === 'juggernaut' ? 0.5 : 1) * (self ? qc.passive.selfKnockbackMult || 1 : 1);
        const hk = self && o.hopper ? 1.2 : 1; // Sky Hopper adds extra horizontal carry
        applyImpulse(q.ms, (kx / kl) * k * hk, (ky / kl) * k + (self ? 2 : 1), (kz / kl) * k * hk);
        // launched by your own blast: tracked for airborne shovel crits (and the Sky Hopper's boost)
        if (self && !q.ms.grounded) q.ms.blastJump = o.hopper ? 2 : Math.max(q.ms.blastJump || 0, 1);
      }
      this.damage(q, dmg, owner, o.weaponId, { crit, self, point: [cx, cy, cz], explosive: true });
    }
    for (const tu of [...g.abilities.turrets.values()]) {
      if (o.noEnemy) break;
      if (owner && tu.team === o.team) continue;
      const dist = Math.hypot(tu.x - pt[0], tu.y + 0.6 - pt[1], tu.z - pt[2]);
      if (dist < o.radius) g.abilities.damageTurret(tu, explosionDamage(o.damage, dist, o.radius, o.minMult ?? 0.35), owner);
    }
    g.event(['x', round2(pt[0]), round2(pt[1]), round2(pt[2]), o.radius, o.key || '', owner ? owner.id : -1, o.weaponId], pt);
  }

  /**
   * Apply damage. attacker may be null (environment). opts: { headshot, crit, backstab, isFire, point, self, raw, noReveal, knock, explosive }
   */
  damage(victim, amount, attacker, weaponId, opts = {}) {
    const g = this.g;
    if (!victim.alive || amount <= 0) return 0;
    if (g.state === MATCH_STATE.ENDED) return 0;
    const cls = getClass(victim.classId);
    const self = attacker && attacker.id === victim.id;
    if (attacker && !self && attacker.team === victim.team && !g.modeCfg.friendlyFire) return 0;
    let dmg = amount;
    if (!opts.raw) {
      let frontline = false;
      if (cls.passive.id === 'frontline') {
        for (const q of g.players.values()) {
          if (q !== victim && q.alive && q.team === victim.team && Math.hypot(q.ms.x - victim.ms.x, q.ms.z - victim.ms.z) < cls.passive.allyRadius) { frontline = true; break; }
        }
      }
      dmg = applyDefense(amount, {
        spawnProtected: victim.spawnProtectUntil > g.time && !self,
        overcharged: g.abilities.isOvercharged(victim),
        overchargeReduction: CLASSES.doctor.ability.damageReduction,
        suppression: g.abilities.isActive(victim, 'suppression'),
        suppressionReduction: cls.ability.damageReduction,
        frontline,
        frontlineReduction: cls.passive.damageReduction,
        rallied: victim.rallyUntil > g.time,
        rallyReduction: CLASSES.soldier.ability.rallyReduction,
        isFire: opts.isFire,
        fireDamageMult: cls.passive.fireDamageMult,
      });
      if (opts.backstab) dmg = Math.max(dmg, Math.round(amount * (g.abilities.isOvercharged(victim) ? 0.5 : 1)));
    } else {
      dmg = amount;
      victim.spawnShieldAcc = (victim.spawnShieldAcc || 0) + dmg;
      if (victim.spawnShieldAcc < 1) return 0;
      dmg = Math.floor(victim.spawnShieldAcc);
      victim.spawnShieldAcc -= dmg;
    }
    if (dmg <= 0) return 0;
    victim.hp -= dmg;
    if (victim.disguise && !opts.noReveal && dmg >= getClass('spy').ability.damageRevealThreshold) g.abilities.reveal(victim);
    if (attacker && !self) {
      victim.damageLog.push({ id: attacker.id, t: g.time, amount: dmg });
      attacker.stats.damage += dmg;
      attacker.dmgAcc = (attacker.dmgAcc || 0) + dmg;
      if (attacker.dmgAcc >= SCORE_VALUES.damagePerPoint) { attacker.dmgAcc -= SCORE_VALUES.damagePerPoint; attacker.stats.score += 1; }
    }
    if (opts.knock && attacker && !self) {
      const dx = victim.ms.x - attacker.ms.x, dz = victim.ms.z - attacker.ms.z;
      const l = Math.hypot(dx, dz) || 1;
      applyImpulse(victim.ms, (dx / l) * opts.knock, 1.2, (dz / l) * opts.knock);
    }
    const flags = (opts.headshot ? 1 : 0) | (opts.crit ? 2 : 0) | (opts.backstab ? 4 : 0) | (opts.isFire ? 8 : 0);
    const pt = opts.point || [victim.ms.x, victim.ms.y + 1.2, victim.ms.z];
    const to = [victim.id];
    if (attacker && !self) to.push(attacker.id);
    // Turret owners get hitmarkers too
    g.event(['d', attacker ? attacker.id : -1, victim.id, dmg, round2(pt[0]), round2(pt[1]), round2(pt[2]), flags, weaponId], null, null, to);
    if (victim.bot) victim.bot.onDamaged(attacker);
    if (victim.hp <= 0) this.kill(victim, attacker, weaponId, flags);
    return dmg;
  }

  kill(victim, attacker, weaponId, flags = 0, silent = false) {
    const g = this.g;
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.healTarget = -1;
    victim.disguise = null;
    victim.burn = null;
    if (victim.cloak) victim.cloak.on = false;
    victim.rallyUntil = 0;
    for (const pr of [...g.projectiles.list.values()]) if (pr.kind === 'sticky' && pr.owner === victim.id) g.projectiles.fizzle(pr);
    victim.ability.active = false;
    victim.ability.activeUntil = 0;
    const respawn = g.state === MATCH_STATE.PREROUND ? 0.5 : g.modeCfg.respawnDelay;
    victim.respawnAt = g.time + respawn;
    g.mode.onPlayerDeath(victim, attacker);
    if (silent) { g.abilities.onOwnerDeath(victim); return; }
    victim.stats.deaths++;
    victim.stats.streak = 0;

    // Credit: environment/self kills go to the most recent enemy damager.
    let killer = attacker && attacker.id !== victim.id ? attacker : null;
    const recent = victim.damageLog.filter((d) => g.time - d.t <= MATCH_DEFAULTS.assistWindow && d.id !== victim.id);
    if (!killer && recent.length) {
      const last = recent[recent.length - 1];
      killer = g.players.get(last.id) || null;
      if (killer && killer.team === victim.team) killer = null;
    }
    let assister = null;
    const counted = g.state === MATCH_STATE.PLAYING || g.state === MATCH_STATE.OVERTIME;
    if (killer) {
      killer.stats.kills++;
      killer.stats.streak++;
      killer.stats.bestStreak = Math.max(killer.stats.bestStreak, killer.stats.streak);
      killer.stats.score += SCORE_VALUES.kill;
      killer.stats.classKills[killer.classId] = (killer.stats.classKills[killer.classId] || 0) + 1;
      if (flags & 1) killer.stats.headshotKills++;
      if (weaponId === 'turret') { killer.stats.turretKills++; }
      // damage assist: top other damager
      const byId = new Map();
      for (const d of recent) if (d.id !== killer.id) byId.set(d.id, (byId.get(d.id) || 0) + d.amount);
      let top = null, topD = 0;
      for (const [id, amt] of byId) if (amt > topD) { topD = amt; top = id; }
      const assists = new Set();
      if (top !== null) assists.add(top);
      // medical assist: doctors healing the killer recently
      for (const [docId, t] of killer.healedBy) if (g.time - t <= MATCH_DEFAULTS.healAssistWindow) assists.add(docId);
      for (const id of assists) {
        const a = g.players.get(id);
        if (!a || a.team !== killer.team || a.id === killer.id) continue;
        a.stats.assists++;
        a.stats.score += SCORE_VALUES.assist;
        if (!assister) assister = a;
      }
      if (counted) g.mode.onKill(killer, victim);
      // key rewards: record kills between two real players only (bots never count)
      if (counted && !killer.isBot && !victim.isBot && killer.team !== victim.team) {
        (g.humanKills ||= []).push({ killer: killer.id, victim: victim.id, team: killer.team, killerTeam: killer.team, victimTeam: victim.team });
      }
      if (killer.bot) killer.bot.onKill(victim);
    }
    g.abilities.onOwnerDeath(victim);
    g.event(['k', killer ? killer.id : -1, victim.id, weaponId, flags, assister ? assister.id : -1, round2(victim.ms.x), round2(victim.ms.y), round2(victim.ms.z), victim.classId]);
  }
}

export { ABILITY_SOURCES, eyeHeight };
