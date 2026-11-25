// End-of-match award assignment. Each category goes to the leader in that metric, but a player who
// already holds an award yields to a different player who is within 80% of the leader — so awards
// reflect varied contributions instead of all going to the top fragger.

export const AWARD_CATEGORIES = [
  { id: 'eliminations', title: 'Most Eliminations', stat: (s) => s.kills, unit: 'eliminations' },
  { id: 'assists', title: 'Most Assists', stat: (s) => s.assists, unit: 'assists' },
  { id: 'damage', title: 'Most Damage', stat: (s) => s.damage, unit: 'damage' },
  { id: 'support', title: 'Best Support', stat: (s) => s.healing * 0.5 + s.assists * 40 + (s.turretKills || 0) * 60, unit: 'support pts' },
  { id: 'captures', title: 'Most Captures', stat: (s) => s.captures, unit: 'captures', mode: 'ctf' },
  { id: 'defender', title: 'Best Defender', stat: (s) => s.defenses * 3 + s.returns * 4 + (s.turretKills || 0), unit: 'defense pts' },
  { id: 'objective', title: 'Highest Objective Score', stat: (s) => s.captures * 5 + s.pickups + s.returns * 2 + s.defenses, unit: 'objective pts', mode: 'ctf' },
  { id: 'healing', title: 'Most Healing', stat: (s) => s.healing, unit: 'HP healed' },
];

export function assignAwards(players, mode) {
  const awards = [];
  const holders = new Map();
  for (const cat of AWARD_CATEGORIES) {
    if (cat.mode && cat.mode !== mode) continue;
    const ranked = players
      .map((p) => ({ p, v: Math.round(cat.stat(p.stats) || 0) }))
      .filter((e) => e.v > 0)
      .sort((a, b) => b.v - a.v);
    if (!ranked.length) continue;
    let pick = ranked[0];
    if (holders.get(pick.p.id)) {
      const alt = ranked.find((e) => !holders.get(e.p.id) && e.v >= ranked[0].v * 0.8);
      if (alt) pick = alt;
    }
    holders.set(pick.p.id, (holders.get(pick.p.id) || 0) + 1);
    awards.push({ id: cat.id, title: cat.title, playerId: pick.p.id, name: pick.p.name, team: pick.p.team, classId: pick.p.classId, value: pick.v, unit: cat.unit });
  }
  return awards;
}

// MVP ordering for the podium: weighted overall contribution.
export function mvpScore(s) {
  return s.score * 10 + s.kills * 2 + s.assists + s.healing / 100 + s.captures * 8 + s.defenses * 2;
}
