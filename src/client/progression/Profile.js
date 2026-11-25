// Persistent player profile: level/XP, lifetime statistics, per-class stats, achievements, and the
// cosmetic economy — inventory, per-class loadouts, unopened crates, scrap, contracts and milestones.
import { levelFromXp, computeMatchXp, ACHIEVEMENTS } from '../../shared/config/progression.js';
import { CLASS_IDS } from '../../shared/config/classes.js';
import {
  SLOTS, STARTER_ITEMS, LEGACY_MAP, RARITIES, CRATE_BY_ID, ITEMS, getItem, canWear, rollCrate,
} from '../../shared/config/cosmetics.js';
import {
  makeContracts, advanceContracts, dayIndex, weekIndex, levelCrate, COLLECTION_MILESTONES, crateForKills, SALVAGE_BONUS,
} from '../../shared/config/economy.js';

const KEY = 'pf_profile_v1';

// Old (pre-catalog) unlock rules, used once to migrate existing profiles.
const LEGACY_UNLOCKS = {
  hat: { beanie: 2, cone: 4, tophat: 6, headphones: 8, horns: 12, crown: 'winner', halo: 'fieldmedic' },
  mask: { bandana: 3, shades: 5, visor: 10 },
  accessory: { scarf: 3, medals: 'veteran', antenna: 9 },
  weaponSkin: { camo: 2, carbon: 5, candy: 7, neon: 11, gold: 'centurion' },
  gloves: { black: 3, team: 6, gold: 'rampage' },
  victoryPose: { flex: 1, salute: 2, cheer: 4, dab: 8 },
  elimEffect: { pixels: 1, confetti: 3, sparks: 6, hearts: 10, gold: 'unstoppable' },
  banner: { steel: 1, hazard: 2, circuit: 5, sunset: 7, frost: 9, neon: 13 },
};

function blankStats() {
  const classStats = {};
  for (const c of CLASS_IDS) classStats[c] = { kills: 0, deaths: 0, assists: 0, matches: 0, damage: 0, healing: 0 };
  return {
    matches: 0, wins: 0, losses: 0, draws: 0, kills: 0, deaths: 0, assists: 0, captures: 0, returns: 0, pickups: 0, defenses: 0,
    healing: 0, damage: 0, headshotKills: 0, backstabs: 0, turretsBuilt: 0, turretKills: 0, bestStreak: 0, awards: 0,
    classesWithKill: 0, cratesOpened: 0, classStats,
  };
}

function starterLoadout() {
  const lo = {};
  for (const slot of SLOTS) lo[slot] = null;
  lo.weaponSkin = 'weaponSkin:factory:classic';
  lo.victoryPose = 'victoryPose:flex';
  lo.elimEffect = 'elimEffect:pixels';
  lo.banner = 'banner:solid:steel';
  return lo;
}

