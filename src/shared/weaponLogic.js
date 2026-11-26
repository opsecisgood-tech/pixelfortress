// Deterministic weapon state machine shared by server (authoritative) and client (prediction).
// Handles firing cadence, ammunition, magazine/single reloads, reload interruption, switching,
// rotary spin-up, scope charging and melee wind-up. Produces events; the server turns events into
// hits/projectiles, the client turns them into animation, audio and effects.
import { WEAPONS } from './config/weapons.js';
import { BTN } from './constants.js';
import { dirFromAngles, mulberry32, hashInts } from './math.js';

export function createWeaponState(cls, startSlot = 0, weapons = cls.weapons) {
  return {
    time: 0,
    slot: startSlot,
    ready: 0.4,              // time at which current weapon may fire (deploy)
    shots: 0,
    prevButtons: 0,
    lastEmpty: -10,
    lastFire: -10,
    scoped: false,
    w: weapons.map((id) => {
      const d = WEAPONS[id];
      return { id, clip: d.clip, reserve: d.reserve, next: 0, rel: 0, relT: 0, spin: 0, charge: 0, melee: -1 };
    }),
  };
}

export function refillAmmo(ws, fraction = 1) {
  let changed = false;
  for (const w of ws.w) {
    const d = WEAPONS[w.id];
    if (d.clip < 0) continue;
    const maxReserve = d.reserve;
    if (fraction >= 1) {
      if (w.clip !== d.clip || w.reserve !== maxReserve) changed = true;
      w.clip = d.clip; w.reserve = maxReserve;
    } else {
      const add = Math.ceil((d.clip + maxReserve) * fraction);
      const before = w.reserve;
      w.reserve = Math.min(maxReserve, w.reserve + add);
      if (w.reserve !== before) changed = true;
    }
  }
  return changed;
}

export function needsAmmo(ws) {
  return ws.w.some((w) => {
    const d = WEAPONS[w.id];
    return d.clip >= 0 && (w.reserve < d.reserve || w.clip < d.clip);
  });
}

export function currentWeaponDef(ws) {
  return WEAPONS[ws.w[ws.slot].id];
}

export function isReloading(ws) {
  return ws.w[ws.slot].rel > 0;
}

// Compute spread (radians half-angle) for a shot right now.
export function computeSpread(def, ctx, ws) {
  const w = ws.w[ws.slot];
  if (def.scope && ws.scoped && ctx.time - (w.scopeStart || 0) >= 0) return 0;
  let s = def.spread || 0;
  s += (def.spreadMove || 0) * Math.min(1, (ctx.hspeed || 0) / 7);
  if (!ctx.grounded) s += def.spreadAir || 0;
  if (ctx.crouch) s *= 0.7;
  if (ctx.spreadMult) s *= ctx.spreadMult;
  return s;
}

// Pellet directions for a shot. Deterministic given seed.
export function shotDirections(yaw, pitch, spread, pellets, seed) {
  const rnd = mulberry32(seed);
  const fwd = dirFromAngles(yaw, pitch);
  // Basis: right & up perpendicular to forward.
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    fwd[1] * right[2] - fwd[2] * right[1],
    fwd[2] * right[0] - fwd[0] * right[2],
    fwd[0] * right[1] - fwd[1] * right[0],
  ];
  // up = forward x right gives downward; flip
  up[0] = -up[0]; up[1] = -up[1]; up[2] = -up[2];
  const out = [];
  for (let i = 0; i < pellets; i++) {
    let ox = 0, oy = 0;
    if (spread > 0) {
      if (pellets > 1) {
        // Fixed ring pattern + jitter: readable, fair shotgun spread.
        const ring = i === 0 ? 0 : (i % 2 === 0 ? 1 : 0.55);
        const a = (i / pellets) * Math.PI * 2 + rnd() * 0.6;
        const r = spread * (ring * 0.85 + rnd() * 0.25);
        ox = Math.cos(a) * r; oy = Math.sin(a) * r;
      } else {
        const a = rnd() * Math.PI * 2;
        const r = spread * Math.sqrt(rnd());
        ox = Math.cos(a) * r; oy = Math.sin(a) * r;
      }
    }
    const d = [
      fwd[0] + right[0] * ox + up[0] * oy,
      fwd[1] + right[1] * ox + up[1] * oy,
      fwd[2] + right[2] * ox + up[2] * oy,
    ];
    const l = Math.hypot(d[0], d[1], d[2]);
    out.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  return out;
}

