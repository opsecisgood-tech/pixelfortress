// SINGLE SOURCE OF TRUTH for weapon statistics.
// type: hitscan | projectile | melee | beam (healing) | flame | repair
// slot: 0 primary, 1 secondary, 2 melee
// Times are seconds, distances metres, damage in hit points.

const W = {};
const def = (id, o) => {
  W[id] = {
    id,
    pellets: 1,
    headshotMult: 1,
    critMult: 1.5,
    crit: {},
    auto: false,
    clip: -1,
    reserve: 0,
    ammoPerShot: 1,
    reloadTime: 1.5,
    reloadMode: 'mag',          // 'mag' | 'single'
    reloadStart: 0,
    reloadInterrupt: 'switch',  // 'switch' | 'fire' (single reloads can be interrupted by firing)
    spread: 0,
    spreadMove: 0,
    spreadAir: 0,
    range: 100,
    effectiveRange: 100,
    minFalloff: 1,
    deployTime: 0.35,
    holsterTime: 0.1,
    recoil: { pitch: 0.01, yaw: 0.004 },
    kick: 0.5,
    crosshair: 'cross',
    tracer: 0xfff2a8,
    botRange: 12,
    ...o,
  };
};

// ---------------- SCOUT ----------------
def('scattershot', {
  name: 'Scattergun', slot: 0, type: 'hitscan', category: 'Scattergun',
  description: 'Compact 10-pellet shotgun. Devastating up close, weak at distance.',
  damage: 6, pellets: 10, fireInterval: 0.625, clip: 6, reserve: 32,
  reloadMode: 'single', reloadStart: 0.25, reloadTime: 0.45, reloadInterrupt: 'fire',
  spread: 0.07, spreadMove: 0.01, spreadAir: 0.015,
  range: 40, effectiveRange: 5, minFalloff: 0.3,
  recoil: { pitch: 0.05, yaw: 0.012 }, kick: 1.2, crosshair: 'shotgun', botRange: 5,
  deployTime: 0.3,
});
def('sidekick', {
  name: 'Pistol', slot: 1, type: 'hitscan', category: 'Pistol',
  description: 'Light semi-automatic pistol for finishing fleeing targets.',
  damage: 15, fireInterval: 0.15, clip: 12, reserve: 36, reloadTime: 1.05,
  headshotMult: 1.25, spread: 0.012, spreadMove: 0.018, spreadAir: 0.03,
  range: 70, effectiveRange: 14, minFalloff: 0.5,
  recoil: { pitch: 0.018, yaw: 0.006 }, kick: 0.6, botRange: 14, deployTime: 0.25,
});
def('streetbat', {
  name: 'Bat', slot: 2, type: 'melee', category: 'Melee',
  description: 'A taped-up bat. Fast swings, solid knock.',
  damage: 35, fireInterval: 0.5, auto: true,
  melee: { range: 2.3, angle: 0.55, windup: 0.1 },
  crit: { fromBehind: true }, crosshair: 'melee', botRange: 2, deployTime: 0.25,
});

// ---------------- SPY ----------------
def('silencedpistol', {
  name: 'Silenced Pistol', slot: 0, type: 'hitscan', category: 'Pistol',
  description: 'Suppressed sidearm. Quiet shots, accurate at mid range.',
  damage: 18, fireInterval: 0.22, clip: 10, reserve: 40, reloadTime: 1.2,
  headshotMult: 1.35, spread: 0.009, spreadMove: 0.014, spreadAir: 0.03,
  range: 70, effectiveRange: 18, minFalloff: 0.5, silenced: true,
  recoil: { pitch: 0.014, yaw: 0.005 }, kick: 0.45, botRange: 14,
});
def('revolver', {
  name: 'Revolver', slot: 0, type: 'hitscan', category: 'Revolver',
  description: 'Six heavy rounds. First-shot accurate; punishes careless aim.',
  damage: 42, fireInterval: 0.55, clip: 6, reserve: 24, reloadTime: 1.35,
  headshotMult: 1.5, spread: 0.004, spreadMove: 0.02, spreadAir: 0.04,
  range: 90, effectiveRange: 24, minFalloff: 0.55,
  recoil: { pitch: 0.06, yaw: 0.012 }, kick: 1.3, botRange: 18,
});
// Admin-only (/admingun): hold fire for 3 seconds to charge, then a heat-seeking, piercing beam of light
// destroys every enemy it touches and burns round holes through whatever it passes. Never part of a class arsenal.
def('admingun', {
  name: 'The Admin Gun', slot: 0, type: 'hitscan', category: 'Admin',
  description: 'Charge for three seconds, then release a heat-seeking beam that pierces everything, destroys every enemy it touches and burns holes through walls.',
  damage: 1000, fireInterval: 0.9, clip: -1, chargeShot: 3, adminBeam: true, holeRadius: 0.8, holesPerShot: 24,
  range: 160, effectiveRange: 160, minFalloff: 1,
  seek: { cone: 0.55, range: 90, turn: 0.07, step: 0.5 },
  recoil: { pitch: 0.12, yaw: 0.02 }, kick: 2.2, tracer: 0xfff0a0, botRange: 40, adminOnly: true,
});
def('shadowblade', {
  name: 'Knife', slot: 2, type: 'melee', category: 'Melee',
  description: 'Balanced blade. Strikes to the back are lethal to most classes.',
  damage: 40, fireInterval: 0.8, auto: true,
  melee: { range: 2.1, angle: 0.5, windup: 0.08, backstab: true },
  crosshair: 'melee', botRange: 2, deployTime: 0.25,
});