let uidSeq = 0;
const newUid = () => `${Date.now().toString(36)}${(uidSeq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export class Profile {
  constructor() {
    this.data = null;
    this.load();
  }

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { d = null; }
    const blank = {
      name: '', xp: 0, stats: blankStats(), achievements: [], selectedClass: 'scout', recent: [], created: Date.now(),
      inventory: {}, newItems: [], loadouts: {}, crates: [], scrap: 0, contracts: {}, lastWinDay: -1, milestones: 0,
    };
    this.data = d ? { ...blank, ...d, stats: { ...blankStats(), ...(d.stats || {}) } } : blank;
    const D = this.data;
    for (const c of CLASS_IDS) if (!D.stats.classStats[c]) D.stats.classStats[c] = blankStats().classStats[c];
    for (const id of STARTER_ITEMS) D.inventory[id] = 1;
    if (d && d.cosmetics && !d.loadouts) this.migrateLegacy(d);
    delete D.cosmetics;
    for (const c of CLASS_IDS) {
      const lo = { ...starterLoadout(), ...(D.loadouts[c] || {}) };
      for (const slot of SLOTS) { const it = getItem(lo[slot]); if (lo[slot] && (!it || !D.inventory[lo[slot]] || !canWear(it, c) || it.slot !== slot)) lo[slot] = starterLoadout()[slot]; }
      D.loadouts[c] = lo;
    }
    for (const id of Object.keys(D.inventory)) if (!getItem(id)) delete D.inventory[id];
    if (!d) D.crates.push({ uid: newUid(), type: 'bronze', src: 'Welcome gift' });
    this.refreshContracts();
  }

  migrateLegacy(d) {
    const D = this.data;
    const level = levelFromXp(d.xp || 0).level;
    for (const [slot, m] of Object.entries(LEGACY_UNLOCKS)) {
      for (const [old, req] of Object.entries(m)) {
        const ok = typeof req === 'number' ? level >= req : (d.achievements || []).includes(req);
        const id = LEGACY_MAP[slot]?.[old];
        if (ok && id) D.inventory[id] = 1;
      }
    }
    const lo = starterLoadout();
    for (const slot of SLOTS) { const id = LEGACY_MAP[slot]?.[d.cosmetics[slot]]; if (id && D.inventory[id]) lo[slot] = id; }
    for (const c of CLASS_IDS) D.loadouts[c] = { ...lo };
    const bonus = Math.min(8, Math.floor(level / 3));
    for (let i = 0; i < bonus; i++) D.crates.push({ uid: newUid(), type: i === 0 && level >= 10 ? 'gold' : 'bronze', src: 'Veteran bonus' });
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

  // ---------------------------------------------------------------- inventory & loadouts
  owns(id) { return !!this.data.inventory[id]; }
  ownedCount() { return Object.keys(this.data.inventory).length; }
  ownedItems() { return Object.keys(this.data.inventory).map(getItem).filter(Boolean); }
  isNew(id) { return this.data.newItems.includes(id); }
  markSeen(ids) { const set = new Set(ids); this.data.newItems = this.data.newItems.filter((i) => !set.has(i)); this.save(); }

  loadout(classId = this.data.selectedClass) { return { ...this.data.loadouts[classId] }; }
  cosmetics(classId = this.data.selectedClass) { return this.loadout(classId); }
  loadoutsPayload() { return JSON.parse(JSON.stringify(this.data.loadouts)); }

  // id null = unequip (slots with a default fall back to it).
  equip(classId, slot, id) {
    if (id === null) { this.data.loadouts[classId][slot] = starterLoadout()[slot]; this.save(); return true; }
    const it = getItem(id);
    if (!it || it.slot !== slot || !this.owns(id) || !canWear(it, classId)) return false;
    this.data.loadouts[classId][slot] = id;
    this.save();
    return true;
  }
  // Copy one class's loadout to every class that can wear the items.
  equipAll(fromClass) {
    const src = this.data.loadouts[fromClass];
    for (const c of CLASS_IDS) for (const slot of SLOTS) { const it = getItem(src[slot]); if (!src[slot] || (it && canWear(it, c))) this.data.loadouts[c][slot] = src[slot]; }
    this.save();
  }

  grantItem(id) {
    const dup = this.owns(id);
    if (!dup) { this.data.inventory[id] = 1; this.data.newItems.push(id); }
    return dup;
  }

  // Salvage an owned item for scrap; unequips it everywhere. Starter items can't be salvaged.
  salvage(id) {
    const it = getItem(id);
    if (!it || !this.owns(id) || STARTER_ITEMS.includes(id)) return 0;
    delete this.data.inventory[id];
    for (const c of CLASS_IDS) for (const slot of SLOTS) if (this.data.loadouts[c][slot] === id) this.data.loadouts[c][slot] = starterLoadout()[slot];
    const scrap = RARITIES[it.rarity].scrap * SALVAGE_BONUS;
    this.data.scrap += scrap;
    this.markSeen([id]);
    this.save();
    return scrap;
  }

  // ---------------------------------------------------------------- crates
  addCrate(type, src) { this.data.crates.push({ uid: newUid(), type, src }); }

  crateCounts() {
    const out = {};
    for (const c of this.data.crates) out[c.type] = (out[c.type] || 0) + 1;
    return out;
  }

  // Open the oldest crate of a type (or by uid). Duplicates become scrap.
  openCrate(typeOrUid, rnd = Math.random) {
    const i = this.data.crates.findIndex((c) => c.uid === typeOrUid || c.type === typeOrUid);
    if (i < 0) return null;
    const [crate] = this.data.crates.splice(i, 1);
    const item = rollCrate(crate.type, rnd);
    const duplicate = this.grantItem(item.id);
    const scrap = duplicate ? RARITIES[item.rarity].scrap : 0;
    this.data.scrap += scrap;
    this.data.stats.cratesOpened = (this.data.stats.cratesOpened || 0) + 1;
    const milestones = this.checkMilestones();
    this.save();
    return { crate, item, duplicate, scrap, milestones };
  }

  craftCrate(type) {
    const def = CRATE_BY_ID[type];
    if (!def || this.data.scrap < def.craft) return false;
    this.data.scrap -= def.craft;
    this.addCrate(type, 'Crafted');
    this.save();
    return true;
  }

  checkMilestones() {
    const got = [];
    const n = this.ownedCount();
    while (this.data.milestones < COLLECTION_MILESTONES.length && n >= COLLECTION_MILESTONES[this.data.milestones].count) {
      const m = COLLECTION_MILESTONES[this.data.milestones++];
      this.addCrate(m.crate, `Collection: ${m.count} items`);
      got.push(m);
    }
    return got;
  }

  collection() { return { owned: this.ownedCount(), total: ITEMS.length, next: COLLECTION_MILESTONES[this.data.milestones] || null }; }

  // ---------------------------------------------------------------- contracts
  refreshContracts(now = Date.now()) {
    const C = this.data.contracts;
    const d = dayIndex(now), w = weekIndex(now);
    if (!C.daily || C.daily.index !== d) C.daily = { index: d, list: makeContracts('daily', d), state: {} };
    if (!C.weekly || C.weekly.index !== w) C.weekly = { index: w, list: makeContracts('weekly', w), state: {} };
    return C;
  }
  contractResetIn(now = Date.now()) {
    const d = dayIndex(now), w = weekIndex(now);
    return { daily: (d + 1) * 86400000 - now, weekly: ((w + 1) * 7 - 3) * 86400000 - now };
  }
  firstWinAvailable(now = Date.now()) { return this.data.lastWinDay !== dayIndex(now); }

  achievementProgress(a) {
    const v = this.data.stats[a.stat] || 0;
    return { value: v, done: this.data.achievements.includes(a.id), pct: Math.min(1, v / a.goal) };
  }

  /**
   * Apply authoritative end-of-match results for this player.
   * Returns { xp, levelBefore, levelAfter, newAchievements, awards, won, draw, rewards }
   * rewards: { crates: [{type, src}], scrap, contracts: [...], firstWin }
   */
  applyMatch(results, myId, playedClasses = [], now = Date.now()) {
    const me = results.players.find((p) => p.id === myId);
    if (!me) return null;
    const s = this.data.stats;
    const st = me.stats;
    const won = results.winner === me.team;
    const draw = results.winner === -1;
    const xp = computeMatchXp(st, won, true);
    const levelBefore = this.level;
    const rewards = { crates: [], scrap: 0, contracts: [], firstWin: false };
    const crate = (type, src) => { this.addCrate(type, src); rewards.crates.push({ type, src }); };

    s.matches++;
    if (won) s.wins++; else if (draw) s.draws++; else s.losses++;
    for (const k of ['kills', 'deaths', 'assists', 'captures', 'returns', 'pickups', 'defenses', 'headshotKills', 'backstabs', 'turretsBuilt', 'turretKills']) s[k] += st[k] || 0;
    s.healing += Math.round(st.healing || 0);
    s.damage += Math.round(st.damage || 0);
    s.bestStreak = Math.max(s.bestStreak, st.bestStreak || 0);
    const cs = s.classStats[me.classId];
    if (cs) { cs.matches++; cs.kills += st.kills; cs.deaths += st.deaths; cs.assists += st.assists; cs.damage += Math.round(st.damage); cs.healing += Math.round(st.healing); }
    for (const c of playedClasses) if (c !== me.classId && s.classStats[c]) s.classStats[c].matches++;
    s.classesWithKill = Object.values(s.classStats).filter((c) => c.kills > 0).length;
    const myAwards = results.awards.filter((a) => a.playerId === myId);
    s.awards += myAwards.length;

    // kill crate: 5+ eliminations, better crates for more
    const killCrate = crateForKills(st.kills || 0);
    if (killCrate) crate(killCrate, `${st.kills} eliminations`);
    // first win of the day
    if (won && this.firstWinAvailable(now)) { this.data.lastWinDay = dayIndex(now); rewards.firstWin = true; crate('silver', 'First win of the day'); xp.lines.push({ label: 'First win of the day', count: 1, xp: 300 }); xp.total += 300; }
    // contracts
    this.refreshContracts(now);
    const m = { stats: st, classId: me.classId, won, crate: killCrate, classes: [...new Set([me.classId, ...playedClasses])] };
    for (const period of ['daily', 'weekly']) {
      for (const c of advanceContracts(this.data.contracts[period], m)) {
        rewards.contracts.push(c);
        if (c.reward.crate) crate(c.reward.crate, `Contract: ${c.desc}`);
        rewards.scrap += c.reward.scrap;
        xp.lines.push({ label: `Contract complete`, count: 1, xp: c.reward.xp }); xp.total += c.reward.xp;
      }
    }
    this.data.scrap += rewards.scrap;
    this.data.xp += xp.total;
    // level-up crates
    for (let L = levelBefore + 1; L <= this.level; L++) crate(levelCrate(L), `Reached level ${L}`);
    // achievements
    const newAchievements = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements.includes(a.id)) continue;
      if ((s[a.stat] || 0) >= a.goal) { this.data.achievements.push(a.id); newAchievements.push(a); crate('silver', `Achievement: ${a.name}`); }
    }
    this.data.recent.unshift({ t: now, map: results.mapId, mode: results.mode, cls: me.classId, won, draw, k: st.kills, d: st.deaths, a: st.assists, score: st.score, xp: xp.total, crates: rewards.crates.length });
    this.data.recent = this.data.recent.slice(0, 12);
    this.save();
    return { xp, levelBefore, levelAfter: this.level, newAchievements, awards: myAwards, won, draw, rewards };
  }
}
