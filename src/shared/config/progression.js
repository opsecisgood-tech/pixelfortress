// Progression rules: XP awards, level curve and achievements.

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
  { id: 'allrounder', name: 'All-Rounder', desc: 'Get an elimination with all 9 classes.', stat: 'classesWithKill', goal: 9, icon: 'star' },
  { id: 'mvp', name: 'Most Valuable', desc: 'Earn 10 end-of-match awards.', stat: 'awards', goal: 10, icon: 'trophy' },
];

// Cosmetics live in ./cosmetics.js (item catalog and loadout validation).
