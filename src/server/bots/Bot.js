// Server-side bot AI. Bots generate the same input commands a human client would send, so they obey
// identical movement, weapon and ability validation. Class-aware behaviour + nav-graph path finding.
import { BTN, otherTeam, FLAG_STATE, MATCH_STATE } from '../../shared/constants.js';
import { getClass } from '../../shared/config/classes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { wrapAngle, anglesFromDir } from '../../shared/math.js';
import { eyeHeight } from '../../shared/movement.js';

export const BOT_NAMES = [
  'Bolt', 'Rivets', 'Cinder', 'Gauge', 'Hex', 'Mortar', 'Patch', 'Quill', 'Rook', 'Sprocket', 'Tinder', 'Vandal',
  'Widget', 'Yarrow', 'Zinc', 'Anvil', 'Brick', 'Crank', 'Dynamo', 'Ember', 'Flux', 'Grit', 'Halcyon', 'Ingot',
];

export class BotController {
  constructor(game, p) {
    this.g = game;
    this.p = p;
    this.seq = 0;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.goalTimer = 0;
    this.target = null;
    this.targetSeen = 0;
    this.reaction = 0;
    this.thinkTimer = 0;
    this.strafe = 1;
    this.strafeTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.skill = game.botDifficulty * (0.75 + Math.random() * 0.5);
    this.role = Math.random() < 0.6 ? 'attack' : 'defend';
    this.slotWanted = 0;
    this.lastDamagedBy = null;
    this.jumpHold = 0;
    this.abilityPulse = false;
    this.turretSpot = null;
  }

  onSpawn() {
    this.path = null;
    this.goal = null;
    this.target = null;
    this.yaw = this.p.ms.yaw;
    this.pitch = 0;
    this.slotWanted = this.p.classId === 'doctor' ? 1 : 0;
    this.goalTimer = 0;
    this.turretSpot = null;
    // occasionally switch class between lives for variety
    if (Math.random() < 0.12) this.p.nextClassId = this.g.pickClass(this.p.team);
    const mates = [...this.g.players.values()].filter((q) => q.team === this.p.team && q !== this.p && q.bot);
    const attackers = mates.filter((q) => q.bot.role === 'attack').length;
    const want = Math.ceil((mates.length + 1) * 0.6);
    if (this.p.classId === 'scout' || this.p.classId === 'spy') this.role = 'attack';
    else if (this.p.classId === 'mechanic') this.role = 'defend';
    else this.role = attackers < want ? 'attack' : 'defend';
  }

  onDamaged(attacker) {
    if (attacker && attacker !== this.p && attacker.alive) { this.lastDamagedBy = attacker; this.reaction = Math.min(this.reaction, 0.15); }
  }
  onKill() {}
  onCapture() { this.goal = null; this.path = null; }

  eye() { return [this.p.ms.x, this.p.ms.y + eyeHeight(this.p.ms), this.p.ms.z]; }

  visible(q) {
    const e = this.eye();
    return this.g.world.los(e, [q.ms.x, q.ms.y + 1.2, q.ms.z]);
  }

  perceive() {
    const p = this.p;
    let best = null, bestScore = Infinity;
    for (const q of this.g.players.values()) {
      if (!q.alive || q.team === p.team) continue;
      const d = Math.hypot(q.ms.x - p.ms.x, q.ms.y - p.ms.y, q.ms.z - p.ms.z);
      if (d > 70) continue;
      // disguised spies fool bots unless very close or revealed / recently attacked us
      if (q.disguise && d > 2.5 && this.lastDamagedBy !== q && q.revealedUntil < this.g.time) continue;
      // cloaked spies are invisible unless bumped into
      if (q.cloak?.on && d > 1.6) continue;
      if (!this.visible(q)) continue;
      // field of view check (bots can't see behind them unless close or hurt by)
      const ang = Math.abs(wrapAngle(Math.atan2(-(q.ms.x - p.ms.x), -(q.ms.z - p.ms.z)) - this.yaw));
      if (ang > 1.7 && d > 6 && this.lastDamagedBy !== q) continue;
      const score = d + (q.hp / q.maxHp) * 8 + (q.carrying >= 0 ? -20 : 0);
      if (score < bestScore) { bestScore = score; best = q; }
    }
    if (best && best !== this.target) {
      this.reaction = 0.18 + (1 - this.skill) * 0.45 + Math.random() * 0.15;
    }
    this.target = best;
  }

