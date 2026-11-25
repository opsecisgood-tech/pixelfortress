// SINGLE SOURCE OF TRUTH for class attributes.
// Every system (movement, server damage, HUD, menus, bots, renderer) reads from here.
// Balance patches: edit numbers here, or apply an override object via applyBalanceOverrides().

export const CLASS_IDS = [
  'scout', 'spy', 'marksman', 'mechanic', 'doctor', 'juggernaut', 'incinerator', 'demolitionist',
];

const BASE_CLASSES = {
  scout: {
    id: 'scout',
    index: 0,
    displayName: 'Scout',
    role: 'Mobility / Flanking / Objective Runner',
    shortRole: 'FLANKER',
    description:
      'A featherweight sprinter who wins fights through angles and speed. Double jump over cover, chase the wounded and run the flag home.',
    health: 125,
    speed: 1.15,
    jumpPower: 1.06,
    reloadSpeed: 1.15,               // multiplier on reload speed (higher = faster)
    difficulty: 2,                   // 1 easy .. 4 expert
    difficultyLabel: 'Medium',
    weapons: ['scattershot', 'sidekick', 'streetbat'],
    signature: 'scattershot',
    ability: {
      id: 'doublejump', name: 'Double Jump', key: 'JUMP', passiveTrigger: true,
      cooldown: 0, duration: 0, airJumps: 1,
      description: 'Jump again while airborne. Redirects your momentum toward your movement keys.',
    },
    passive: { id: 'quickrecovery', name: 'Quick Recovery', landingRecovery: 0.35, description: 'Recovers from landings 65% faster.' },
    hitbox: { width: 0.72, height: 1.8, head: 0.42 },
    model: 'scout', animSet: 'light', audioSet: 'scout',
    portrait: 'scout',
    palette: { skin: 0xe8b48a, primary: 0x404a52, secondary: 0x9aa3a8, accentLevel: 'high' },
    teamVariants: { red: 'scout_red', blue: 'scout_blue' },
    botWeight: 1.2,
    limit: 0,                        // 0 = unlimited (per team)
  },
  spy: {
    id: 'spy',
    index: 1,
    displayName: 'Spy',
    role: 'Infiltration / Disruption / Ambush',
    shortRole: 'INFILTRATOR',
    description:
      'A masked operative who walks among the enemy. Disguise, slip behind their lines and strike from the back with the Shadow Blade.',
    health: 100,
    speed: 1.0,
    jumpPower: 1.0,
    reloadSpeed: 1.0,
    difficulty: 4,
    difficultyLabel: 'High',
    weapons: ['silencedpistol', 'revolver', 'shadowblade'],
    signature: 'shadowblade',
    ability: {
      id: 'disguise', name: 'Disguise', key: 'E',
      cooldown: 8, duration: 25, damageRevealThreshold: 20,
      description: 'Take on the colors of the enemy team. Attacking or taking 20+ damage reveals you.',
    },
    passive: { id: 'quietmovement', name: 'Quiet Movement', footstepVolume: 0.35, description: 'Footsteps are 65% quieter.' },
    backstab: { damage: 220, angle: 0.0 },
    hitbox: { width: 0.7, height: 1.82, head: 0.42 },
    model: 'spy', animSet: 'light', audioSet: 'spy',
    portrait: 'spy',
    palette: { skin: 0xd9a27c, primary: 0x2a2c33, secondary: 0x4b4f5a, accentLevel: 'low' },
    teamVariants: { red: 'spy_red', blue: 'spy_blue' },
    botWeight: 0.6,
    limit: 3,
  },
  marksman: {
    id: 'marksman',
    index: 2,
    displayName: 'Marksman',
    role: 'Long-Range Damage / Precision / Recon',
    shortRole: 'SHARPSHOOTER',
    description:
      'Owns every long sightline. Charge scoped shots for massive headshots and tag targets so your whole team can see them.',
    health: 110,
    speed: 1.0,
    jumpPower: 1.0,
    reloadSpeed: 1.0,
    difficulty: 3,
    difficultyLabel: 'Medium-High',
    weapons: ['longshot', 'compactsmg', 'utilityknife'],
    signature: 'longshot',
    ability: {
      id: 'focus', name: 'Focus Mode', key: 'E',
      cooldown: 18, duration: 6, chargeRateMult: 1.8,
      description: 'Steady breathing: zero spread, faster scope charge and no movement penalty for 6s.',
    },
    passive: { id: 'recon', name: 'Recon', revealTime: 4, description: 'Enemies you hit are revealed to your team for 4s.' },
    hitbox: { width: 0.74, height: 1.84, head: 0.42 },
    model: 'marksman', animSet: 'medium', audioSet: 'marksman',
    portrait: 'marksman',
    palette: { skin: 0xc98d68, primary: 0x6b5a3e, secondary: 0x8a7a55, accentLevel: 'mid' },
    teamVariants: { red: 'marksman_red', blue: 'marksman_blue' },
    botWeight: 0.8,
    limit: 3,
  },
  mechanic: {
    id: 'mechanic',
    index: 3,
    displayName: 'Mechanic',
    role: 'Engineering / Defense / Area Control',
    shortRole: 'ENGINEER',
    description:
      'Builds an automated turret to lock down chokepoints. Repair it with the wrench or construction beam to keep the line.',
    health: 125,
    speed: 0.95,
    jumpPower: 1.0,
    reloadSpeed: 1.0,
    difficulty: 2,
    difficultyLabel: 'Medium',
    weapons: ['rivetgun', 'constructor', 'wrench'],
    signature: 'rivetgun',
    ability: {
      id: 'turret', name: 'Automated Turret', key: 'E',
      cooldown: 16, duration: 0, maxActive: 1,
      description: 'Deploy a turret at your aim point. Limited ammo, health and range. Repair with your wrench.',
    },
    passive: { id: 'repair', name: 'Repair', description: 'Wrench hits and the Construction Beam repair and rearm allied deployables.' },
    hitbox: { width: 0.76, height: 1.82, head: 0.44 },
    model: 'mechanic', animSet: 'medium', audioSet: 'mechanic',
    portrait: 'mechanic',
    palette: { skin: 0xe0a882, primary: 0x7b6a3f, secondary: 0x3e4a3a, accentLevel: 'mid' },
    teamVariants: { red: 'mechanic_red', blue: 'mechanic_blue' },
    botWeight: 0.8,
    limit: 3,
  },
  doctor: {
    id: 'doctor',
    index: 4,
    displayName: 'Doctor',
    role: 'Healing / Support / Sustain',
    shortRole: 'MEDIC',
    description:
      'Keeps the push alive. Lock the Medical Beam onto allies, build Overcharge, then unleash it to make your partner nearly unstoppable.',
    health: 125,
    speed: 1.03,
    jumpPower: 1.0,
    reloadSpeed: 1.0,
    difficulty: 2,
    difficultyLabel: 'Medium',
    weapons: ['syringelauncher', 'medbeam', 'surgicalsaw'],
    signature: 'medbeam',
    ability: {
      id: 'overcharge', name: 'Overcharge', key: 'E',
      cooldown: 0, duration: 8, chargePerHp: 1 / 900, healMult: 2.5, damageReduction: 0.5,
      description: 'Built by healing. When full: 8s of 2.5x healing and 50% damage reduction for you and your patient.',
    },
    passive: { id: 'medicalassist', name: 'Medical Assist', description: 'Healing earns support score and counts toward your patient\'s eliminations as assists.' },
    hitbox: { width: 0.74, height: 1.84, head: 0.42 },
    model: 'doctor', animSet: 'medium', audioSet: 'doctor',
    portrait: 'doctor',
    palette: { skin: 0xf0c4a0, primary: 0xe8ecef, secondary: 0x6d8790, accentLevel: 'mid' },
    teamVariants: { red: 'doctor_red', blue: 'doctor_blue' },
    botWeight: 1.0,
    limit: 3,
  },
  juggernaut: {
    id: 'juggernaut',
    index: 5,
    displayName: 'Juggernaut',
    role: 'Heavy Assault / Frontline / Suppression',
    shortRole: 'HEAVY',
    description:
      'A walking fortress with 300 health and a six-barrel cannon. Slow, loud and devastating in any doorway he plants himself in.',
    health: 300,
    speed: 0.75,
    jumpPower: 0.92,
    reloadSpeed: 1.0,
    difficulty: 2,
    difficultyLabel: 'Medium',
    weapons: ['cyclone', 'breacher', 'foundryhammer'],
    signature: 'cyclone',
    ability: {
      id: 'suppression', name: 'Suppression Mode', key: 'E',
      cooldown: 20, duration: 6, damageReduction: 0.35, spreadMult: 0.45, moveMult: 0.55,
      description: 'Brace into a firing stance: -35% damage taken, tighter spread, reduced movement for 6s.',
    },
    passive: { id: 'frontline', name: 'Frontline Presence', allyRadius: 8, damageReduction: 0.1, description: '-10% damage taken while an ally is within 8m.' },
    hitbox: { width: 0.95, height: 2.0, head: 0.48 },
    model: 'juggernaut', animSet: 'heavy', audioSet: 'juggernaut',
    portrait: 'juggernaut',
    palette: { skin: 0xd09a74, primary: 0x5b5144, secondary: 0x3a3a3a, accentLevel: 'mid' },
    teamVariants: { red: 'juggernaut_red', blue: 'juggernaut_blue' },
    botWeight: 1.1,
    limit: 3,
  },
  incinerator: {
    id: 'incinerator',
    index: 6,
    displayName: 'Incinerator',
    role: 'Close-Range Control / Area Denial',
    shortRole: 'PYRO',
    description:
      'Turns corridors into no-go zones. The Thermal Projector melts anything close, and Thermal Burst blasts enemies and projectiles away.',
    health: 175,
    speed: 1.0,
    jumpPower: 1.0,
    reloadSpeed: 1.0,
    difficulty: 2,
    difficultyLabel: 'Medium',
    weapons: ['thermal', 'flarelauncher', 'furnaceaxe'],
    signature: 'thermal',
    ability: {
      id: 'thermalburst', name: 'Thermal Burst', key: 'E',
      cooldown: 12, duration: 0, radius: 5.5, damage: 25, knockback: 13, destroyProjectiles: true,
      description: 'Release a ring of superheated air: damages, ignites and knocks back nearby enemies, and destroys enemy projectiles.',
    },
    passive: { id: 'heatresistance', name: 'Heat Resistance', fireDamageMult: 0.5, description: 'Takes 50% less damage from fire and burning.' },
    hitbox: { width: 0.8, height: 1.86, head: 0.44 },
    model: 'incinerator', animSet: 'medium', audioSet: 'incinerator',
    portrait: 'incinerator',
    palette: { skin: 0x3a3a3a, primary: 0xc9a14a, secondary: 0x444444, accentLevel: 'mid' },
    teamVariants: { red: 'incinerator_red', blue: 'incinerator_blue' },
    botWeight: 1.0,
    limit: 3,
  },
  demolitionist: {
    id: 'demolitionist',
    index: 7,
    displayName: 'Demolitionist',
    role: 'Explosive Damage / Area Control',
    shortRole: 'DEMOLITION',
    description:
      'Explosives expert. Arc blast shells over cover, bounce charges around corners and wire a remote detonation charge for ambushes.',
    health: 150,
    speed: 0.95,
    jumpPower: 1.0,
    reloadSpeed: 1.0,
    difficulty: 3,
    difficultyLabel: 'Medium-High',
    weapons: ['blastcaster', 'chargelauncher', 'demohammer'],
    signature: 'blastcaster',
    ability: {
      id: 'detcharge', name: 'Detonation Charge', key: 'E',
      cooldown: 14, duration: 20, damage: 110, radius: 5,
      description: 'Throw a sticky charge. Press E again to detonate it remotely (auto-detonates after 20s).',
    },
    passive: { id: 'explosiveexpertise', name: 'Explosive Expertise', explosiveReloadMult: 1.2, selfDamageMult: 0.65, description: 'Explosive weapons reload 20% faster; self blast damage reduced 35%.' },
    hitbox: { width: 0.82, height: 1.86, head: 0.44 },
    model: 'demolitionist', animSet: 'medium', audioSet: 'demolitionist',
    portrait: 'demolitionist',
    palette: { skin: 0x8d5a3c, primary: 0x545c3c, secondary: 0x2f2f2f, accentLevel: 'mid' },
    teamVariants: { red: 'demolitionist_red', blue: 'demolitionist_blue' },
    botWeight: 1.0,
    limit: 3,
  },
};