// ---------------- MARKSMAN ----------------
def('longshot', {
  name: 'Sniper Rifle', slot: 0, type: 'hitscan', category: 'Sniper Rifle',
  description: 'Bolt-action precision rifle. Scope (RMB) to charge damage; scoped headshots double damage.',
  damage: 50, fireInterval: 1.4, clip: 5, reserve: 25, reloadTime: 2.0,
  headshotMult: 2.0, headshotRequiresScope: true,
  spread: 0.035, spreadMove: 0.03, spreadAir: 0.06,
  range: 220, effectiveRange: 220, minFalloff: 1,
  scope: { fov: 24, chargeTime: 2.2, chargeMax: 150, moveMult: 0.45, delay: 0.15 },
  recoil: { pitch: 0.08, yaw: 0.01 }, kick: 1.8, crosshair: 'scope', tracer: 0xc8f0ff, botRange: 40,
  deployTime: 0.45,
});
def('compactsmg', {
  name: 'SMG', slot: 1, type: 'hitscan', category: 'SMG',
  description: 'Bullet hose for when someone gets too close.',
  damage: 8, fireInterval: 0.09, auto: true, clip: 25, reserve: 75, reloadTime: 1.25,
  headshotMult: 1.2, spread: 0.028, spreadMove: 0.012, spreadAir: 0.03,
  range: 55, effectiveRange: 12, minFalloff: 0.4,
  recoil: { pitch: 0.008, yaw: 0.006 }, kick: 0.35, botRange: 10,
});

// ---------------- MECHANIC ----------------
def('rivetgun', {
  name: 'Rivet Gun', slot: 0, type: 'projectile', category: 'Nailgun',
  description: 'Pneumatic rivet driver. Fast hot rivets with a slight drop.',
  damage: 12, fireInterval: 0.12, auto: true, clip: 30, reserve: 120, reloadTime: 1.5,
  spread: 0.02, spreadMove: 0.01, spreadAir: 0.02,
  projectile: { kind: 'rivet', speed: 62, gravity: 3, radius: 0.08, lifetime: 1.4 },
  recoil: { pitch: 0.008, yaw: 0.005 }, kick: 0.4, botRange: 14,
});
def('constructor', {
  name: 'Construction Device', slot: 1, type: 'repair', category: 'Tool',
  description: 'Short-range arc beam. Repairs & rearms allied turrets and zaps enemies.',
  damage: 4, fireInterval: 0.1, auto: true, clip: 80, reserve: 160, reloadTime: 1.3,
  repair: { range: 7, hpPerTick: 6, ammoPerTick: 4 },
  range: 7, effectiveRange: 7, crosshair: 'beam', tracer: 0x8ef6ff, botRange: 5,
});
def('wrench', {
  name: 'Wrench', slot: 2, type: 'melee', category: 'Melee',
  description: 'Heavy wrench. Each hit on an allied turret repairs 40 HP and adds 40 rounds.',
  damage: 32, fireInterval: 0.65, auto: true,
  melee: { range: 2.2, angle: 0.55, windup: 0.12, repair: { hp: 40, ammo: 40 } },
  crit: { fromBehind: true }, crosshair: 'melee', botRange: 2,
});