  chooseGoal() {
    const g = this.g, p = this.p;
    const cls = p.classId;
    // Doctor: follow a teammate
    if (cls === 'doctor') {
      let best = null, bs = Infinity;
      for (const q of g.players.values()) {
        if (q === p || !q.alive || q.team !== p.team || q.classId === 'doctor') continue;
        const d = Math.hypot(q.ms.x - p.ms.x, q.ms.z - p.ms.z);
        const s = d - (1 - q.hp / q.maxHp) * 25 - (q.classId === 'juggernaut' ? 8 : 0) - (q.carrying >= 0 ? 15 : 0);
        if (s < bs) { bs = s; best = q; }
      }
      if (best) { this.follow = best; return [best.ms.x, best.ms.y, best.ms.z]; }
    }
    if (g.modeId === 'ctf') {
      const mode = g.mode;
      const own = mode.ownFlag(p.team), enemy = mode.enemyFlag(p.team);
      if (p.carrying >= 0) return [...own.base];
      if (own.state === FLAG_STATE.CARRIED) {
        const c = g.players.get(own.carrier);
        if (c) return [c.ms.x, c.ms.y, c.ms.z];
      }
      if (own.state === FLAG_STATE.DROPPED || own.state === FLAG_STATE.RETURNING) return [...own.pos];
      if (this.role === 'defend' || cls === 'mechanic') {
        const ang = Math.random() * Math.PI * 2;
        const r = cls === 'mechanic' ? 6 : 4 + Math.random() * 8;
        return this.reachable([own.base[0] + Math.cos(ang) * r + (p.team === 0 ? 6 : -6), own.base[1], own.base[2] + Math.sin(ang) * r]) || [...own.base];
      }
      if (enemy.state === FLAG_STATE.CARRIED) {
        const c = g.players.get(enemy.carrier);
        if (c) return [c.ms.x, c.ms.y, c.ms.z];
      }
      return [...enemy.pos];
    }
    // TDM: head toward enemies / contested centre
    if (cls === 'mechanic' && !this.hasTurret()) {
      const s = this.g.map.spawns.find((sp) => sp.team === p.team).pos;
      const t = 0.35 + Math.random() * 0.2;
      return this.reachable([s[0] * (1 - t) * 0.9, 0, s[2] * (1 - t) + (Math.random() - 0.5) * 20]) || [0, 0, 0];
    }
    const enemies = [...g.players.values()].filter((q) => q.alive && q.team !== p.team);
    if (enemies.length && Math.random() < 0.6) {
      const q = enemies[Math.floor(Math.random() * enemies.length)];
      return [q.ms.x, q.ms.y, q.ms.z];
    }
    const b = g.map.bounds;
    return this.reachable([(Math.random() - 0.5) * (b.maxX - b.minX) * 0.5, 0, (Math.random() - 0.5) * (b.maxZ - b.minZ) * 0.7]) || [0, 0, 0];
  }

  reachable(pos) {
    const n = this.g.nav.nearest(pos[0], pos[1] + 0.5, pos[2], 6);
    if (n < 0) return null;
    const node = this.g.nav.nodes[n];
    return [node.x, node.y, node.z];
  }

  hasTurret() {
    for (const tu of this.g.abilities.turrets.values()) if (tu.owner === this.p.id) return tu;
    return null;
  }

