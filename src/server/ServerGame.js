// Authoritative match simulation. Runs in Node (dedicated server) or a browser Web Worker (listen server).
// Clients only send input commands and requests; the server owns damage, health, eliminations, teams,
// scores, flags, respawns, abilities, turrets and match results.
import {
  SERVER_TICK_RATE, SNAPSHOT_RATE, MATCH_STATE, PF, BTN, TEAM_NAMES, PROTOCOL_VERSION, RECONNECT_GRACE,
  FALL_DAMAGE_SPEED, FALL_DAMAGE_PER_MS, PLAYER_HEIGHT, otherTeam, MAX_LAG_COMP, GAME_VERSION,
} from '../shared/constants.js';
import { CLASSES, CLASS_IDS, getClass } from '../shared/config/classes.js';
import { WEAPONS } from '../shared/config/weapons.js';
import { MODES, SCORE_VALUES, MATCH_DEFAULTS } from '../shared/config/modes.js';
import { sanitizeLoadouts, randomLoadouts } from '../shared/config/cosmetics.js';
import { resolveWeapons, sanitizeWeaponLoadouts } from '../shared/config/classes.js';
import { World } from '../shared/physics.js';
import { NavGraph } from '../shared/nav.js';
import { createMoveState, stepMovement, moveParamsFor, eyeHeight } from '../shared/movement.js';
import { createWeaponState, stepWeapons, packWeaponState, refillAmmo, needsAmmo } from '../shared/weaponLogic.js';
import { chooseTeam, canSwitchTeam, classAllowed, isValidTeam } from '../shared/teams.js';
import { fallDamage } from '../shared/damage.js';
import { assignAwards, mvpScore } from '../shared/awards.js';
import { computeKeyRewards, KEY_RULES } from '../shared/rewards.js';
import { getMap, MAP_IDS } from '../maps/index.js';
import { Combat } from './combat.js';
import { Projectiles } from './projectiles.js';
import { Abilities } from './abilities.js';
import { TeamDeathmatch } from './modes/tdm.js';
import { CaptureTheFlag } from './modes/ctf.js';
import { BotController, BOT_NAMES } from './bots/Bot.js';
import { round2, round3, wrapAngle } from '../shared/math.js';

const TICK_DT = 1 / SERVER_TICK_RATE;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const navCache = new Map();

// Bots pick a random weapon from each slot's arsenal so alternates show up in matches.
function randomWeaponPicks() {
  const out = {};
  for (const id of CLASS_IDS) out[id] = (getClass(id).arsenal || []).map((list) => { const ok = list.filter((w) => !WEAPONS[w]?.botAvoid); return ok[Math.floor(Math.random() * ok.length)] || list[0]; });
  return sanitizeWeaponLoadouts(out);
}

// Cosmetics the player currently wears: their loadout for the class they're playing (empty slots dropped).
function wornBy(p) {
  const lo = p.loadouts?.[p.classId] || {};
  const out = {};
  for (const k in lo) if (lo[k]) out[k] = lo[k];
  return out;
}

export function emptyStats() {
  return {
    kills: 0, deaths: 0, assists: 0, damage: 0, healing: 0, captures: 0, returns: 0, pickups: 0,
    defenses: 0, score: 0, streak: 0, bestStreak: 0, headshotKills: 0, backstabs: 0, turretsBuilt: 0,
    turretKills: 0, classKills: {},
  };
}

