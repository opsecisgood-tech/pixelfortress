// Pure damage calculation rules. Server-only authority uses these; tests cover them.
import { clamp } from './math.js';

// Range falloff for hitscan: full damage within effectiveRange, linear down to minFalloff at range.
export function falloffMult(def, dist) {
  if (dist <= def.effectiveRange) return 1;
  if (dist >= def.range) return def.minFalloff;
  const t = (dist - def.effectiveRange) / Math.max(0.001, def.range - def.effectiveRange);
  return 1 + (def.minFalloff - 1) * t;
}

/**
 * Damage for a single hitscan pellet/bullet.
 * opts: { dist, headshot, crit, charge, scoped }
 */
export function hitscanDamage(def, opts) {
  let base = def.damage;
  if (def.scope && opts.scoped) {
    base = def.damage + (def.scope.chargeMax - def.damage) * clamp(opts.charge || 0, 0, 1);
  }
  let dmg = base * (def.scope ? 1 : falloffMult(def, opts.dist || 0));
  let headshot = false;
  if (opts.headshot && def.headshotMult > 1 && (!def.headshotRequiresScope || opts.scoped)) {
    dmg *= def.headshotMult;
    headshot = true;
  }
  if (opts.crit) dmg *= def.critMult || 1.5;
  return { damage: Math.max(1, Math.round(dmg)), headshot };
}

// Explosion damage with linear falloff from centre (minMult at edge).
export function explosionDamage(baseDamage, dist, radius, minMult = 0.35) {
  if (dist >= radius) return 0;
  const t = clamp(dist / radius, 0, 1);
  return Math.round(baseDamage * (1 - (1 - minMult) * t));
}

// Is the attacker behind the victim? Uses victim yaw and attacker->victim direction (server-validated).
// Returns true when the attacker stands within ~100° cone behind the victim and faces them.
export function isBehind(attackerPos, attackerYaw, victimPos, victimYaw) {
  const dx = victimPos[0] - attackerPos[0];
  const dz = victimPos[2] - attackerPos[2];
  const l = Math.hypot(dx, dz) || 1;
  const tx = dx / l, tz = dz / l;
  // victim forward
  const vfx = -Math.sin(victimYaw), vfz = -Math.cos(victimYaw);
  // attacker forward
  const afx = -Math.sin(attackerYaw), afz = -Math.cos(attackerYaw);
  const behind = tx * vfx + tz * vfz > 0.25;      // attacker->victim aligns with victim facing
  const facing = tx * afx + tz * afz > 0.3;       // attacker looks at victim
  return behind && facing;
}

/**
 * Apply defensive modifiers on the victim.
 * mods: { spawnProtected, suppression, overcharged, frontline, fireDamageMult, isFire, selfDamageMult, isSelf }
 */
export function applyDefense(dmg, mods) {
  if (mods.spawnProtected) return 0;
  let m = 1;
  if (mods.overcharged) m *= 1 - (mods.overchargeReduction ?? 0.5);
  if (mods.suppression) m *= 1 - (mods.suppressionReduction ?? 0.35);
  if (mods.frontline) m *= 1 - (mods.frontlineReduction ?? 0.1);
  if (mods.rallied) m *= 1 - (mods.rallyReduction ?? 0.25);
  if (mods.isFire && mods.fireDamageMult) m *= mods.fireDamageMult;
  if (mods.isSelf && mods.selfDamageMult) m *= mods.selfDamageMult;
  return Math.max(0, Math.round(dmg * m));
}

// Fall damage from landing impact speed.
export function fallDamage(impactSpeed, threshold, perMs) {
  if (impactSpeed <= threshold) return 0;
  return Math.round((impactSpeed - threshold) * perMs);
}
