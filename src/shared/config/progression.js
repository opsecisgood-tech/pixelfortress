// Progression rules: XP awards, level curve, achievements and cosmetics.

export const XP = {
  kill: 50,
  assist: 25,
  healPer100: 20,
  capture: 150,
  flagReturn: 60,
  flagPickup: 20,
  defense: 30,
  matchComplete: 100,
  win: 150,
  damagePer500: 15,
  // anti-exploit caps per match
  caps: { kill: 40, assist: 40, healPer100: 40, capture: 10, flagReturn: 15, flagPickup: 15, defense: 30, damagePer500: 30 },
};

// XP required to go from level n to n+1. Gentle quadratic curve.
export function xpForLevel(level) {
  return Math.round(400 + 120 * (level - 1) + 18 * (level - 1) ** 2);
}
export function levelFromXp(totalXp) {
  let level = 1, rem = totalXp;
  while (rem >= xpForLevel(level) && level < 200) { rem -= xpForLevel(level); level++; }
  return { level, into: rem, need: xpForLevel(level) };
}

// Compute XP breakdown from authoritative match stats for one player.
export function computeMatchXp(stats, won, completed) {
  const lines = [];
  const add = (key, count, per, label) => {
    const capped = Math.min(count, XP.caps[key] ?? Infinity);
    if (capped > 0) lines.push({ label, count: capped, xp: capped * per });
  };
  add('kill', stats.kills || 0, XP.kill, 'Eliminations');
  add('assist', stats.assists || 0, XP.assist, 'Assists');
  add('healPer100', Math.floor((stats.healing || 0) / 100), XP.healPer100, 'Healing');
  add('capture', stats.captures || 0, XP.capture, 'Flag captures');
  add('flagReturn', stats.returns || 0, XP.flagReturn, 'Flag returns');
  add('flagPickup', stats.pickups || 0, XP.flagPickup, 'Flag steals');
  add('defense', stats.defenses || 0, XP.defense, 'Objective defense');
  add('damagePer500', Math.floor((stats.damage || 0) / 500), XP.damagePer500, 'Damage dealt');
  if (completed) lines.push({ label: 'Match completed', count: 1, xp: XP.matchComplete });
  if (won) lines.push({ label: 'Victory', count: 1, xp: XP.win });
  const total = lines.reduce((s, l) => s + l.xp, 0);
  return { lines, total };
}

export const ACHIEVEMENTS = [
  { id: 'firstblood', name: 'First Blood', desc: 'Get your first elimination.', stat: 'kills', goal: 1, icon: 'skull' },
  { id: 'centurion', name: 'Centurion', desc: 'Get 100 eliminations.', stat: 'kills', goal: 100, icon: 'skull' },
  { id: 'teamplayer', name: 'Team Player', desc: 'Earn 50 assists.', stat: 'assists', goal: 50, icon: 'hands' },
  { id: 'flagrunner', name: 'Flag Runner', desc: 'Capture 25 flags.', stat: 'captures', goal: 25, icon: 'flag' },
  { id: 'firstcap', name: 'Special Delivery', desc: 'Capture your first flag.', stat: 'captures', goal: 1, icon: 'flag' },
  { id: 'gatekeeper', name: 'Gatekeeper', desc: 'Return 20 flags.', stat: 'returns', goal: 20, icon: 'shield' },
  { id: 'fieldmedic', name: 'Field Medic', desc: 'Restore 10,000 teammate health.', stat: 'healing', goal: 10000, icon: 'cross' },
  { id: 'engineer', name: 'Engineer', desc: 'Deploy 25 turrets.', stat: 'turretsBuilt', goal: 25, icon: 'gear' },
  { id: 'sharpshooter', name: 'Sharpshooter', desc: 'Land 50 headshot eliminations.', stat: 'headshotKills', goal: 50, icon: 'scope' },
  { id: 'unstoppable', name: 'Unstoppable', desc: 'Get 5 eliminations without dying.', stat: 'bestStreak', goal: 5, icon: 'bolt' },
  { id: 'rampage', name: 'Rampage', desc: 'Get 10 eliminations without dying.', stat: 'bestStreak', goal: 10, icon: 'bolt' },
  { id: 'backstabber', name: 'Silent Partner', desc: 'Land 10 back attacks.', stat: 'backstabs', goal: 10, icon: 'knife' },
  { id: 'veteran', name: 'Veteran', desc: 'Complete 25 matches.', stat: 'matches', goal: 25, icon: 'medal' },
  { id: 'winner', name: 'Decorated', desc: 'Win 10 matches.', stat: 'wins', goal: 10, icon: 'trophy' },
  { id: 'allrounder', name: 'All-Rounder', desc: 'Get an elimination with all 8 classes.', stat: 'classesWithKill', goal: 8, icon: 'star' },
  { id: 'mvp', name: 'Most Valuable', desc: 'Earn 10 end-of-match awards.', stat: 'awards', goal: 10, icon: 'trophy' },
];