// ---------------- DOCTOR ----------------
def('syringelauncher', {
  name: 'Syringe Gun', slot: 0, type: 'projectile', category: 'Syringe Gun',
  description: 'Lobs a stream of medical darts. Leads targets at range.',
  damage: 10, fireInterval: 0.105, auto: true, clip: 40, reserve: 150, reloadTime: 1.5,
  spread: 0.015,
  projectile: { kind: 'syringe', speed: 34, gravity: 9, radius: 0.08, lifetime: 2 },
  recoil: { pitch: 0.006, yaw: 0.004 }, kick: 0.35, botRange: 12,
});
def('medbeam', {
  name: 'Healing Gun', slot: 1, type: 'beam', category: 'Healing Beam',
  description: 'Hold to lock onto an ally and heal them, overhealing up to 150%. Builds Overcharge.',
  damage: 0, fireInterval: 0.1, auto: true, clip: -1,
  beam: { range: 15, breakRange: 19, healRate: 27, overhealMax: 1.5, overhealRate: 0.4, lockAngle: 0.35 },
  crosshair: 'beam', tracer: 0x7fffb0, botRange: 6, deployTime: 0.3,
});
def('surgicalsaw', {
  name: 'Bonesaw', slot: 2, type: 'melee', category: 'Melee',
  description: 'Bone saw. Each hit on an enemy adds 10% Overcharge.',
  damage: 40, fireInterval: 0.8, auto: true,
  melee: { range: 2.1, angle: 0.5, windup: 0.12, overchargeOnHit: 0.1 },
  crit: { fromBehind: true }, crosshair: 'melee', botRange: 2,
});

// ---------------- JUGGERNAUT ----------------
def('cyclone', {
  name: 'Minigun', slot: 0, type: 'hitscan', category: 'Minigun',
  description: 'Six barrels of sustained fire. Spin up with RMB or fire; slows you while spinning.',
  damage: 9, fireInterval: 0.085, auto: true, clip: 200, reserve: 200, reloadTime: 3.0,
  spread: 0.045, spreadMove: 0.015, spreadAir: 0.03,
  range: 65, effectiveRange: 12, minFalloff: 0.35,
  spinUp: 0.8, spinMoveMult: 0.5,
  recoil: { pitch: 0.004, yaw: 0.006 }, kick: 0.3, botRange: 12, deployTime: 0.6,
});
def('breacher', {
  name: 'Shotgun', slot: 1, type: 'hitscan', category: 'Shotgun',
  description: 'Standard pump shotgun. Reliable at close to mid range.',
  damage: 7, pellets: 8, fireInterval: 0.7, clip: 6, reserve: 32,
  reloadMode: 'single', reloadStart: 0.3, reloadTime: 0.5, reloadInterrupt: 'fire',
  spread: 0.07, spreadMove: 0.01, spreadAir: 0.015,
  range: 40, effectiveRange: 6, minFalloff: 0.3,
  recoil: { pitch: 0.05, yaw: 0.012 }, kick: 1.2, crosshair: 'shotgun', botRange: 6,
});
def('foundryhammer', {
  name: 'Foundry Hammer', slot: 2, type: 'melee', category: 'Melee',
  description: 'Forge sledge. Slow wind-up, crushing impact.',
  damage: 65, fireInterval: 1.0, auto: true,
  melee: { range: 2.5, angle: 0.6, windup: 0.28 },
  crit: { fromBehind: true }, crosshair: 'melee', botRange: 2, deployTime: 0.45,
});

