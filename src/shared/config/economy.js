// Reward loop: crates for kills, daily/weekly contracts, first win of the day, level-up and achievement
// crates, collection milestones, duplicate scrap and crafting. Pure functions so they can be tested.
import { CLASS_IDS, getClass } from './classes.js';
import { crateForKills, CRATE_BY_ID } from './cosmetics.js';
import { mulberry32 } from '../math.js';

export const DAY_MS = 86400000;
export const dayIndex = (t = Date.now()) => Math.floor(t / DAY_MS);
export const weekIndex = (t = Date.now()) => Math.floor((dayIndex(t) + 3) / 7); // weeks start Monday (UTC)

// Contract templates. stat: match stat summed per match; once: true = must happen within a single match.
const DAILY = [
  { kind: 'kills', target: 15, desc: 'Get {n} eliminations' },
  { kind: 'classKills', target: 6, desc: 'Get {n} eliminations as {cls}' },
  { kind: 'assists', target: 8, desc: 'Earn {n} assists' },
  { kind: 'matches', target: 3, desc: 'Complete {n} matches' },
  { kind: 'wins', target: 2, desc: 'Win {n} matches' },
  { kind: 'damage', target: 4000, desc: 'Deal {n} damage' },
  { kind: 'headshotKills', target: 4, desc: 'Land {n} headshot eliminations' },
  { kind: 'captures', target: 1, desc: 'Capture {n} briefcase' },
  { kind: 'streak', target: 4, desc: 'Get {n} eliminations without dying', once: true },
  { kind: 'crates', target: 2, desc: 'Earn {n} kill crates' },
];
const WEEKLY = [
  { kind: 'kills', target: 100, desc: 'Get {n} eliminations' },
  { kind: 'classKills', target: 40, desc: 'Get {n} eliminations as {cls}' },
  { kind: 'wins', target: 10, desc: 'Win {n} matches' },
  { kind: 'damage', target: 30000, desc: 'Deal {n} damage' },
  { kind: 'assists', target: 50, desc: 'Earn {n} assists' },
  { kind: 'classesPlayed', target: 5, desc: 'Complete matches as {n} different classes' },
  { kind: 'crates', target: 8, desc: 'Earn {n} kill crates' },
  { kind: 'streak', target: 10, desc: 'Get {n} eliminations without dying', once: true },
];
const REWARDS = {
  daily: { crate: 'bronze', scrap: 6, xp: 250 },
  weekly: { crate: 'gold', scrap: 30, xp: 1200 },
};

// Deterministic set of 3 contracts for a given day/week number.
export function makeContracts(period, index) {
  const pool = period === 'weekly' ? WEEKLY : DAILY;
  const rnd = mulberry32((index + 1) * (period === 'weekly' ? 7919 : 104729));
  const picks = [];
  const idx = pool.map((_, i) => i);
  while (picks.length < 3 && idx.length) picks.push(pool[idx.splice(Math.floor(rnd() * idx.length), 1)[0]]);
  return picks.map((t, i) => {
    const cls = t.kind === 'classKills' ? CLASS_IDS[Math.floor(rnd() * CLASS_IDS.length)] : null;
    const reward = { ...REWARDS[period] };
    if (i > 0) reward.crate = period === 'daily' ? null : 'silver';
    return {
      id: `${period}:${index}:${i}`, kind: t.kind, cls, target: t.target, once: !!t.once, progress: 0, done: false,
      desc: t.desc.replace('{n}', t.target.toLocaleString('en-US')).replace('{cls}', cls ? getClass(cls).name : ''),
      reward,
    };
  });
}

// How much one finished match advances a contract.
export function contractGain(c, m, state) {
  switch (c.kind) {
    case 'kills': case 'assists': case 'headshotKills': case 'captures': return m.stats[c.kind] || 0;
    case 'damage': return Math.round(m.stats.damage || 0);
    case 'classKills': return (m.stats.classKills && m.stats.classKills[c.cls]) || (m.classId === c.cls && !m.stats.classKills ? m.stats.kills : 0);
    case 'matches': return 1;
    case 'wins': return m.won ? 1 : 0;
    case 'crates': return m.crate ? 1 : 0;
    case 'streak': return (m.stats.bestStreak || 0) >= c.target ? c.target : 0;
    case 'classesPlayed': {
      state.classes = state.classes || [];
      const before = state.classes.length;
      for (const cl of m.classes) if (!state.classes.includes(cl)) state.classes.push(cl);
      return state.classes.length - before;
    }
    default: return 0;
  }
}

// Advance a contract set with one match. Returns the contracts that completed this match.
export function advanceContracts(set, m) {
  const done = [];
  set.state = set.state || {};
  for (const c of set.list) {
    if (c.done) continue;
    c.progress = Math.min(c.target, c.progress + contractGain(c, m, set.state));
    if (c.progress >= c.target) { c.done = true; done.push(c); }
  }
  return done;
}

// Crate rewarded for reaching a level.
export function levelCrate(level) {
  if (level % 10 === 0) return 'gold';
  if (level % 5 === 0) return 'silver';
  return 'bronze';
}

// Unique-item collection milestones.
export const COLLECTION_MILESTONES = [
  { count: 25, crate: 'silver' }, { count: 50, crate: 'gold' }, { count: 100, crate: 'gold' },
  { count: 200, crate: 'diamond' }, { count: 400, crate: 'diamond' }, { count: 800, crate: 'diamond' },
];

// Next kill threshold for a better crate this match (for the HUD tracker).
export const CRATE_TIERS = [{ kills: 5, crate: 'bronze' }, { kills: 10, crate: 'silver' }, { kills: 15, crate: 'gold' }, { kills: 25, crate: 'diamond' }];
export function crateProgress(kills) {
  const cur = crateForKills(kills);
  const next = CRATE_TIERS.find((t) => t.kills > kills) || null;
  return { current: cur, next: next ? { ...next, name: CRATE_BY_ID[next.crate].name } : null };
}

export const SALVAGE_BONUS = 1; // scrap for salvaging = rarity scrap value × this
export { crateForKills };