  repath() {
    if (!this.goal) return;
    const nav = this.g.nav;
    const a = nav.nearest(this.p.ms.x, this.p.ms.y, this.p.ms.z);
    const b = nav.nearest(this.goal[0], this.goal[1] + 0.3, this.goal[2]);
    this.path = nav.path(a, b, 40000);
    if (!this.path) this.pathFails = (this.pathFails || 0) + 1;
    this.pathIdx = 0;
  }

  update(dt) {
    const p = this.p, g = this.g;
    if (!p.alive) return;
    this.thinkTimer -= dt;
    this.goalTimer -= dt;
    this.reaction -= dt;
    this.strafeTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.2 + Math.random() * 0.1;
      this.perceive();
    }
    const followRefresh = this.follow && this.goalTimer < 1.2;
    if (!this.goal || this.goalTimer <= 0 || followRefresh || (this.path && this.pathIdx >= this.path.length)) {
      this.follow = null;
      this.goal = this.chooseGoal();
      this.goalTimer = 3 + Math.random() * 3;
      this.repath();
    }

    let buttons = 0;
    let moveDir = null;
    const pos = [p.ms.x, p.ms.y, p.ms.z];

    // ---- path following
    if (this.path && this.pathIdx < this.path.length) {
      const nodes = g.nav.nodes;
      let node = nodes[this.path[this.pathIdx]];
      const dxz = Math.hypot(node.x - pos[0], node.z - pos[2]);
      if (dxz < 0.7 && Math.abs(node.y - pos[1]) < 1.6) {
        this.pathIdx++;
        if (this.pathIdx < this.path.length) node = nodes[this.path[this.pathIdx]];
      }
      if (this.pathIdx < this.path.length) {
        // look ahead: skip to a further node when walkable on the same level
        const ahead = this.path[Math.min(this.path.length - 1, this.pathIdx + 2)];
        const an = nodes[ahead];
        const tgt = Math.abs(an.y - pos[1]) < 0.3 && Math.abs(node.y - pos[1]) < 0.3 ? an : node;
        moveDir = [tgt.x - pos[0], tgt.z - pos[2]];
        if (node.y - pos[1] > 0.45 && Math.hypot(node.x - pos[0], node.z - pos[2]) < 1.8) buttons |= BTN.JUMP;
      }
    }

    // stuck detection
    const moved = Math.hypot(pos[0] - this.lastPos[0], pos[2] - this.lastPos[2]);
    if (moveDir && moved < 0.02 && !this.target) this.stuckTimer += dt; else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    this.lastPos = pos;
    if (this.stuckTimer > 0.6) buttons |= BTN.JUMP;
    if (this.stuckTimer > 2.0) { this.stuckTimer = 0; this.goal = null; }

    const pathDir = moveDir;
    // ---- combat & aiming
    const cls = getClass(p.classId);
    let wantYaw = moveDir ? Math.atan2(-moveDir[0], -moveDir[1]) : this.yaw;
    let wantPitch = 0;
    let fire = false, alt = false;
    const t = this.target && this.target.alive ? this.target : null;
    const dist = t ? Math.hypot(t.ms.x - pos[0], t.ms.y - pos[1], t.ms.z - pos[2]) : 999;

    if (p.classId === 'doctor') {
      // heal follow target
      const ally = this.follow && this.follow.alive ? this.follow : null;
      if (ally && Math.hypot(ally.ms.x - pos[0], ally.ms.z - pos[2]) < 13 && (!t || dist > 6)) {
        this.slotWanted = 1;
        const a = anglesFromDir(ally.ms.x - pos[0], ally.ms.y + 1 - (pos[1] + 1.6), ally.ms.z - pos[2]);
        wantYaw = a.yaw; wantPitch = a.pitch;
        fire = true;
        if (Math.hypot(ally.ms.x - pos[0], ally.ms.z - pos[2]) < 4) moveDir = null;
        if (p.ability.charge >= 1 && (t || p.hp < p.maxHp * 0.5)) this.pulseAbility();
      } else if (t) {
        this.slotWanted = dist < 2.5 ? 2 : 0;
      }
    }