/**
 * Step weapon logic for one command.
 * ctx: { pid, alive, reloadMult, explosiveReloadMult, spreadMult, hspeed, grounded, crouch, sprinting, disarmed }
 * returns array of events.
 */
export function stepWeapons(ws, cmd, ctx) {
  const dt = Math.min(Math.max(cmd.dt || 0, 0), 0.05);
  const events = [];
  ws.time += dt;
  const t = ws.time;
  const b = cmd.b | 0;
  const pressed = b & ~ws.prevButtons;
  ws.prevButtons = b;
  ctx.time = t;
  if (!ctx.alive) return events;

  // ---- Switching ---------------------------------------------------------
  if (cmd.w !== undefined && cmd.w !== null && cmd.w !== ws.slot && cmd.w >= 0 && cmd.w <= 2) {
    const cur = ws.w[ws.slot];
    const oldDef = WEAPONS[cur.id];
    cur.rel = 0; cur.melee = -1; cur.charge = 0; cur.spin = 0;
    ws.scoped = false;
    ws.slot = cmd.w;
    const nd = WEAPONS[ws.w[ws.slot].id];
    ws.ready = t + (oldDef.holsterTime || 0.1) + (nd.deployTime || 0.35);
    events.push({ type: 'switch', slot: ws.slot });
  }

  const w = ws.w[ws.slot];
  const def = WEAPONS[w.id];
  const ready = t >= ws.ready;
  const fireHeld = !!(b & BTN.FIRE) && !ctx.disarmed;
  const altHeld = !!(b & BTN.ALT) && !ctx.disarmed;
  const firePressed = !!(pressed & BTN.FIRE);
  const reloadMult = (ctx.reloadMult || 1) * (def.explosive ? (ctx.explosiveReloadMult || 1) : 1);

  // ---- Rotary spin ---------------------------------------------------------
  if (def.spinUp) {
    if ((fireHeld || altHeld) && ready && w.rel === 0) {
      if (w.spin === 0) events.push({ type: 'spinup' });
      w.spin = Math.min(def.spinUp, w.spin + dt);
    } else {
      if (w.spin > 0 && w.spin - dt * 1.5 <= 0) events.push({ type: 'spindown' });
      w.spin = Math.max(0, w.spin - dt * 1.5);
    }
  }

  // ---- Scope -------------------------------------------------------------
  if (def.scope) {
    const wantScope = altHeld && ready && w.rel === 0 && !ctx.sprinting;
    if (wantScope && !ws.scoped) { ws.scoped = true; w.scopeStart = t + def.scope.delay; w.charge = 0; events.push({ type: 'scope', on: true }); }
    else if (!wantScope && ws.scoped) { ws.scoped = false; w.charge = 0; events.push({ type: 'scope', on: false }); }
    if (ws.scoped && t >= w.next && t >= w.scopeStart) {
      w.charge = Math.min(1, w.charge + dt / def.scope.chargeTime);
    }
  }

  // ---- Reload progression -------------------------------------------------
  if (w.rel > 0 && def.clip > 0) {
    if (def.reloadMode === 'mag') {
      if (t >= w.relT) {
        const need = def.clip - w.clip;
        const take = Math.min(need, w.reserve);
        w.clip += take; w.reserve -= take; w.rel = 0;
        events.push({ type: 'reload_done' });
      }
    } else {
      // single-shell loop
      while (w.rel > 0 && t >= w.relT) {
        if (w.rel === 1) {
          w.rel = 2;
          w.relT += def.reloadTime / reloadMult;
        } else {
          if (w.reserve > 0 && w.clip < def.clip) {
            w.clip++; w.reserve--;
            events.push({ type: 'reload_shell' });
          }
          if (w.clip >= def.clip || w.reserve <= 0) { w.rel = 0; events.push({ type: 'reload_done' }); }
          else w.relT += def.reloadTime / reloadMult;
        }
      }
    }
  }

  const startReload = () => {
    if (def.clip <= 0 || w.rel > 0 || w.clip >= def.clip || w.reserve <= 0) return false;
    w.rel = 1;
    w.relT = Math.max(t, w.next) + (def.reloadMode === 'mag' ? def.reloadTime / reloadMult : (def.reloadStart || 0) / reloadMult);
    if (def.reloadMode === 'mag') w.rel = 2;
    ws.scoped = false; w.charge = 0;
    events.push({ type: 'reload_start', mode: def.reloadMode });
    return true;
  };

  if ((pressed & BTN.RELOAD) && ready) startReload();

  // ---- Firing ------------------------------------------------------------
  // semi-auto trigger presses are buffered while deploying / between shots (released trigger clears it)
  if (!fireHeld) ws.queued = 0;
  else if (firePressed && (!ready || t < w.next || w.rel > 0)) ws.queued = 1;
  const wantsFire = def.auto ? fireHeld : firePressed || (fireHeld && ws.queued === 1) || (fireHeld && def.type !== 'hitscan' && def.type !== 'projectile');
  if (def.type === 'melee') {
    if (w.melee >= 0 && t >= w.melee) {
      w.melee = -1;
      events.push({ type: 'melee_hit', weaponId: w.id, slot: ws.slot });
    }
    if (fireHeld && ready && t >= w.next) {
      w.next = t + def.fireInterval;
      w.melee = t + def.melee.windup;
      ws.shots++;
      ws.lastFire = t;
      events.push({ type: 'swing', weaponId: w.id, slot: ws.slot });
    }
  } else if (def.type === 'beam') {
    if (fireHeld && ready) {
      if (t >= w.next) { w.next = t + def.fireInterval; events.push({ type: 'beam', weaponId: w.id, slot: ws.slot }); }
    }
  } else if (wantsFire && ready) {
    // reload interruption for single reloads
    if (w.rel > 0 && def.reloadInterrupt === 'fire' && w.clip > 0) { w.rel = 0; events.push({ type: 'reload_cancel' }); }
    const spunOk = !def.spinUp || w.spin >= def.spinUp;
    if (w.rel === 0 && spunOk && t >= w.next) {
      if (def.clip < 0 || w.clip >= def.ammoPerShot) {
        if (def.clip >= 0) w.clip -= def.ammoPerShot;
        // catch-up cadence for automatic weapons at low command rates
        w.next = (t - w.next < def.fireInterval * 0.5 ? w.next : t) + def.fireInterval;
        ws.shots++;
        ws.queued = 0;
        ws.lastFire = t;
        const spread = computeSpread(def, ctx, ws);
        let charge = 0;
        if (def.scope && ws.scoped) charge = w.charge;
        events.push({
          type: 'fire', weaponId: w.id, slot: ws.slot, shot: ws.shots,
          seed: hashInts(ctx.pid | 0, ws.shots), spread, charge, scoped: ws.scoped && def.scope ? 1 : 0,
          y: cmd.y, p: cmd.p,
        });
        if (def.scope) { w.charge = 0; }
        if (def.clip >= 0 && w.clip <= 0 && w.reserve > 0) startReload();
      } else if (firePressed || t - ws.lastEmpty > 0.6) {
        ws.lastEmpty = t;
        events.push({ type: 'empty' });
        startReload();
      }
    }
  }

  // Auto-reload when empty and idle.
  if (def.clip > 0 && w.clip === 0 && w.rel === 0 && w.reserve > 0 && ready && t >= w.next && !fireHeld) startReload();

  return events;
}

// Serialize weapon state for owner reconciliation (compact).
export function packWeaponState(ws) {
  return [
    +ws.time.toFixed(4), ws.slot, +ws.ready.toFixed(4), ws.shots, ws.prevButtons, (ws.scoped ? 1 : 0) | (ws.queued ? 2 : 0),
    ws.w.map((w) => [w.clip, w.reserve, +w.next.toFixed(4), w.rel, +w.relT.toFixed(4), +w.spin.toFixed(3), +w.charge.toFixed(3), +w.melee.toFixed(4), +(w.scopeStart || 0).toFixed(4)]),
  ];
}
export function unpackWeaponState(ws, a) {
  ws.time = a[0]; ws.slot = a[1]; ws.ready = a[2]; ws.shots = a[3]; ws.prevButtons = a[4]; ws.scoped = !!(a[5] & 1); ws.queued = a[5] & 2 ? 1 : 0;
  a[6].forEach((x, i) => {
    const w = ws.w[i];
    if (!w) return;
    w.clip = x[0]; w.reserve = x[1]; w.next = x[2]; w.rel = x[3]; w.relT = x[4]; w.spin = x[5]; w.charge = x[6]; w.melee = x[7]; w.scopeStart = x[8];
  });
}