// ---------------- INCINERATOR ----------------
def('thermal', {
  name: 'Flamethrower', slot: 0, type: 'flame', category: 'Flamethrower',
  description: 'Short-range jet of thermal plasma. Ignites targets for lingering burn damage.',
  damage: 7, fireInterval: 0.08, auto: true, clip: 200, reserve: 200, reloadTime: 2.2,
  flame: { range: 7.5, angle: 0.36, afterburnDps: 6, afterburnTime: 4, farMult: 0.5 },
  range: 7.5, effectiveRange: 4, crosshair: 'flame', tracer: 0xff8a2a, botRange: 5,
});
def('flarelauncher', {
  name: 'Flare Launcher', slot: 1, type: 'projectile', category: 'Flare Gun',
  description: 'Single-shot flare. Ignites on hit; critical vs burning targets.',
  damage: 30, fireInterval: 0.4, clip: 1, reserve: 16, reloadTime: 1.6,
  crit: { vsBurning: true }, critMult: 2,
  projectile: { kind: 'flare', speed: 40, gravity: 6, radius: 0.12, lifetime: 3, ignite: true },
  recoil: { pitch: 0.05, yaw: 0.01 }, kick: 1.0, botRange: 18,
});
def('furnaceaxe', {
  name: 'Fire Axe', slot: 2, type: 'melee', category: 'Melee',
  description: 'Fire axe. Critical damage on burning targets.',
  damage: 50, fireInterval: 0.8, auto: true,
  melee: { range: 2.3, angle: 0.55, windup: 0.15 },
  crit: { vsBurning: true, fromBehind: true }, critMult: 1.6, crosshair: 'melee', botRange: 2,
});

// ---------------- DEMOLITIONIST ----------------
def('blastcaster', {
  name: 'Rocket Launcher', slot: 0, type: 'projectile', category: 'Rocket Launcher',
  description: 'Straight-flying blast shells. Splash damage; direct hits are critical. Rocket-jump capable.',
  damage: 90, fireInterval: 0.8, clip: 4, reserve: 20,
  reloadMode: 'single', reloadStart: 0.35, reloadTime: 0.8, reloadInterrupt: 'fire',
  crit: { directHit: true }, critMult: 1.2, explosive: true,
  projectile: { kind: 'shell', speed: 27, gravity: 0, radius: 0.18, lifetime: 5,
    explode: { radius: 3.6, minMult: 0.35, knockback: 9, selfKnockback: 13, selfMult: 0.5 } },
  recoil: { pitch: 0.06, yaw: 0.01 }, kick: 1.5, crosshair: 'circle', botRange: 14,
});
def('chargelauncher', {
  name: 'Grenade Launcher', slot: 0, type: 'projectile', category: 'Grenade Launcher',
  description: 'Bouncing charges that burst on enemy contact or after a 2s fuse.',
  damage: 80, fireInterval: 0.6, clip: 4, reserve: 16,
  reloadMode: 'single', reloadStart: 0.35, reloadTime: 0.6, reloadInterrupt: 'fire',
  crit: { directHit: true }, critMult: 1.2, explosive: true,
  projectile: { kind: 'charge', speed: 23, gravity: 17, radius: 0.15, lifetime: 2.0, bounce: 0.45, fuseExplode: true,
    explode: { radius: 3.3, minMult: 0.35, knockback: 8, selfKnockback: 11, selfMult: 0.5 } },
  recoil: { pitch: 0.04, yaw: 0.01 }, kick: 1.0, crosshair: 'circle', botRange: 12,
});
def('demohammer', {
  name: 'Demolition Hammer', slot: 2, type: 'melee', category: 'Melee',
  description: 'Long-handled sledge for breaking walls and skulls.',
  damage: 60, fireInterval: 0.9, auto: true,
  melee: { range: 2.4, angle: 0.55, windup: 0.22 },
  crit: { fromBehind: true }, crosshair: 'melee', botRange: 2, deployTime: 0.4,
});

// Ability "pseudo-weapons" used for kill feed / damage attribution.
// ============================================================================
// ALTERNATE WEAPONS — original designs, one per slot per class. Each trades
// something away against the default so loadouts are sidegrades, not upgrades.
// ============================================================================
const SHOTGUN = { reloadMode: 'single', reloadStart: 0.3, reloadTime: 0.5, reloadInterrupt: 'fire', spread: 0.07, spreadMove: 0.01, spreadAir: 0.015, range: 40, effectiveRange: 6, minFalloff: 0.3, recoil: { pitch: 0.05, yaw: 0.012 }, kick: 1.2, crosshair: 'shotgun', botRange: 6 };