    if (t && this.reaction <= 0 && !(p.classId === 'doctor' && this.slotWanted === 1)) {
      const wdef = WEAPONS[p.ws.w[this.slotWanted]?.id] || WEAPONS[p.ws.w[0].id];
      // weapon selection
      const prim = WEAPONS[p.ws.w[0].id], sec = WEAPONS[p.ws.w[1].id];
      const pw = p.ws.w[0], sw = p.ws.w[1];
      if (p.classId === 'spy') this.slotWanted = dist < 3 ? 2 : 0;
      else if (p.classId === 'demolitionist' && sec.id === 'stickylauncher' && dist > 5 && (t.id + Math.floor(g.time / 4)) % 3 === 0 && (sw.clip > 0 || sw.reserve > 0)) this.slotWanted = 1;
      else if (dist < 2.2 && p.classId !== 'incinerator' && p.classId !== 'juggernaut') this.slotWanted = 2;
      else if (pw.clip === 0 && pw.reserve === 0 && prim.clip >= 0) this.slotWanted = sec.type === 'beam' || sec.type === 'repair' ? 2 : 1;
      else if (p.classId === 'marksman' && dist < 9) this.slotWanted = 1;
      else if (p.classId === 'incinerator' && dist > 10) this.slotWanted = 1;
      else if (p.classId === 'mechanic' && dist > 20) this.slotWanted = 0;
      else this.slotWanted = 0;
      const def = WEAPONS[p.ws.w[p.ws.slot].id] || wdef;
      // lead projectiles
      let tx = t.ms.x, ty = t.ms.y + (Math.random() < this.skill * 0.35 ? 1.55 : 1.05), tz = t.ms.z;
      if (def.type === 'projectile') {
        const lead = dist / def.projectile.speed;
        tx += t.ms.vx * lead; tz += t.ms.vz * lead;
        if (def.projectile.gravity > 0) ty += 0.5 * def.projectile.gravity * lead * lead * 0.8;
        if (def.projectile.explode) ty = t.ms.y + 0.3; // aim at feet
      }
      const e = this.eye();
      const a = anglesFromDir(tx - e[0], ty - e[1], tz - e[2]);
      const noise = (1 - this.skill) * 0.08;
      wantYaw = a.yaw + (Math.random() - 0.5) * noise;
      wantPitch = a.pitch + (Math.random() - 0.5) * noise;
      const err = Math.abs(wrapAngle(this.yaw - a.yaw)) + Math.abs(this.pitch - a.pitch);
      const range = def.type === 'melee' ? def.melee.range + 0.6 : def.type === 'flame' ? def.flame.range : def.range;
      fire = err < (def.type === 'melee' ? 0.6 : 0.12 + (1 - this.skill) * 0.1) && dist <= range;
      if (def.spinUp && dist < 25) alt = true;
      if (def.scope) {
        alt = dist > 9;
        if (alt) fire = fire && p.ws.w[0].charge > 0.45 + Math.random() * 0.3;
      }
      // keep some distance / close in depending on class
      const pref = def.botRange || 10;
      if (dist < 2.5 || p.classId === 'spy') {
        moveDir = [t.ms.x - pos[0], t.ms.z - pos[2]];
        if (p.classId === 'spy') {
          // circle behind target
          const behindX = t.ms.x + Math.sin(t.ms.yaw) * 1.4, behindZ = t.ms.z + Math.cos(t.ms.yaw) * 1.4;
          moveDir = [behindX - pos[0], behindZ - pos[2]];
        }
      } else if (dist > pref * 1.4) {
        // keep pathing toward goal / target
        if (!moveDir) moveDir = [t.ms.x - pos[0], t.ms.z - pos[2]];
      } else if (dist < pref * 0.6 && p.classId !== 'scout') {
        moveDir = [pos[0] - t.ms.x, pos[2] - t.ms.z];
      } else moveDir = null;
      // objective pushers keep moving while shooting
      const pushing = g.modeId === 'ctf' && (p.carrying >= 0 || (this.role === 'attack' && Math.random() < 0.85));
      if (pushing && pathDir && dist > 3) moveDir = pathDir;
      // strafing
      if (this.strafeTimer <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeTimer = 0.4 + Math.random() * 1.1; }
      // abilities in combat
      switch (cls.ability.id) {
        case 'suppression': if (dist < 18 && p.hp < p.maxHp * 0.8) this.pulseAbility(); break;
        case 'thermalburst': if (dist < 4.5) this.pulseAbility(); break;
        case 'esp': if (dist > 25 || Math.random() < 0.004) this.pulseAbility(); break;
        case 'adrenaline': if (p.carrying >= 0 || p.hp < p.maxHp * 0.4 || Math.random() < 0.003) this.pulseAbility(); break;
        case 'detcharge': if (dist < 16 && Math.random() < 0.02) this.pulseAbility(); break;
        case 'rally': if (dist < 20 && (p.hp < p.maxHp * 0.7 || Math.random() < 0.01)) this.pulseAbility(); break;
        default:
      }
      if (cls.ability.id === 'detcharge' && this.g.abilities.charges.has(p.id)) {
        const pr = this.g.projectiles.list.get(this.g.abilities.charges.get(p.id));
        if (pr && Math.hypot(pr.x - t.ms.x, pr.z - t.ms.z) < 3) this.pulseAbility();
      }
      // spies cloak on the approach and decloak right behind their mark
      if (p.classId === 'spy') {
        if (!p.cloak.on && dist > 9 && dist < 30 && p.cloak.meter > 0.6 && Math.random() < 0.05) this.altPulse = true;
        if (p.cloak.on && dist < 3.2) this.altPulse = true;
      }
      // detonate stickies that are close to the target
      if (p.weapons.includes('stickylauncher')) {
        for (const pr of g.projectiles.list.values()) {
          if (pr.kind === 'sticky' && pr.owner === p.id && g.time - pr.born > pr.armTime && Math.hypot(pr.x - t.ms.x, pr.y - t.ms.y - 0.6, pr.z - t.ms.z) < 2.4) { this.altPulse = true; break; }
        }
      }
    } else if (!t) {
      // Out of combat behaviour
      if (p.classId === 'spy' && p.cloak.on && p.cloak.meter < 0.3) this.altPulse = true;
      if (p.classId === 'spy') {
        // sap enemy turrets
        for (const tu of g.abilities.turrets.values()) {
          if (tu.team === p.team) continue;
          const td = Math.hypot(tu.x - pos[0], tu.z - pos[2]);
          if (td > 16) continue;
          this.slotWanted = 1;
          moveDir = td > 1.6 ? [tu.x - pos[0], tu.z - pos[2]] : null;
          const a = anglesFromDir(tu.x - pos[0], tu.y + 0.6 - (pos[1] + 1.6), tu.z - pos[2]);
          wantYaw = a.yaw; wantPitch = a.pitch;
          if (td < 2.4) fire = true;
          if (p.cloak.on && td < 3) this.altPulse = true;
          break;
        }
      }
      if (cls.ability.id === 'disguise' && !p.disguise && p.ability.cdUntil < g.time) this.pulseAbility();
      if (cls.ability.id === 'turret' && !this.hasTurret() && p.ability.cdUntil < g.time) {
        const near = this.goal && Math.hypot(this.goal[0] - pos[0], this.goal[2] - pos[2]) < 4;
        if (near || Math.random() < 0.004) { wantPitch = -0.5; this.pulseAbility(); }
      }
      if (cls.ability.id === 'turret') {
        const tu = this.hasTurret();
        if (tu && (tu.hp < tu.maxHp * 0.9 || tu.ammo < 100) && Math.hypot(tu.x - pos[0], tu.z - pos[2]) < 12) {
          this.slotWanted = 2;
          moveDir = [tu.x - pos[0], tu.z - pos[2]];
          const a = anglesFromDir(tu.x - pos[0], tu.y + 0.6 - (pos[1] + 1.6), tu.z - pos[2]);
          wantYaw = a.yaw; wantPitch = a.pitch;
          if (Math.hypot(tu.x - pos[0], tu.z - pos[2]) < 2) { moveDir = null; fire = true; }
        }
      }
      const sapping = p.classId === 'spy' && this.slotWanted === 1;
      if (p.classId !== 'doctor' && this.slotWanted !== 2 && !sapping) this.slotWanted = 0;
      if (p.classId !== 'doctor' && p.classId !== 'mechanic' && !sapping) this.slotWanted = 0;
      // reload when idle
      const w = p.ws.w[p.ws.slot];
      const d = WEAPONS[w.id];
      if (d.clip > 0 && w.clip < d.clip * 0.6 && w.reserve > 0) buttons |= BTN.RELOAD;
      // look where we walk; scan pitch toward 0
      if (this.lastDamagedBy && this.lastDamagedBy.alive) {
        const q = this.lastDamagedBy;
        wantYaw = Math.atan2(-(q.ms.x - pos[0]), -(q.ms.z - pos[2]));
        if (Math.random() < 0.02) this.lastDamagedBy = null;
      }
    }