export class ServerGame {
  /**
   * opts: { mapId, mode, botFill, maxPlayers, roomName, send(connId, msg), log, rotation, botDifficulty }
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.send = opts.send || (() => {});
    this.log = opts.log || (() => {});
    this.roomName = opts.roomName || 'Pixel Fortress Server';
    this.maxPlayers = Math.min(opts.maxPlayers || 12, 16);
    this.botFill = opts.botFill ?? 8;
    this.botDifficulty = opts.botDifficulty ?? 0.6;
    this.rotation = opts.rotation || null;
    this.players = new Map();     // id -> player
    this.conns = new Map();       // connId -> playerId
    this.ghosts = new Map();      // token -> { player, until }
    this.nextId = 1;
    this.time = 0;
    this.tickCount = 0;
    this.snapAccum = 0;
    this.events = [];
    this.hostConn = opts.hostConn ?? null;
    this.loadMap(opts.mapId || MAP_IDS[0], opts.mode || 'tdm');
  }

  // ------------------------------------------------------------------ map / match lifecycle
  loadMap(mapId, mode) {
    this.mapId = MAP_IDS.includes(mapId) ? mapId : MAP_IDS[0];
    this.modeId = MODES[mode] ? mode : 'tdm';
    this.modeCfg = { ...MODES[this.modeId] };
    this.map = getMap(this.mapId);
    this.world = new World(this.map.boxes, this.map.bounds);
    if (!navCache.has(this.mapId)) navCache.set(this.mapId, new NavGraph(new World(this.map.boxes, this.map.bounds), this.map.bounds));
    this.nav = navCache.get(this.mapId);
    this.combat = new Combat(this);
    this.projectiles = new Projectiles(this);
    this.abilities = new Abilities(this);
    this.mode = this.modeId === 'ctf' ? new CaptureTheFlag(this) : new TeamDeathmatch(this);
    this.pickups = this.map.pickups.map((p, i) => ({ ...p, idx: i, respawnAt: 0, active: true }));
    this.scores = [0, 0];
    this.state = MATCH_STATE.WARMUP;
    this.stateTime = 0;
    this.timeLeft = this.modeCfg.duration;
    this.matchStart = this.time;
    this.results = null;
    this.humanKills = [];   // kills between real players this match (for key rewards)
    this.announced = {};
  }

  startPreRound() {
    this.state = MATCH_STATE.PREROUND;
    this.stateTime = this.modeCfg.preRound;
    this.scores = [0, 0];
    this.timeLeft = this.modeCfg.duration;
    this.results = null;
    this.announced = {};
    this.mode.reset();
    this.projectiles.clear();
    this.abilities.clear();
    for (const p of this.players.values()) {
      p.stats = emptyStats();
      p.carrying = -1;
      this.spawnPlayer(p);
    }
    this.event(['ann', 'preround', this.modeCfg.preRound]);
  }

  startPlaying() {
    this.state = MATCH_STATE.PLAYING;
    this.matchStart = this.time;
    this.event(['ann', 'start']);
  }

  endMatch(winner, reason) {
    if (this.state === MATCH_STATE.ENDED) return;
    this.state = MATCH_STATE.ENDED;
    this.stateTime = MATCH_DEFAULTS.endScreenTime;
    const list = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, classId: p.classId, isBot: p.isBot, cosmetics: wornBy(p), stats: { ...p.stats, classKills: { ...p.stats.classKills } } }));
    const awards = assignAwards(list, this.modeId);
    const mvps = [...list].sort((a, b) => mvpScore(b.stats) - mvpScore(a.stats)).slice(0, 3).map((p) => p.id);
    this.results = {
      winner, reason, scores: [...this.scores], duration: Math.round(this.time - this.matchStart),
      mapId: this.mapId, mode: this.modeId, players: list, awards, mvps,
      ...this.keyRewards(winner),
      teamStats: [0, 1].map((t) => {
        const ps = list.filter((p) => p.team === t);
        const sum = (k) => ps.reduce((s, p) => s + (p.stats[k] || 0), 0);
        return { kills: sum('kills'), deaths: sum('deaths'), assists: sum('assists'), damage: sum('damage'), healing: sum('healing'), captures: sum('captures') };
      }),
    };
    this.broadcast({ t: 'res', r: this.results });
    this.event(['ann', 'end', winner]);
    this.log(`match ended winner=${winner} ${reason}`);
  }

  // Server-authoritative key rewards for this match (see shared/rewards.js).
  keyRewards(winner) {
    const end = this.time, start = this.matchStart ?? end;
    const players = [...this.players.values()].map((p) => ({ id: p.id, team: p.team, isBot: p.isBot, presence: end - Math.max(p.joinedAt ?? start, start) }));
    const r = computeKeyRewards({ kills: this.humanKills || [], players, winner, duration: end - start });
    for (const [id, n] of Object.entries(r.keys)) {
      const p = this.players.get(+id);
      if (p) this.opts.audit?.({ ev: 'keys', name: p.name, uid: p.uid || null, verified: !!p.verified, keys: n });
    }
    return { keys: r.keys, keyInfo: { teams: r.teams, required: KEY_RULES.TEAM_KILLS_REQUIRED } };
  }

  nextMatch() {
    let mapId = this.mapId, mode = this.modeId;
    if (this.pendingMap) { mapId = this.pendingMap.mapId; mode = this.pendingMap.mode; this.pendingMap = null; }
    else if (this.rotation) {
      const i = (MAP_IDS.indexOf(this.mapId) + 1) % MAP_IDS.length;
      mapId = MAP_IDS[i];
    }
    this.changeMap(mapId, mode);
  }

  changeMap(mapId, mode) {
    this.loadMap(mapId, mode);
    for (const p of this.players.values()) {
      p.stats = emptyStats();
      p.carrying = -1;
      if (p.connId !== null) this.sendWelcome(p, 'map');
    }
    this.startPreRound();
  }

  // ------------------------------------------------------------------ connections
  handleConnect(connId) {
    // wait for hello
  }

  handleDisconnect(connId) {
    const pid = this.conns.get(connId);
    this.conns.delete(connId);
    if (pid === undefined) return;
    const p = this.players.get(pid);
    if (!p) return;
    this.removePlayer(p, true);
  }

  removePlayer(p, allowReconnect) {
    this.mode.onPlayerLeave(p);
    this.abilities.removeOwned(p.id);
    this.players.delete(p.id);
    if (allowReconnect && !p.isBot && p.token) {
      // held by game time and wall-clock time (an empty room stops ticking, so game time alone would never expire it)
      this.ghosts.set(p.token, { player: p, until: this.time + RECONNECT_GRACE, untilMs: Date.now() + RECONNECT_GRACE * 1000 });
    }
    this.event(['ann', 'leave', p.name]);
    if (!p.isBot) this.opts.audit?.({ ev: 'leave', name: p.name, uid: p.uid || null, verified: !!p.verified });
    this.balanceBots();
    this.sendRoster();
    if (this.humanCount() === 0 && !this.opts.persistent) {
      this.state = MATCH_STATE.WARMUP;
    }
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.isBot) n++;
    return n;
  }

  // trusted: set only by the dedicated server after checking the player's account (never from the client).
  handleMessage(connId, msg, trusted = null) {
    if (!msg || typeof msg !== 'object') return;
    const pid = this.conns.get(connId);
    const p = pid !== undefined ? this.players.get(pid) : null;
    switch (msg.t) {
      case 'hello': return this.onHello(connId, msg, trusted);
      case 'c': if (p) this.onCommands(p, msg.c); return;
      case 'class': if (p) this.requestClass(p, msg.classId); return;
      case 'team': if (p) this.requestTeam(p, msg.team); return;
      case 'chat': if (p) this.onChat(p, msg); return;
      case 'pong': if (p && p.pingSent && msg.n === p.pingN) { p.ping = Math.round((Date.now() - p.pingSent) / 1); p.pingSent = 0; } return;
      case 'cos': if (p) { p.loadouts = sanitizeLoadouts(msg.loadouts); this.sendRoster(); } return;
      case 'wpn': if (p) p.weaponPicks = sanitizeWeaponLoadouts(msg.weapons); return; // applied at the next spawn
      case 'host': if (connId === this.hostConn) this.onHostCommand(msg); return;
      default:
    }
  }

  onHello(connId, msg, trusted = null) {
    if (this.conns.has(connId)) return;
    if (msg.protocol !== PROTOCOL_VERSION) {
      this.send(connId, { t: 'error', reason: `Version mismatch (server v${GAME_VERSION}). Refresh the page.` });
      return;
    }
    let name = String(msg.name || 'Player').replace(/[^\w \-\.\[\]]/g, '').trim().slice(0, 16) || 'Player';
    const account = trusted?.account || null;
    const verified = !!account?.username;
    if (verified) name = account.username;
    else if (trusted?.guestName) name = trusted.guestName;
    // Reconnection
    const ghost = msg.token ? this.ghosts.get(msg.token) : null;
    let p;
    if (ghost && ghost.until > this.time && (ghost.untilMs ?? Infinity) > Date.now()) {
      this.ghosts.delete(msg.token);
      p = ghost.player;
      p.connId = connId;
      p.cmdQueue = [];
      p.cmdBudget = 0;
      this.players.set(p.id, p);
      if (!isValidTeam(p.team) || this.teamCount(p.team) >= this.maxPerTeam()) p.team = this.pickTeam(-1);
      // the player may have picked a different class / loadout in the menu since they left
      p.loadouts = sanitizeLoadouts(msg.loadouts);
      p.weaponPicks = sanitizeWeaponLoadouts(msg.weapons);
      if (CLASS_IDS.includes(msg.classId) && msg.classId !== p.classId) {
        this.makeRoomForClass(p.team, msg.classId, p.id);
        if (classAllowed([...this.players.values()], p.team, msg.classId, getClass(msg.classId).limit, p.id)) {
          p.nextClassId = msg.classId;
          if (p.alive) this.spawnPlayer(p, true);
        }
      }
    } else {
      if (this.humanCount() >= this.maxPlayers) { this.send(connId, { t: 'error', reason: 'Server is full.' }); return; }
      this.trimBotsFor(1);
      const team = this.pickTeam(msg.team ?? -1);
      if (team < 0) { this.send(connId, { t: 'error', reason: 'Server is full.' }); return; }
      if (CLASS_IDS.includes(msg.classId)) this.makeRoomForClass(team, msg.classId);
      const classId = CLASS_IDS.includes(msg.classId) && classAllowed([...this.players.values()], team, msg.classId, getClass(msg.classId).limit) ? msg.classId : this.pickClass(team);
      if (verified) this.freeName(name);
      p = this.createPlayer({ name: verified ? name : this.uniqueName(name), team, classId, isBot: false, connId, loadouts: sanitizeLoadouts(msg.loadouts), weaponPicks: sanitizeWeaponLoadouts(msg.weapons), token: msg.token || randomToken() });
    }
    p.uid = account?.uid || null;
    p.verified = verified;
    this.conns.set(connId, p.id);
    if (this.hostConn === null) this.hostConn = connId;
    this.sendWelcome(p, 'welcome');
    this.event(['ann', 'join', p.name, p.team]);
    if (this.state === MATCH_STATE.WARMUP) {
      this.balanceBots();
      this.startPreRound();
    } else {
      if (!p.alive && p.respawnAt === 0) p.respawnAt = this.time + 1;
      this.balanceBots();
    }
    this.sendRoster();
    this.log(`join ${p.name} team=${TEAM_NAMES[p.team]} class=${p.classId}`);
    this.opts.audit?.({ ev: 'join', name: p.name, uid: p.uid, verified: p.verified, team: TEAM_NAMES[p.team] });
  }

  sendWelcome(p, type) {
    this.send(p.connId, {
      t: type, id: p.id, token: p.token, mapId: this.mapId, mode: this.modeId, room: this.roomName,
      state: this.state, time: this.time, isHost: p.connId === this.hostConn, protocol: PROTOCOL_VERSION,
      tickRate: SERVER_TICK_RATE, settings: { botFill: this.botFill, maxPlayers: this.maxPlayers, scoreLimit: this.modeCfg.scoreLimit, duration: this.modeCfg.duration },
    });
  }

  // A verified player owns their name: anyone else here using it (case-insensitive) is renamed.
  freeName(name) {
    const key = name.toLowerCase();
    for (const q of this.players.values()) if (q.name.toLowerCase() === key) { q.name = this.uniqueName(`${q.name}_`); this.rosterDirty = true; }
  }

  uniqueName(name) {
    const names = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (names.has(name.toLowerCase())) { for (let i = 2; i < 99; i++) if (!names.has(`${name}${i}`.toLowerCase())) return `${name}${i}`; }
    return name;
  }


  maxPerTeam() { return Math.max(1, Math.ceil(Math.max(this.maxPlayers, this.botFill) / 2)); }
  teamCount(t) { let n = 0; for (const p of this.players.values()) if (p.team === t) n++; return n; }

  pickTeam(preferred) {
    return chooseTeam([...this.players.values()].map((p) => ({ team: p.team, isBot: p.isBot, score: p.stats.score })), this.maxPerTeam(), preferred);
  }

  // Bots give way to humans: if a class is at its team limit and a bot holds a slot, that bot switches.
  makeRoomForClass(team, classId, exceptId) {
    const limit = getClass(classId).limit;
    if (!limit) return;
    const list = [...this.players.values()];
    if (classAllowed(list, team, classId, limit, exceptId)) return;
    const bot = list.find((q) => q.isBot && q.team === team && q.classId === classId);
    if (!bot) return;
    const others = CLASS_IDS.filter((c) => c !== classId && classAllowed(list, team, c, getClass(c).limit, bot.id));
    bot.nextClassId = others[Math.floor(Math.random() * others.length)] || 'scout';
    if (bot.alive) this.spawnPlayer(bot, true);
    else { bot.classId = bot.nextClassId; this.rosterDirty = true; }
  }

  pickClass(team) {
    const list = [...this.players.values()];
    const have = new Set(list.filter((p) => p.team === team).map((p) => p.classId));
    // bias toward missing roles; doctors first
    const order = ['doctor', 'juggernaut', 'soldier', 'scout', 'demolitionist', 'incinerator', 'marksman', 'mechanic', 'spy'];
    for (const c of order) if (!have.has(c) && Math.random() < 0.7) return c;
    const pool = CLASS_IDS.filter((c) => classAllowed(list, team, c, getClass(c).limit));
    let total = pool.reduce((s, c) => s + getClass(c).botWeight, 0);
    let r = Math.random() * total;
    for (const c of pool) { r -= getClass(c).botWeight; if (r <= 0) return c; }
    return 'scout';
  }

  createPlayer({ name, team, classId, isBot, connId, loadouts, weaponPicks, token }) {
    const id = this.nextId++;
    const cls = getClass(classId);
    const p = {
      id, name, team, classId, nextClassId: classId, isBot, connId: connId ?? null, token, loadouts: loadouts || sanitizeLoadouts({}), weaponPicks: weaponPicks || sanitizeWeaponLoadouts({}),
      alive: false, hp: 0, maxHp: cls.health, respawnAt: this.time + 0.5, spawnCount: 0,
      ms: createMoveState(), ws: createWeaponState(cls), weapons: [...cls.weapons], cmdQueue: [], cmdBudget: 0, lastSeq: 0,
      history: [], spawnProtectUntil: 0, prevAbilityBtn: false,
      ability: { cdUntil: 0, activeUntil: 0, charge: 0, active: false },
      cloak: { on: false, meter: 1, attackAt: 0 }, rallyUntil: 0, prevAltBtn: false,
      disguise: null, burn: null, revealedUntil: 0, healTarget: -1, lastBeam: 0, healedBy: new Map(),
      damageLog: [], stats: emptyStats(), carrying: -1, ping: 0, pingN: 0, pingSent: 0,
      firingUntil: 0, lastResupply: 0, lastCmdTime: this.time, bot: null, lagTime: 0, joinedAt: this.time,
    };
    if (isBot) p.bot = new BotController(this, p);
    this.players.set(id, p);
    return p;
  }

  // ------------------------------------------------------------------ bots
  balanceBots() {
    const humans = this.humanCount();
    const target = humans === 0 && !this.opts.persistent ? 0 : Math.max(this.botFill, 0);
    let total = this.players.size;
    // add bots
    while (total < target && total < 16) {
      const team = this.pickTeam(-1);
      if (team < 0) break;
      const used = new Set([...this.players.values()].map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) || `Bot${this.nextId}`;
      const p = this.createPlayer({ name, team, classId: this.pickClass(team), isBot: true, loadouts: randomLoadouts(Math.random), weaponPicks: randomWeaponPicks() });
      p.respawnAt = this.time + 0.5 + Math.random();
      total++;
    }
    // remove extra bots
    while (total > Math.max(target, humans)) {
      if (!this.removeOneBot()) break;
      total--;
    }
    // keep teams even by moving bots
    for (let guard = 0; guard < 8; guard++) {
      const c = [this.teamCount(0), this.teamCount(1)];
      if (Math.abs(c[0] - c[1]) <= 1) break;
      const big = c[0] > c[1] ? 0 : 1;
      const bot = [...this.players.values()].find((p) => p.isBot && p.team === big);
      if (!bot) break;
      if (bot.alive) this.combat.kill(bot, null, 'world', 0, true);
      bot.team = 1 - big;
    }
  }

  removeOneBot() {
    const c = [this.teamCount(0), this.teamCount(1)];
    const team = c[0] >= c[1] ? 0 : 1;
    const bot = [...this.players.values()].find((p) => p.isBot && p.team === team) || [...this.players.values()].find((p) => p.isBot);
    if (!bot) return false;
    this.mode.onPlayerLeave(bot);
    this.abilities.removeOwned(bot.id);
    this.players.delete(bot.id);
    return true;
  }

  trimBotsFor(n) {
    for (let i = 0; i < n; i++) if (this.players.size >= this.maxPerTeam() * 2) this.removeOneBot();
  }

  // ------------------------------------------------------------------ requests
  requestClass(p, classId) {
    if (!CLASS_IDS.includes(classId)) return;
    if (!p.isBot) this.makeRoomForClass(p.team, classId, p.id);
    if (!classAllowed([...this.players.values()], p.team, classId, getClass(classId).limit, p.id)) {
      this.send(p.connId, { t: 'notice', text: `${getClass(classId).displayName} limit reached for your team.` });
      return;
    }
    p.nextClassId = classId;
    if (classId === p.classId) return;
    // Instant change inside own spawn room or while dead before respawn.
    if (p.alive && this.inSpawnRoom(p, p.team)) {
      this.abilities.removeOwned(p.id);
      this.spawnPlayer(p, true);
    } else if (!p.alive) {
      // applied at respawn
    }
    this.send(p.connId, { t: 'notice', text: p.alive ? `You will respawn as ${getClass(classId).displayName}.` : `Respawning as ${getClass(classId).displayName}.` });
  }

  requestTeam(p, team) {
    if (this.state === MATCH_STATE.ENDED) return;
    if (!canSwitchTeam([...this.players.values()], p.id, team, this.maxPerTeam())) {
      // allow if we can swap with a bot
      const bot = [...this.players.values()].find((q) => q.isBot && q.team === team);
      if (!bot || !isValidTeam(team) || p.team === team) {
        this.send(p.connId, { t: 'notice', text: 'Team change denied: teams would be unbalanced.' });
        return;
      }
      if (bot.alive) this.combat.kill(bot, null, 'world', 0, true);
      bot.team = p.team;
    }
    if (p.alive) this.combat.kill(p, null, 'world', 0, true);
    p.team = team;
    p.respawnAt = this.time + 2;
    this.sendRoster();
  }

  onChat(p, msg) {
    const text = String(msg.text || '').slice(0, 120).replace(/[<>]/g, '');
    if (!text.trim()) return;
    const now = this.time;
    if (p.lastChat && now - p.lastChat < 0.7) return;
    p.lastChat = now;
    for (const q of this.players.values()) {
      if (q.connId === null) continue;
      if (msg.team && q.team !== p.team) continue;
      this.send(q.connId, { t: 'chat', from: p.name, team: p.team, teamOnly: !!msg.team, text, v: p.verified ? 1 : 0 });
    }
    this.opts.audit?.({ ev: 'chat', name: p.name, uid: p.uid || null, verified: !!p.verified, text, teamOnly: !!msg.team });
  }

  onHostCommand(msg) {
    if (msg.action === 'restart') this.changeMap(this.mapId, this.modeId);
    else if (msg.action === 'map' && MAP_IDS.includes(msg.mapId)) this.changeMap(msg.mapId, MODES[msg.mode] ? msg.mode : this.modeId);
    else if (msg.action === 'bots') { this.botFill = Math.max(0, Math.min(16, msg.count | 0)); this.balanceBots(); this.sendRoster(); }
    else if (msg.action === 'end') this.endMatch(this.scores[0] === this.scores[1] ? -1 : this.scores[0] > this.scores[1] ? 0 : 1, 'host');
  }

  // ------------------------------------------------------------------ commands
  onCommands(p, list) {
    if (!Array.isArray(list)) return;
    for (const c of list.slice(0, 30)) {
      if (!Array.isArray(c)) continue;
      const seq = c[0] | 0;
      if (seq <= p.lastSeq || p.cmdQueue.length > 90) continue;
      const cmd = {
        seq,
        dt: Math.min(Math.max(+c[1] || 0, 0), 0.05),
        b: c[2] | 0,
        y: wrapAngle(+c[3] || 0),
        p: Math.max(-1.55, Math.min(1.55, +c[4] || 0)),
        w: c[5] === null || c[5] === undefined ? undefined : c[5] | 0,
        lt: +c[6] || 0,
      };
      if (!Number.isFinite(cmd.y) || !Number.isFinite(cmd.p)) continue;
      p.cmdQueue.push(cmd);
    }
    p.lastCmdTime = this.time;
  }

  moveParams(p) {
    const cls = getClass(p.classId);
    const def = WEAPONS[p.ws.w[p.ws.slot].id];
    let moveMult = 1;
    const wst = p.ws.w[p.ws.slot];
    if (def.spinUp && wst.spin > 0) moveMult *= def.spinMoveMult;
    if (def.scope && p.ws.scoped) moveMult *= def.scope.moveMult;
    if (cls.ability.moveMult && this.abilities.isActive(p, cls.ability.id)) moveMult *= cls.ability.moveMult;
    if (p.rallyUntil > this.time) moveMult *= CLASSES.soldier.ability.rallyMoveMult;
    const frozen = this.state === MATCH_STATE.PREROUND;
    return moveParamsFor(cls, { moveMult, frozen, canSprint: !(def.spinUp && wst.spin > 0) });
  }

  weaponCtx(p) {
    const cls = getClass(p.classId);
    return {
      pid: p.id, alive: p.alive,
      reloadMult: cls.reloadSpeed * (cls.ability.reloadMult && this.abilities.isActive(p, cls.ability.id) ? cls.ability.reloadMult : 1),
      explosiveReloadMult: cls.passive.explosiveReloadMult || 1,
      spreadMult: this.abilities.isActive(p, 'suppression') ? cls.ability.spreadMult : 1,
      hspeed: Math.hypot(p.ms.vx, p.ms.vz), grounded: p.ms.grounded, crouch: p.ms.crouch, sprinting: p.ms.sprinting,
      disarmed: this.state === MATCH_STATE.PREROUND || this.state === MATCH_STATE.ENDED || p.cloak.on || this.time < p.cloak.attackAt,
    };
  }

  processCommands(p) {
    // Movement budget follows real elapsed time, not just ticks: after a stall the server loop skips
    // ticks (to avoid a spiral of death), and counting only ticks would starve the player's input
    // queue until commands were dropped and they could no longer move. Clients still can't send more
    // than real time allows, so speed hacks stay blocked.
    const now = nowMs();
    const real = p.lastProcAt ? Math.min(0.5, (now - p.lastProcAt) / 1000) : TICK_DT;
    p.lastProcAt = now;
    p.cmdBudget = Math.min(p.cmdBudget + Math.max(TICK_DT, real), 0.5);
    let processed = 0;
    while (p.cmdQueue.length && p.cmdBudget > -0.06 && processed < 40) {
      const cmd = p.cmdQueue.shift();
      p.cmdBudget -= cmd.dt;
      processed++;
      this.runCommand(p, cmd);
      p.lastSeq = cmd.seq;
    }
    // an idle player can't bank time for a later burst
    if (!p.cmdQueue.length) p.cmdBudget = Math.min(p.cmdBudget, 0.1);
    // Drop excessive backlog (speed hack / burst protection)
    if (p.cmdQueue.length > 45) p.cmdQueue.splice(0, p.cmdQueue.length - 20);
  }

  runCommand(p, cmd) {
    if (!p.alive) { p.ms.prevButtons = cmd.b; p.ws.prevButtons = cmd.b; return; }
    const params = this.moveParams(p);
    stepMovement(p.ms, cmd, this.world, params);
    p.lagTime = cmd.lt;
    if (p.ms.lastImpact > FALL_DAMAGE_SPEED && !getClass(p.classId).passive.noFallDamage) {
      const dmg = fallDamage(p.ms.lastImpact, FALL_DAMAGE_SPEED, FALL_DAMAGE_PER_MS);
      if (dmg > 0) this.combat.damage(p, dmg, null, 'fall', { noReveal: true });
    }
    if (!p.alive) return;
    if (p.ms.doubleJumped) this.event(['dj', p.id], p.ms);
    // ability (edge)
    const abilityBtn = !!(cmd.b & BTN.ABILITY);
    if (abilityBtn && !p.prevAbilityBtn && this.state !== MATCH_STATE.PREROUND && this.state !== MATCH_STATE.ENDED) this.abilities.use(p);
    p.prevAbilityBtn = abilityBtn;
    // alt-fire edge: detonate sticky bombs / toggle the spy's cloak
    const altBtn = !!(cmd.b & BTN.ALT);
    if (altBtn && !p.prevAltBtn && this.state !== MATCH_STATE.ENDED) {
      if (p.weapons.includes('stickylauncher') && this.projectiles.detonateStickies(p.id) > 0) this.event(['sd', p.id], p.ms);
      if (p.classId === 'spy') this.abilities.toggleCloak(p);
    }
    p.prevAltBtn = altBtn;

    const evs = stepWeapons(p.ws, cmd, this.weaponCtx(p));
    for (const ev of evs) this.handleWeaponEvent(p, ev, cmd);
  }

  handleWeaponEvent(p, ev, cmd) {
    const lt = Math.max(this.time - MAX_LAG_COMP, Math.min(this.time, cmd.lt || this.time));
    switch (ev.type) {
      case 'fire':
        p.firingUntil = this.time + 0.2;
        if (p.disguise && !WEAPONS[p.ws.w[p.ws.slot].id].sapper) this.abilities.reveal(p);
        if (p.spawnProtectUntil > this.time) p.spawnProtectUntil = 0;
        this.combat.fire(p, ev, lt);
        break;
      case 'swing':
        if (p.disguise && WEAPONS[ev.weaponId].melee && !WEAPONS[ev.weaponId].melee.backstab) this.abilities.reveal(p);
        if (p.spawnProtectUntil > this.time) p.spawnProtectUntil = 0;
        this.event(['sw', p.id, ev.weaponId], p.ms, p.id);
        break;
      case 'melee_hit':
        if (p.disguise) this.abilities.reveal(p);
        this.combat.melee(p, ev, lt);
        break;
      case 'beam':
        p.lastBeam = this.time;
        this.combat.beam(p, ev);
        break;
      case 'reload_start': this.event(['rl', p.id], p.ms, p.id); break;
      case 'switch': p.healTarget = -1; this.event(['ws', p.id, ev.slot], p.ms, p.id); break;
      case 'spinup': this.event(['spin', p.id, 1], p.ms, p.id); break;
      case 'spindown': this.event(['spin', p.id, 0], p.ms, p.id); break;
      default:
    }
  }

  // ------------------------------------------------------------------ spawning
  inSpawnRoom(p, team) {
    const { x, y, z } = p.ms;
    for (const r of this.map.spawnRooms) {
      if (r.team !== team) continue;
      if (x >= r.min[0] && x <= r.max[0] && z >= r.min[2] && z <= r.max[2] && y >= r.min[1] - 0.5 && y <= r.max[1] + 0.5) return true;
    }
    return false;
  }

  chooseSpawn(p) {
    const list = this.map.spawns.filter((s) => s.team === p.team);
    let best = list[0], bestScore = -Infinity;
    for (const s of list) {
      let score = Math.random() * 3;
      let blocked = false;
      for (const q of this.players.values()) {
        if (!q.alive || q === p) continue;
        const d = Math.hypot(q.ms.x - s.pos[0], q.ms.y - s.pos[1], q.ms.z - s.pos[2]);
        if (d < 1.0) blocked = true;
        if (q.team !== p.team) score += Math.min(d, 40) * 0.2;
      }
      if (blocked) score -= 100;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  spawnPlayer(p, keepStats = true) {
    if (p.nextClassId && p.nextClassId !== p.classId) {
      this.abilities.removeOwned(p.id);
      p.classId = p.nextClassId;
      this.rosterDirty = true;
    }
    const cls = getClass(p.classId);
    const sp = this.chooseSpawn(p);
    p.ms = createMoveState(sp.pos[0], sp.pos[1], sp.pos[2], sp.yaw);
    p.ms.grounded = true;
    p.weapons = resolveWeapons(p.classId, p.weaponPicks?.[p.classId]);
    p.ws = createWeaponState(cls, 0, p.weapons);
    this.rosterDirty = true;
    p.ws.time = 0;
    p.alive = true;
    p.maxHp = cls.health;
    p.hp = cls.health;
    p.respawnAt = 0;
    p.spawnCount++;
    p.history = [];
    p.cmdQueue = [];
    p.cmdBudget = 0;
    p.spawnProtectUntil = this.time + MATCH_DEFAULTS.spawnProtection;
    p.disguise = null;
    p.burn = null;
    p.healTarget = -1;
    p.revealedUntil = 0;
    p.rallyUntil = 0;
    p.cloak.on = false; p.cloak.meter = 1; p.cloak.attackAt = 0;
    p.ability.activeUntil = 0;
    p.ability.active = false;
    if (p.classId !== 'doctor') p.ability.charge = 0;
    p.damageLog = [];
    p.carrying = -1;
    if (p.bot) p.bot.onSpawn();
    this.event(['sp', p.id, round2(p.ms.x), round2(p.ms.y), round2(p.ms.z)]);
  }

  // ------------------------------------------------------------------ main loop
  tick() {
    const dt = TICK_DT;
    this.time += dt;
    this.tickCount++;

    // ghosts expiry
    for (const [tok, g] of this.ghosts) if (g.until < this.time || (g.untilMs ?? Infinity) < Date.now()) this.ghosts.delete(tok);

    // match state machine
    this.updateMatchState(dt);

    // bots think -> generate commands
    for (const p of this.players.values()) if (p.bot) p.bot.update(dt);

    // commands
    for (const p of this.players.values()) this.processCommands(p);

    // per-player server-side effects
    for (const p of this.players.values()) this.updatePlayer(p, dt);

    this.projectiles.update(dt);
    this.abilities.update(dt);
    this.combat.updateBeams(dt);
    this.mode.update(dt);
    this.updatePickups();

    // record lag-compensation history
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.history.push({ t: this.time, x: p.ms.x, y: p.ms.y, z: p.ms.z, c: p.ms.crouch });
      while (p.history.length && p.history[0].t < this.time - 1) p.history.shift();
    }

    // network output
    this.snapAccum += dt;
    if (this.snapAccum >= 1 / SNAPSHOT_RATE - 1e-6) {
      this.snapAccum -= 1 / SNAPSHOT_RATE;
      this.sendSnapshots();
    }
    this.flushEvents();
    if (this.tickCount % SERVER_TICK_RATE === 0 || this.rosterDirty) {
      this.rosterDirty = false;
      this.sendRoster();
      this.sendPings();
    }
  }

  updateMatchState(dt) {
    switch (this.state) {
      case MATCH_STATE.WARMUP:
        break;
      case MATCH_STATE.PREROUND:
        this.stateTime -= dt;
        if (this.stateTime <= 0) this.startPlaying();
        break;
      case MATCH_STATE.PLAYING:
      case MATCH_STATE.OVERTIME: {
        this.timeLeft -= dt;
        if (this.state === MATCH_STATE.PLAYING) {
          if (this.timeLeft <= 60 && !this.announced.min1) { this.announced.min1 = true; this.event(['ann', 'min1']); }
          if (this.timeLeft <= 0) {
            if (this.scores[0] !== this.scores[1]) this.endMatch(this.scores[0] > this.scores[1] ? 0 : 1, 'time');
            else if (this.modeCfg.overtime) {
              this.state = MATCH_STATE.OVERTIME;
              this.timeLeft = this.modeCfg.overtimeMax;
              this.event(['ann', 'overtime']);
            } else this.endMatch(-1, 'draw');
          }
        } else if (this.timeLeft <= 0) {
          this.endMatch(this.scores[0] === this.scores[1] ? -1 : this.scores[0] > this.scores[1] ? 0 : 1, 'overtime');
        }
        break;
      }
      case MATCH_STATE.ENDED:
        this.stateTime -= dt;
        if (this.stateTime <= 0) this.nextMatch();
        break;
      default:
    }
  }

  addScore(team, n, reason) {
    if (this.state !== MATCH_STATE.PLAYING && this.state !== MATCH_STATE.OVERTIME) return;
    this.scores[team] += n;
    if (this.scores[team] >= this.modeCfg.scoreLimit) this.endMatch(team, 'score');
    else if (this.state === MATCH_STATE.OVERTIME && this.scores[0] !== this.scores[1]) this.endMatch(this.scores[0] > this.scores[1] ? 0 : 1, 'overtime');
  }

  updatePlayer(p, dt) {
    if (!p.alive) {
      if (p.respawnAt > 0 && this.time >= p.respawnAt && this.state !== MATCH_STATE.ENDED && this.state !== MATCH_STATE.WARMUP) this.spawnPlayer(p);
      return;
    }
    const cls = getClass(p.classId);
    // overheal decay
    if (p.hp > p.maxHp) p.hp = Math.max(p.maxHp, p.hp - p.maxHp * 0.08 * dt);
    // burning
    if (p.burn) {
      if (this.time > p.burn.until) p.burn = null;
      else {
        p.burn.acc = (p.burn.acc || 0) + p.burn.dps * dt;
        if (p.burn.acc >= 1) {
          const amt = Math.floor(p.burn.acc);
          p.burn.acc -= amt;
          const attacker = this.players.get(p.burn.attacker) || null;
          this.combat.damage(p, amt, attacker, 'afterburn', { isFire: true, noReveal: true });
          if (!p.alive) return;
        }
      }
    }
    // out of bounds
    if (p.ms.y < this.map.killY) { this.combat.kill(p, null, 'world', 0); return; }
    // spawn room: resupply own, shield vs enemy
    if (this.inSpawnRoom(p, p.team)) {
      if (this.time - p.lastResupply > 1) {
        p.lastResupply = this.time;
        if (p.hp < p.maxHp) p.hp = p.maxHp;
        refillAmmo(p.ws, 1);
        p.burn = null;
      }
    } else if (this.inSpawnRoom(p, otherTeam(p.team))) {
      this.combat.damage(p, MATCH_DEFAULTS.spawnShieldDps * dt, null, 'spawnshield', { raw: true, noReveal: true });
      if (!p.alive) return;
    }
    // stale damage log
    if (p.damageLog.length && p.damageLog[0].t < this.time - MATCH_DEFAULTS.assistWindow) p.damageLog = p.damageLog.filter((d) => d.t >= this.time - MATCH_DEFAULTS.assistWindow);
    // AFK / lost commands: nothing to do (player just stands)
    void cls;
  }

  updatePickups() {
    for (const pk of this.pickups) {
      if (!pk.active) {
        if (this.time >= pk.respawnAt) { pk.active = true; this.event(['pk', pk.idx, 1]); }
        continue;
      }
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const dx = p.ms.x - pk.pos[0], dz = p.ms.z - pk.pos[2], dy = p.ms.y - pk.pos[1];
        if (dx * dx + dz * dz > 1.1 || dy < -0.6 || dy > 1.4) continue;
        const frac = pk.size === 'small' ? 0.25 : pk.size === 'medium' ? 0.5 : 1;
        let used = false;
        if (pk.kind === 'health' && (p.hp < p.maxHp || p.burn)) {
          const amt = Math.min(p.maxHp - p.hp, Math.ceil(p.maxHp * frac));
          p.hp += Math.max(0, amt);
          p.burn = null;
          used = true;
          this.event(['h', p.id, Math.max(0, amt)], null, null, [p.id]);
        } else if (pk.kind === 'ammo' && needsAmmo(p.ws)) {
          refillAmmo(p.ws, frac);
          used = true;
        }
        if (used) {
          pk.active = false;
          pk.respawnAt = this.time + (pk.size === 'large' ? 20 : pk.size === 'medium' ? 14 : 10);
          this.event(['pk', pk.idx, 0, p.id]);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------ lag compensation helpers
  positionAt(p, t) {
    const h = p.history;
    if (!h.length || t >= this.time - 1e-6) return { x: p.ms.x, y: p.ms.y, z: p.ms.z, c: p.ms.crouch };
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) {
        const a = h[i - 1], b = h[i];
        const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: k < 0.5 ? a.c : b.c };
      }
    }
    return { x: p.ms.x, y: p.ms.y, z: p.ms.z, c: p.ms.crouch };
  }

  eyePos(p) {
    return [p.ms.x, p.ms.y + eyeHeight(p.ms), p.ms.z];
  }

  // ------------------------------------------------------------------ networking out
  event(ev, pos = null, exclude = null, only = null) {
    this.events.push({ ev, pos: pos ? [pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]] : null, exclude, only });
  }

  broadcast(msg) {
    for (const p of this.players.values()) if (p.connId !== null) this.send(p.connId, msg);
  }

  flushEvents() {
    if (!this.events.length) return;
    for (const p of this.players.values()) {
      if (p.connId === null) continue;
      const list = [];
      for (const e of this.events) {
        if (e.only && !e.only.includes(p.id)) continue;
        if (e.exclude === p.id) continue;
        if (e.pos && p.alive) {
          const d = Math.hypot(e.pos[0] - p.ms.x, e.pos[2] - p.ms.z);
          if (d > 140) continue; // interest management: out of audible/visible range
        }
        list.push(e.ev);
      }
      if (list.length) this.send(p.connId, { t: 'e', e: list });
    }
    this.events = [];
  }

  playerFlags(q) {
    let f = 0;
    if (q.alive) f |= PF.ALIVE;
    if (q.ms.grounded) f |= PF.GROUNDED;
    if (q.ms.crouch) f |= PF.CROUCH;
    if (q.ms.sprinting) f |= PF.SPRINT;
    if (q.firingUntil > this.time) f |= PF.FIRING;
    const w = q.ws.w[q.ws.slot];
    if (w && w.rel > 0) f |= PF.RELOADING;
    if (q.ability.active) f |= PF.ABILITY;
    if (q.burn) f |= PF.BURNING;
    if (q.disguise) f |= PF.DISGUISED;
    if (q.spawnProtectUntil > this.time) f |= PF.SPAWN_PROTECT;
    if (q.carrying >= 0) f |= PF.CARRIER;
    if (this.abilities.isOvercharged(q)) f |= PF.OVERCHARGED;
    if (q.revealedUntil > this.time) f |= PF.REVEALED;
    if (q.ws.scoped) f |= PF.SCOPED;
    if (q.rallyUntil > this.time) f |= PF.RALLIED;
    if (q.cloak.on) f |= PF.CLOAKED;
    if (w && w.spin > 0) f |= PF.SPUN;
    if (q.healedBy.size && [...q.healedBy.values()].some((t) => this.time - t < 0.3)) f |= PF.HEALED;
    return f;
  }

  sendSnapshots() {
    const players = [...this.players.values()];
    const full = players.map((q) => [
      q.id, round2(q.ms.x), round2(q.ms.y), round2(q.ms.z), round3(q.ms.yaw), round3(q.ms.pitch),
      Math.ceil(q.hp), this.playerFlags(q), q.ws.slot, CLASSES[q.classId].index, q.healTarget,
      q.disguise ? q.disguise.team * 16 + CLASSES[q.disguise.classId].index : -1,
      q.disguise ? q.disguise.fakeId : 0,
    ]);
    const proj = this.projectiles.snapshot();
    const turrets = this.abilities.snapshotTurrets();
    const charges = this.abilities.snapshotCharges();
    const flags = this.mode.snapshot();
    const pickups = this.pickups.filter((p) => !p.active).map((p) => p.idx);
    const common = {
      t: 's', st: round3(this.time), ms: this.state, tl: Math.max(0, Math.round(this.timeLeft * 10) / 10),
      sc: this.scores, pr: proj, tu: turrets, ch: charges, fl: flags, pk: pickups,
      pt: this.state === MATCH_STATE.PREROUND ? Math.round(this.stateTime * 10) / 10 : 0,
    };
    const odd = this.tickCount % 2 === 0;
    for (const p of players) {
      if (p.connId === null) continue;
      // Interest management: distant, occluded players are sent at half rate.
      const eye = this.eyePos(p);
      const plist = [];
      for (let i = 0; i < players.length; i++) {
        const q = players[i];
        if (q !== p && p.alive && q.alive && !odd) {
          const d = Math.hypot(q.ms.x - p.ms.x, q.ms.z - p.ms.z);
          if (d > 45 && !this.world.los(eye, [q.ms.x, q.ms.y + 1.2, q.ms.z])) continue;
        }
        plist.push(full[i]);
      }
      const me = {
        id: p.id, ack: p.lastSeq, sc: p.spawnCount, alive: p.alive, hp: Math.ceil(p.hp), mhp: p.maxHp,
        m: [round3(p.ms.x), round3(p.ms.y), round3(p.ms.z), round3(p.ms.vx), round3(p.ms.vy), round3(p.ms.vz),
          p.ms.grounded ? 1 : 0, p.ms.crouch ? 1 : 0, p.ms.airJumps, round3(p.ms.coyote), round3(p.ms.jumpBuffer), p.ms.prevButtons, round3(p.ms.landTimer), round3(p.ms.airTime), p.ms.blastJump | 0, round3(p.ms.blastLand || 0)],
        w: packWeaponState(p.ws),
        ab: [Math.max(0, round2(p.ability.cdUntil - this.time)), Math.max(0, round2(p.ability.activeUntil - this.time)), round3(p.ability.charge), p.ability.active ? 1 : 0],
        ra: p.alive ? 0 : Math.max(0, round2(p.respawnAt - this.time)),
        ry: p.rallyUntil > this.time ? round2(p.rallyUntil - this.time) : 0,
        ck: p.classId === 'spy' ? [round2(p.cloak.meter), p.cloak.on ? 1 : 0, Math.max(0, round2(p.cloak.attackAt - this.time))] : null,
        cls: p.classId, ncls: p.nextClassId, team: p.team, carry: p.carrying, wp: p.weapons,
      };
      this.send(p.connId, { ...common, p: plist, me });
    }
  }

  sendRoster() {
    const list = [...this.players.values()].map((p) => ({
      id: p.id, name: p.name, team: p.team, cls: p.classId, bot: p.isBot, k: p.stats.kills, d: p.stats.deaths,
      a: p.stats.assists, s: p.stats.score, cap: p.stats.captures, dmg: Math.round(p.stats.damage), heal: Math.round(p.stats.healing),
      ping: p.isBot ? 0 : p.ping, alive: p.alive, v: p.verified ? 1 : 0, cos: wornBy(p), wp: p.weapons, host: p.connId !== null && p.connId === this.hostConn,
    }));
    this.broadcast({ t: 'r', players: list, room: this.roomName, mapId: this.mapId, mode: this.modeId, botFill: this.botFill });
  }

  sendPings() {
    for (const p of this.players.values()) {
      if (p.connId === null) continue;
      p.pingN = (p.pingN + 1) % 1000;
      p.pingSent = Date.now();
      this.send(p.connId, { t: 'ping', n: p.pingN });
    }
  }

  info() {
    return {
      room: this.roomName, mapId: this.mapId, mode: this.modeId, players: this.humanCount(), bots: this.players.size - this.humanCount(),
      maxPlayers: this.maxPlayers, state: this.state, scores: this.scores, timeLeft: Math.round(this.timeLeft),
    };
  }
}

function randomToken() {
  let s = '';
  for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
  return s;
}

export { PLAYER_HEIGHT, TICK_DT };