// Cosmetics are visual only. unlock: { level } or { achievement }.
export const COSMETICS = {
  hat: [
    { id: 'none', name: 'No Hat', unlock: { level: 1 } },
    { id: 'beanie', name: 'Pixel Beanie', unlock: { level: 2 } },
    { id: 'cone', name: 'Traffic Cone', unlock: { level: 4 } },
    { id: 'tophat', name: 'Boxy Top Hat', unlock: { level: 6 } },
    { id: 'headphones', name: 'Comms Headset', unlock: { level: 8 } },
    { id: 'horns', name: 'Viking Horns', unlock: { level: 12 } },
    { id: 'crown', name: 'Block Crown', unlock: { achievement: 'winner' } },
    { id: 'halo', name: 'Field Halo', unlock: { achievement: 'fieldmedic' } },
  ],
  mask: [
    { id: 'none', name: 'No Mask', unlock: { level: 1 } },
    { id: 'bandana', name: 'Bandana', unlock: { level: 3 } },
    { id: 'shades', name: 'Block Shades', unlock: { level: 5 } },
    { id: 'visor', name: 'Neon Visor', unlock: { level: 10 } },
  ],
  accessory: [
    { id: 'none', name: 'None', unlock: { level: 1 } },
    { id: 'scarf', name: 'Team Scarf', unlock: { level: 3 } },
    { id: 'medals', name: 'Medal Rack', unlock: { achievement: 'veteran' } },
    { id: 'antenna', name: 'Radio Antenna', unlock: { level: 9 } },
  ],
  weaponSkin: [
    { id: 'none', name: 'Factory', unlock: { level: 1 } },
    { id: 'camo', name: 'Desert Camo', unlock: { level: 2 } },
    { id: 'carbon', name: 'Carbon', unlock: { level: 5 } },
    { id: 'candy', name: 'Candy Stripe', unlock: { level: 7 } },
    { id: 'neon', name: 'Neon Grid', unlock: { level: 11 } },
    { id: 'gold', name: 'Gilded', unlock: { achievement: 'centurion' } },
  ],
  gloves: [
    { id: 'none', name: 'Standard', unlock: { level: 1 } },
    { id: 'black', name: 'Tactical Black', unlock: { level: 3 } },
    { id: 'team', name: 'Team Colors', unlock: { level: 6 } },
    { id: 'gold', name: 'Gold Knuckles', unlock: { achievement: 'rampage' } },
  ],
  victoryPose: [
    { id: 'flex', name: 'Flex', unlock: { level: 1 } },
    { id: 'salute', name: 'Salute', unlock: { level: 2 } },
    { id: 'cheer', name: 'Cheer', unlock: { level: 4 } },
    { id: 'dab', name: 'Point Skyward', unlock: { level: 8 } },
  ],
  elimEffect: [
    { id: 'pixels', name: 'Pixel Burst', unlock: { level: 1 } },
    { id: 'confetti', name: 'Confetti', unlock: { level: 3 } },
    { id: 'sparks', name: 'Sparks', unlock: { level: 6 } },
    { id: 'hearts', name: 'Hearts', unlock: { level: 10 } },
    { id: 'gold', name: 'Gold Rush', unlock: { achievement: 'unstoppable' } },
  ],
  banner: [
    { id: 'steel', name: 'Riveted Steel', unlock: { level: 1 } },
    { id: 'hazard', name: 'Hazard Stripe', unlock: { level: 2 } },
    { id: 'circuit', name: 'Circuit Board', unlock: { level: 5 } },
    { id: 'sunset', name: 'Desert Sunset', unlock: { level: 7 } },
    { id: 'frost', name: 'Frostfall', unlock: { level: 9 } },
    { id: 'neon', name: 'Neon Night', unlock: { level: 13 } },
  ],
};

export const COSMETIC_SLOTS = Object.keys(COSMETICS);

export function isCosmeticUnlocked(item, profile) {
  if (!item) return false;
  if (item.unlock.level) return (profile.level || 1) >= item.unlock.level;
  if (item.unlock.achievement) return (profile.achievements || []).includes(item.unlock.achievement);
  return false;
}

// Sanitize cosmetics sent by a client (visual only, but keep values in the known set).
export function sanitizeCosmetics(c) {
  const out = {};
  for (const slot of COSMETIC_SLOTS) {
    const v = c && typeof c[slot] === 'string' ? c[slot] : null;
    out[slot] = COSMETICS[slot].some((i) => i.id === v) ? v : COSMETICS[slot][0].id;
  }
  return out;
}