// ---------------- SCOUT ----------------
def('kickback', {
  name: 'Kickback Coach Gun', slot: 0, type: 'hitscan', category: 'Coach Gun',
  description: 'Twin-barrel scattergun. Two fast shells that shove targets away; reloads both at once.',
  damage: 5.5, pellets: 12, fireInterval: 0.32, clip: 2, reserve: 32, reloadTime: 1.35,
  spread: 0.085, spreadMove: 0.01, spreadAir: 0.015, range: 40, effectiveRange: 4.5, minFalloff: 0.3,
  knockback: 7, recoil: { pitch: 0.07, yaw: 0.015 }, kick: 1.5, crosshair: 'shotgun', botRange: 5, deployTime: 0.3,
});
def('peashooter', {
  name: 'Pocket Peashooter', slot: 1, type: 'hitscan', category: 'Pocket Pistol',
  description: 'Tiny pistol with a fast trigger and deep magazine. Less punch per shot.',
  damage: 10, fireInterval: 0.11, clip: 9, reserve: 45, reloadTime: 1.0,
  headshotMult: 1.25, spread: 0.014, spreadMove: 0.02, spreadAir: 0.03, range: 60, effectiveRange: 12, minFalloff: 0.5,
  recoil: { pitch: 0.012, yaw: 0.005 }, kick: 0.45, botRange: 12, deployTime: 0.2,
});
def('slugger', {
  name: 'Ironwood Slugger', slot: 2, type: 'melee', category: 'Melee',
  description: 'Iron-banded club. Heavier hits, slower swings.',
  damage: 46, fireInterval: 0.75, auto: true,
  melee: { range: 2.3, angle: 0.55, windup: 0.14 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2,
});

// ---------------- SPY ----------------
def('derringer', {
  name: 'Twin Derringer', slot: 1, type: 'hitscan', category: 'Derringer',
  description: 'Two heavy rounds for point-blank surprises. Long reload.',
  damage: 38, fireInterval: 0.35, clip: 2, reserve: 18, reloadTime: 1.5,
  headshotMult: 1.3, spread: 0.02, spreadMove: 0.02, spreadAir: 0.04, range: 50, effectiveRange: 6, minFalloff: 0.4,
  recoil: { pitch: 0.05, yaw: 0.01 }, kick: 1.0, botRange: 6, deployTime: 0.25,
});
def('longsix', {
  name: "Gentleman's Long Six", slot: 0, type: 'hitscan', category: 'Revolver',
  description: 'Long-barrel revolver. Slow but pinpoint; headshots double damage.',
  damage: 34, fireInterval: 0.75, clip: 6, reserve: 24, reloadTime: 1.2,
  headshotMult: 2, spread: 0.004, spreadMove: 0.02, spreadAir: 0.04, range: 120, effectiveRange: 28, minFalloff: 0.55,
  recoil: { pitch: 0.06, yaw: 0.008 }, kick: 1.1, botRange: 20,
});
def('stiletto', {
  name: 'Parlour Stiletto', slot: 2, type: 'melee', category: 'Melee',
  description: 'Needle-thin blade. Quicker strikes, shorter reach. Back strikes still lethal.',
  damage: 32, fireInterval: 0.55, auto: true,
  melee: { range: 1.85, angle: 0.45, windup: 0.05, backstab: true }, crosshair: 'melee', botRange: 2, deployTime: 0.2,
});

// ---------------- MARKSMAN ----------------
def('longbow', {
  name: 'Recurve Longbow', slot: 0, type: 'projectile', category: 'Bow',
  description: 'Silent arrows with an arc. No scope needed; lead your targets.',
  damage: 70, fireInterval: 0.9, clip: 1, reserve: 14, reloadTime: 1.0,
  projectile: { kind: 'arrow', speed: 58, gravity: 7, radius: 0.08, lifetime: 3 },
  recoil: { pitch: 0.03, yaw: 0.005 }, kick: 0.6, botRange: 24, deployTime: 0.4,
});
def('scrubcarbine', {
  name: 'Scrub Carbine', slot: 1, type: 'hitscan', category: 'Carbine',
  description: 'Heavier bullets than the SMG, slower cycle, smaller magazine.',
  damage: 12, fireInterval: 0.14, auto: true, clip: 18, reserve: 54, reloadTime: 1.4,
  headshotMult: 1.2, spread: 0.018, spreadMove: 0.012, spreadAir: 0.03, range: 60, effectiveRange: 16, minFalloff: 0.45,
  recoil: { pitch: 0.012, yaw: 0.007 }, kick: 0.45, botRange: 14,
});
def('machete', {
  name: 'Bush Machete', slot: 2, type: 'melee', category: 'Melee',
  description: 'Broad jungle blade. Big hits, slow recovery.',
  damage: 56, fireInterval: 0.95, auto: true,
  melee: { range: 2.3, angle: 0.55, windup: 0.16 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2, deployTime: 0.35,
});

// ---------------- MECHANIC ----------------
def('pumpgun', {
  name: 'Shotgun', slot: 0, type: 'hitscan', category: 'Shotgun',
  description: 'Standard pump shotgun. Reliable at close to mid range.',
  damage: 7, pellets: 8, fireInterval: 0.65, clip: 6, reserve: 32, ...SHOTGUN,
});
def('pipewrench', {
  name: 'Pipe Wrench', slot: 2, type: 'melee', category: 'Melee',
  description: 'Long-handled wrench. Hits harder, repairs turrets a little less per swing.',
  damage: 42, fireInterval: 0.8, auto: true,
  melee: { range: 2.4, angle: 0.55, windup: 0.15, repair: { hp: 30, ammo: 30 } }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2,
});

// ---------------- DOCTOR ----------------
def('crossbow', {
  name: 'Field Crossbow', slot: 0, type: 'projectile', category: 'Crossbow',
  description: 'Single heavy bolt per load. Rewards accuracy over volume.',
  damage: 58, fireInterval: 0.3, clip: 1, reserve: 30, reloadTime: 1.5,
  projectile: { kind: 'bolt', speed: 72, gravity: 4, radius: 0.08, lifetime: 2.5 },
  recoil: { pitch: 0.03, yaw: 0.005 }, kick: 0.7, botRange: 22,
});
def('rapidmender', {
  name: 'Rapid Mender', slot: 1, type: 'beam', category: 'Healing Beam',
  description: 'Faster healing with a shorter reach and less overheal. Builds Overcharge.',
  damage: 0, fireInterval: 0.1, auto: true, clip: -1,
  beam: { range: 12, breakRange: 16, healRate: 38, overhealMax: 1.25, overhealRate: 0.35, lockAngle: 0.35 },
  crosshair: 'beam', tracer: 0xffd27f, botRange: 6, deployTime: 0.3,
});
def('wardcleaver', {
  name: 'Ward Cleaver', slot: 2, type: 'melee', category: 'Melee',
  description: 'Heavy cleaver. More damage, less Overcharge per hit.',
  damage: 52, fireInterval: 0.95, auto: true,
  melee: { range: 2.1, angle: 0.5, windup: 0.16, overchargeOnHit: 0.05 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2,
});

// ---------------- JUGGERNAUT ----------------
def('brassthunder', {
  name: 'Brass Thunder', slot: 0, type: 'hitscan', category: 'Rotary Cannon',
  description: 'Heavier rotary cannon. More damage per round; slower to spin and to move with.',
  damage: 10.5, fireInterval: 0.085, auto: true, clip: 200, reserve: 200, reloadTime: 3.2,
  spread: 0.04, spreadMove: 0.015, spreadAir: 0.03, range: 65, effectiveRange: 12, minFalloff: 0.35,
  spinUp: 1.1, spinMoveMult: 0.4,
  recoil: { pitch: 0.004, yaw: 0.006 }, kick: 0.3, botRange: 12, deployTime: 0.65,
});
def('slugthrower', {
  name: 'Slugthrower', slot: 1, type: 'hitscan', category: 'Slug Shotgun',
  description: 'Fires three heavy slugs in a tight group. Better at mid range.',
  damage: 20, pellets: 3, fireInterval: 0.75, clip: 4, reserve: 28, ...SHOTGUN,
  spread: 0.025, effectiveRange: 11, minFalloff: 0.45, botRange: 10,
});

// ---------------- INCINERATOR ----------------
def('backdraft', {
  name: 'Backdraft Projector', slot: 0, type: 'flame', category: 'Flamethrower',
  description: 'Narrower jet. Critical damage to targets facing away.',
  damage: 6, fireInterval: 0.08, auto: true, clip: 200, reserve: 200, reloadTime: 2.2,
  flame: { range: 7, angle: 0.3, afterburnDps: 6, afterburnTime: 4, farMult: 0.5 },
  crit: { fromBehind: true }, critMult: 1.8,
  range: 7, effectiveRange: 4, crosshair: 'flame', tracer: 0xff6a2a, botRange: 5,
});
def('hydranthook', {
  name: 'Hydrant Hook', slot: 2, type: 'melee', category: 'Melee',
  description: 'Fire hook. Doubles damage on burning targets, weaker otherwise.',
  damage: 38, fireInterval: 0.75, auto: true,
  melee: { range: 2.4, angle: 0.55, windup: 0.14 }, crit: { vsBurning: true }, critMult: 2, crosshair: 'melee', botRange: 2,
});

// ---------------- DEMOLITIONIST ----------------
def('pinpoint', {
  name: 'Pinpoint Launcher', slot: 0, type: 'projectile', category: 'Shell Launcher',
  description: 'Faster, harder-hitting shells with a much smaller blast.',
  damage: 105, fireInterval: 0.8, clip: 4, reserve: 20,
  reloadMode: 'single', reloadStart: 0.35, reloadTime: 0.8, reloadInterrupt: 'fire',
  crit: { directHit: true }, critMult: 1.2, explosive: true,
  projectile: { kind: 'shell', speed: 42, gravity: 0, radius: 0.16, lifetime: 4,
    explode: { radius: 2.3, minMult: 0.4, knockback: 8, selfKnockback: 12, selfMult: 0.5 } },
  recoil: { pitch: 0.06, yaw: 0.01 }, kick: 1.5, crosshair: 'circle', botRange: 16,
});
def('trenchmortar', {
  name: 'Trench Mortar', slot: 0, type: 'projectile', category: 'Mortar',
  description: 'Slow lobbed bombs with a big blast and a longer fuse.',
  damage: 92, fireInterval: 0.85, clip: 3, reserve: 15,
  reloadMode: 'single', reloadStart: 0.35, reloadTime: 0.75, reloadInterrupt: 'fire',
  crit: { directHit: true }, critMult: 1.2, explosive: true,
  projectile: { kind: 'charge', speed: 19, gravity: 16, radius: 0.17, lifetime: 2.6, bounce: 0.3, fuseExplode: true,
    explode: { radius: 4.1, minMult: 0.3, knockback: 9, selfKnockback: 12, selfMult: 0.5 } },
  recoil: { pitch: 0.05, yaw: 0.01 }, kick: 1.2, crosshair: 'circle', botRange: 14,
});
def('claymore', {
  name: 'Highland Claymore', slot: 2, type: 'melee', category: 'Melee',
  description: 'Two-handed sword. The longest reach of any melee weapon.',
  damage: 62, fireInterval: 0.85, auto: true,
  melee: { range: 3.0, angle: 0.5, windup: 0.2 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 3, deployTime: 0.45,
});

// ============================================================================
// STOCK ADDITIONS
// ============================================================================
def('shovel', {
  name: 'Shovel', slot: 2, type: 'melee', category: 'Melee',
  description: 'Entrenching shovel. A solid all-round swing.',
  damage: 55, fireInterval: 0.8, auto: true,
  melee: { range: 2.2, angle: 0.55, windup: 0.14 }, crit: { fromBehind: true, blastJump: true }, crosshair: 'melee', botRange: 2,
  critNote: 'Hits while rocket-jumping (or just after landing) are critical and eliminate instantly.',
});
// Rocket-jump trainer: harmless to everyone else, launches the user high and fast.
def('skyhopper', {
  name: 'Sky Hopper', slot: 0, type: 'projectile', category: 'Jump Launcher',
  description: 'Training launcher. Fire at your feet to launch high and fast with more airtime and air speed. Deals no damage and pushes nobody but you. Pair with the Shovel: a hit while airborne is a critical elimination.',
  damage: 0, fireInterval: 0.8, clip: 4, reserve: 60,
  reloadMode: 'single', reloadStart: 0.35, reloadTime: 0.8, reloadInterrupt: 'fire',
  explosive: true, botAvoid: true,
  projectile: { kind: 'hopshell', speed: 27, gravity: 0, radius: 0.18, lifetime: 5, passPlayers: true,
    explode: { radius: 3.4, minMult: 0.35, knockback: 0, selfKnockback: 14, selfMult: 0, noEnemy: true, hopper: true } },
  recoil: { pitch: 0.05, yaw: 0.01 }, kick: 1.3, crosshair: 'circle', botRange: 14,
});
def('stickylauncher', {
  name: 'Sticky Launcher', slot: 1, type: 'projectile', category: 'Sticky Launcher',
  description: 'Lays sticky bombs that cling to surfaces. Right-click detonates every armed bomb (up to 8 out at once).',
  damage: 95, fireInterval: 0.6, clip: 8, reserve: 24, reloadTime: 0.67,
  reloadMode: 'single', reloadStart: 0.4, reloadInterrupt: 'fire',
  explosive: true,
  projectile: { kind: 'sticky', speed: 24, gravity: 14, radius: 0.14, lifetime: 90, stick: true, noAutoExplode: true, armTime: 0.7,
    explode: { radius: 3.4, minMult: 0.4, knockback: 9, selfKnockback: 12, selfMult: 0.5 } },
  recoil: { pitch: 0.04, yaw: 0.01 }, kick: 1.0, crosshair: 'circle', botRange: 12,
});
def('bottle', {
  name: 'Bottle', slot: 2, type: 'melee', category: 'Melee',
  description: 'A sturdy glass bottle.',
  damage: 55, fireInterval: 0.8, auto: true,
  melee: { range: 2.0, angle: 0.55, windup: 0.13 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2,
});
def('fists', {
  name: 'Fists', slot: 2, type: 'melee', category: 'Fists',
  description: 'Bare-knuckle punches with both hands.',
  damage: 55, fireInterval: 0.8, auto: true,
  melee: { range: 1.9, angle: 0.6, windup: 0.12 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2, deployTime: 0.3,
});
def('kukri', {
  name: 'Kukri', slot: 2, type: 'melee', category: 'Melee',
  description: 'Curved forward-weighted blade.',
  damage: 50, fireInterval: 0.8, auto: true,
  melee: { range: 2.1, angle: 0.5, windup: 0.11 }, crit: { fromBehind: true }, crosshair: 'melee', botRange: 2, deployTime: 0.3,
});
def('sapper', {
  name: 'Sapper', slot: 1, type: 'repair', category: 'Sapper',
  description: 'Hold on an enemy turret to short it out: it stops firing and takes heavy damage. Harmless to players.',
  damage: 9, fireInterval: 0.1, auto: true, clip: -1,
  repair: { range: 2.6, hpPerTick: 0, ammoPerTick: 0 }, sapper: true,
  range: 2.6, effectiveRange: 2.6, crosshair: 'beam', tracer: 0x9adfff, botRange: 2, deployTime: 0.3,
});

export const ABILITY_SOURCES = {
  turret: { id: 'turret', name: 'Automated Turret', damage: 8, range: 22, fireInterval: 0.16, maxHp: 160, maxAmmo: 150, turnRate: 3.2, spread: 0.035, buildTime: 1.2 },
  detcharge: { id: 'detcharge', name: 'Detonation Charge' },
  clusterbomb: { id: 'clusterbomb', name: 'Cluster Bomb' },
  groundslam: { id: 'groundslam', name: 'Ground Slam' },
  thermalburst: { id: 'thermalburst', name: 'Thermal Burst' },
  afterburn: { id: 'afterburn', name: 'Afterburn' },
  fall: { id: 'fall', name: 'Fall' },
  world: { id: 'world', name: 'Environment' },
  spawnshield: { id: 'spawnshield', name: 'Spawn Shield' },
};

export const WEAPONS = W;
export const WEAPON_IDS = Object.keys(W);

export function getWeapon(id) {
  return W[id];
}

export function applyWeaponOverrides(overrides) {
  for (const [id, patch] of Object.entries(overrides || {})) {
    if (W[id]) Object.assign(W[id], patch);
  }
}

export function validateWeapons() {
  const errors = [];
  const types = ['hitscan', 'projectile', 'melee', 'beam', 'flame', 'repair'];
  for (const w of Object.values(W)) {
    if (!types.includes(w.type)) errors.push(`${w.id} bad type`);
    if (!(w.fireInterval > 0)) errors.push(`${w.id} bad fireInterval`);
    if (w.type === 'projectile' && !w.projectile) errors.push(`${w.id} missing projectile`);
    if (w.type === 'melee' && !w.melee) errors.push(`${w.id} missing melee`);
    if (w.type === 'beam' && !w.beam) errors.push(`${w.id} missing beam`);
    if (w.type === 'flame' && !w.flame) errors.push(`${w.id} missing flame`);
    if (w.slot === 2 && w.type !== 'melee') errors.push(`${w.id} slot 2 must be melee`);
  }
  return errors;
}