    // turn toward desired view with limited turn rate
    const turn = (5 + this.skill * 9) * dt;
    const dy = wrapAngle(wantYaw - this.yaw);
    this.yaw = wrapAngle(this.yaw + Math.max(-turn, Math.min(turn, dy)));
    this.pitch += Math.max(-turn, Math.min(turn, wantPitch - this.pitch));
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));

    // convert world move direction into relative keys
    if (moveDir && Math.hypot(moveDir[0], moveDir[1]) > 0.1) {
      const ang = wrapAngle(Math.atan2(-moveDir[0], -moveDir[1]) - this.yaw);
      // ang 0 = forward, +pi/2 = left
      const oct = Math.round(ang / (Math.PI / 4));
      const keys = {
        0: BTN.FORWARD, 1: BTN.FORWARD | BTN.LEFT, 2: BTN.LEFT, 3: BTN.BACK | BTN.LEFT,
        4: BTN.BACK, '-4': BTN.BACK, '-3': BTN.BACK | BTN.RIGHT, '-2': BTN.RIGHT, '-1': BTN.FORWARD | BTN.RIGHT,
      };
      buttons |= keys[oct] ?? BTN.FORWARD;
      if (!t && Math.abs(ang) < 0.4 && p.classId !== 'juggernaut' && Math.hypot(moveDir[0], moveDir[1]) > 6) buttons |= BTN.SPRINT;
    }
    if (t && this.reaction <= 0 && p.classId !== 'spy' && p.classId !== 'doctor') buttons |= this.strafe > 0 ? BTN.RIGHT : BTN.LEFT;
    if (fire) buttons |= BTN.FIRE;
    if (alt) buttons |= BTN.ALT;
    if (this.altPulse) { buttons |= BTN.ALT; this.altPulse = false; }
    if (this.abilityPulse) { buttons |= BTN.ABILITY; this.abilityPulse = false; }
    if (g.state === MATCH_STATE.PREROUND) buttons &= ~(BTN.FIRE | BTN.ABILITY);

    // semi-auto weapons: release fire every other tick
    const curDef = WEAPONS[p.ws.w[p.ws.slot].id];
    if (!curDef.auto && (this.seq & 1)) buttons &= ~BTN.FIRE;

    this.seq++;
    p.cmdQueue.push({ seq: p.lastSeq + p.cmdQueue.length + 1, dt: 1 / 30, b: buttons, y: this.yaw, p: this.pitch, w: this.slotWanted, lt: g.time });
  }

  pulseAbility() {
    this.abilityPulse = true;
  }
}

void otherTeam;
