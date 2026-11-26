// Persistent player profile: level/XP, lifetime statistics, per-class stats, achievements, and the
// cosmetic inventory with per-class loadouts. (Item acquisition will be added later; for now players
// own the starter set plus anything migrated from older profiles.)
import { levelFromXp, computeMatchXp, ACHIEVEMENTS } from '../../shared/config/progression.js';
import { CLASS_IDS, resolveWeapons, sanitizeWeaponLoadouts } from '../../shared/config/classes.js';
import { SLOTS, STARTER_ITEMS, LEGACY_MAP, ITEMS, getItem, canWear } from '../../shared/config/cosmetics.js';
import { CRATE_BY_ID, rollCrate } from '../../shared/config/crates.js';

const secureRandom = () => {
  try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch { return Math.random(); }
};

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
    classesWithKill: 0, classStats,
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
      inventory: {}, newItems: [], loadouts: {}, weapons: {}, keys: 0, keysEarned: 0, crateLog: [],
    };
    this.data = d ? { ...blank, ...d, stats: { ...blankStats(), ...(d.stats || {}) } } : blank;
    const D = this.data;
    for (const c of CLASS_IDS) if (!D.stats.classStats[c]) D.stats.classStats[c] = blankStats().classStats[c];
    for (const id of STARTER_ITEMS) D.inventory[id] = 1;
    if (d && d.cosmetics && !d.loadouts) this.migrateLegacy(d);
    delete D.cosmetics;
    // the crate/contract economy was removed; drop its leftover fields from older saves
    for (const k of ['crates', 'scrap', 'contracts', 'lastWinDay', 'milestones']) delete D[k];
    for (const c of CLASS_IDS) {
      const lo = { ...starterLoadout(), ...(D.loadouts[c] || {}) };
      for (const slot of SLOTS) { const it = getItem(lo[slot]); if (lo[slot] && (!it || !D.inventory[lo[slot]] || !canWear(it, c) || it.slot !== slot)) lo[slot] = starterLoadout()[slot]; }
      D.loadouts[c] = lo;
    }
    for (const id of Object.keys(D.inventory)) if (!getItem(id)) delete D.inventory[id];
    D.weapons = sanitizeWeaponLoadouts(D.weapons);
    D.keys = Math.max(0, Math.floor(+D.keys || 0));
    if (!Array.isArray(D.crateLog)) D.crateLog = [];
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
  }

  save() {
    this.data.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    this.onSave?.(this.data);
  }

  // Replace the whole profile (e.g. with a cloud copy after signing in), normalising it like a fresh load.
  importData(d) {
    if (!d || typeof d !== 'object') return false;
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
    this.load();
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    return true;
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

  // ---------------------------------------------------------------- weapon loadouts (per class)
  weaponsFor(classId = this.data.selectedClass) { return resolveWeapons(classId, this.data.weapons[classId]); }
  weaponsPayload() { return sanitizeWeaponLoadouts(this.data.weapons); }
  setWeapon(classId, slot, weaponId) {
    const next = this.weaponsFor(classId);
    next[slot] = weaponId;
    const fixed = resolveWeapons(classId, next);
    if (fixed[slot] !== weaponId) return false;
    this.data.weapons[classId] = fixed;
    this.save();
    return true;
  }

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

  collection() { return { owned: this.ownedCount(), total: ITEMS.length }; }

  // ---------------------------------------------------------------- keys & crates
  get keys() { return this.data.keys; }
  /**
   * Open a crate tier. The result is decided and saved BEFORE the opening animation plays, so closing
   * or reloading the page mid-animation can't re-roll it. Returns { tier, item, rarity, refund } or null.
   */
  openCrate(tierId, rnd = secureRandom) {
    const tier = CRATE_BY_ID[tierId];
    if (!tier || this.data.keys < tier.cost) return null;
    const res = rollCrate(tier, (id) => this.owns(id), rnd);
    this.data.keys -= tier.cost;
    if (res.item) this.grantItem(res.item.id);
    else this.data.keys += res.refund;
    this.data.crateLog.unshift({ t: Date.now(), tier: tier.id, item: res.item ? res.item.id : null, rarity: res.rarity, refund: res.refund });
    this.data.crateLog = this.data.crateLog.slice(0, 20);
    this.save();
    return { tier, ...res };
  }

  achievementProgress(a) {
    const v = this.data.stats[a.stat] || 0;
    return { value: v, done: this.data.achievements.includes(a.id), pct: Math.min(1, v / a.goal) };
  }

  /**
   * Apply authoritative end-of-match results for this player.
   * Returns { xp, levelBefore, levelAfter, newAchievements, awards, won, draw }
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

    this.data.xp += xp.total;
    // keys decided by the game server at match end (winning team, 10+ kills on real players)
    const keys = Math.max(0, Math.min(3, Math.floor(+results.keys?.[myId] || 0)));
    this.data.keys += keys;
    this.data.keysEarned = (this.data.keysEarned || 0) + keys;
    // achievements
    const newAchievements = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements.includes(a.id)) continue;
      if ((s[a.stat] || 0) >= a.goal) { this.data.achievements.push(a.id); newAchievements.push(a); }
    }
    this.data.recent.unshift({ t: now, map: results.mapId, mode: results.mode, cls: me.classId, won, draw, k: st.kills, d: st.deaths, a: st.assists, score: st.score, xp: xp.total });
    this.data.recent = this.data.recent.slice(0, 12);
    this.save();
    const keyInfo = results.keyInfo ? results.keyInfo.teams?.[me.team] : null;
    return { xp, levelBefore, levelAfter: this.level, newAchievements, awards: myAwards, won, draw, keys, keyInfo, keysRequired: results.keyInfo?.required ?? 10 };
  }
}
