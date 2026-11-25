// Persistent player profile: level/XP, lifetime statistics, per-class stats, achievements, cosmetics.
import { levelFromXp, computeMatchXp, ACHIEVEMENTS, COSMETICS, COSMETIC_SLOTS, isCosmeticUnlocked } from '../../shared/config/progression.js';
import { CLASS_IDS } from '../../shared/config/classes.js';

const KEY = 'pf_profile_v1';

function blankStats() {
  const classStats = {};
  for (const c of CLASS_IDS) classStats[c] = { kills: 0, deaths: 0, assists: 0, matches: 0, damage: 0, healing: 0 };
  return {
    matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, assists: 0, captures: 0, returns: 0, pickups: 0, defenses: 0,
    healing: 0, damage: 0, headshotKills: 0, backstabs: 0, turretsBuilt: 0, turretKills: 0, bestStreak: 0, awards: 0,
    classesWithKill: 0, classStats,
  };
}

export class Profile {
  constructor() {
    this.data = null;
    this.load();
  }

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { d = null; }
    const blank = { name: '', xp: 0, stats: blankStats(), achievements: [], cosmetics: {}, selectedClass: 'scout', recent: [], created: Date.now() };
    this.data = d ? { ...blank, ...d, stats: { ...blankStats(), ...(d.stats || {}) } } : blank;
    for (const c of CLASS_IDS) if (!this.data.stats.classStats[c]) this.data.stats.classStats[c] = blankStats().classStats[c];
    for (const slot of COSMETIC_SLOTS) if (!this.data.cosmetics[slot]) this.data.cosmetics[slot] = COSMETICS[slot][0].id;
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  get level() { return levelFromXp(this.data.xp).level; }
  levelInfo() { return levelFromXp(this.data.xp); }
  get name() { return this.data.name; }
  set name(v) { this.data.name = v; this.save(); }

  favoriteClass() {
    let best = this.data.selectedClass, bv = -1;
    for (const [c, s] of Object.entries(this.data.stats.classStats)) { const v = s.matches * 3 + s.kills; if (v > bv) { bv = v; best = c; } }
    return best;
  }

  equip(slot, id) {
    const item = COSMETICS[slot]?.find((i) => i.id === id);
    if (!item || !isCosmeticUnlocked(item, { level: this.level, achievements: this.data.achievements })) return false;
    this.data.cosmetics[slot] = id;
    this.save();
    return true;
  }

  isUnlocked(slot, id) {
    const item = COSMETICS[slot]?.find((i) => i.id === id);
    return isCosmeticUnlocked(item, { level: this.level, achievements: this.data.achievements });
  }

  cosmetics() { return { ...this.data.cosmetics }; }

  achievementProgress(a) {
    const v = this.data.stats[a.stat] || 0;
    return { value: v, done: this.data.achievements.includes(a.id), pct: Math.min(1, v / a.goal) };
  }

  /**
   * Apply authoritative end-of-match results for this player.
   * Returns { xp: {lines,total}, levelBefore, levelAfter, newAchievements: [], awards: [] }
   */
  applyMatch(results, myId, playedClasses = []) {
    const me = results.players.find((p) => p.id === myId);
    if (!me) return null;
    const s = this.data.stats;
    const st = me.stats;
    const won = results.winner === me.team;
    const draw = results.winner === -1;
    const xp = computeMatchXp(st, won, true);
    const levelBefore = this.level;
    s.matches++;
    if (won) s.wins++; else if (draw) s.draws++; else s.losses++;
    for (const k of ['kills', 'deaths', 'assists', 'captures', 'returns', 'pickups', 'defenses', 'headshotKills', 'backstabs', 'turretsBuilt', 'turretKills']) s[k] += st[k] || 0;
    s.healing += Math.round(st.healing || 0);
    s.damage += Math.round(st.damage || 0);
    s.bestStreak = Math.max(s.bestStreak, st.bestStreak || 0);
    const cs = s.classStats[me.classId];
    if (cs) { cs.matches++; cs.kills += st.kills; cs.deaths += st.deaths; cs.assists += st.assists; cs.damage += Math.round(st.damage); cs.healing += Math.round(st.healing); }
    for (const c of playedClasses) if (c !== me.classId && s.classStats[c]) s.classStats[c].matches++;
    // classes with kills: tracked from per-class kills
    s.classesWithKill = Object.values(s.classStats).filter((c) => c.kills > 0).length;
    const myAwards = results.awards.filter((a) => a.playerId === myId);
    s.awards += myAwards.length;
    this.data.xp += xp.total;
    const newAchievements = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements.includes(a.id)) continue;
      if ((s[a.stat] || 0) >= a.goal) { this.data.achievements.push(a.id); newAchievements.push(a); }
    }
    this.data.recent.unshift({ t: Date.now(), map: results.mapId, mode: results.mode, cls: me.classId, won, draw, k: st.kills, d: st.deaths, a: st.assists, score: st.score, xp: xp.total });
    this.data.recent = this.data.recent.slice(0, 12);
    this.save();
    return { xp, levelBefore, levelAfter: this.level, newAchievements, awards: myAwards, won, draw };
  }
}