// Live (possibly patched) class table.
export const CLASSES = structuredClone(BASE_CLASSES);

export function getClass(id) {
  return CLASSES[id] || CLASSES.scout;
}

// Deep-merge balance overrides, e.g. { juggernaut: { health: 280 } }.
export function applyBalanceOverrides(overrides) {
  for (const [id, patch] of Object.entries(overrides || {})) {
    if (!CLASSES[id]) continue;
    deepMerge(CLASSES[id], patch);
  }
}
export function resetBalance() {
  for (const id of CLASS_IDS) CLASSES[id] = structuredClone(BASE_CLASSES[id]);
}

function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
}

// Validation used by tests and by the server on boot.
export function validateClasses(weaponTable) {
  const errors = [];
  if (CLASS_IDS.length !== 8) errors.push('Exactly eight classes required');
  for (const id of CLASS_IDS) {
    const c = CLASSES[id];
    if (!c) { errors.push(`missing class ${id}`); continue; }
    for (const field of ['displayName', 'role', 'description', 'health', 'speed', 'jumpPower', 'weapons', 'ability', 'passive', 'model', 'animSet', 'audioSet', 'difficulty', 'portrait', 'teamVariants']) {
      if (c[field] === undefined) errors.push(`${id} missing ${field}`);
    }
    if (c.weapons.length !== 3) errors.push(`${id} must have primary, secondary, melee`);
    if (weaponTable) {
      c.weapons.forEach((w, i) => {
        const wd = weaponTable[w];
        if (!wd) errors.push(`${id} references unknown weapon ${w}`);
        else if (wd.slot !== i) errors.push(`${id} weapon ${w} is in wrong slot`);
      });
    }
    if (!(c.health > 0)) errors.push(`${id} invalid health`);
    if (!(c.speed > 0.3 && c.speed < 2)) errors.push(`${id} invalid speed`);
  }
  return errors;
}
