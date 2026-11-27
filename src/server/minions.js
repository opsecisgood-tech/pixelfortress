// Soul-Stealer minions. A player killed by the Soul-Stealer Shotgun rises again where they fell as the
// killer's minion: on the killer's team, with no control over their own character. While nobody drives
// them they fight on their own (bot brain). The holder takes direct control with K / L (cycling through
// "yourself" and every minion) and frees the one they are driving with J (J with nobody driven frees all).
// Minions are freed when they die, when the holder dies, leaves or loses the shotgun, and on a new map.
import { BotController } from './bots/Bot.js';
import { MATCH_STATE } from '../shared/constants.js';
import { round2 } from '../shared/math.js';

const RISE_DELAY = 1.0;   // seconds between the kill and the minion rising

export class Minions {
  constructor(game) {
    this.g = game;
  }

  holderOf(m) { return m && m.minionOf != null ? this.g.players.get(m.minionOf) || null : null; }

  // The minion the holder is driving right now (or null).
  controlled(h) {
    if (!h || !h.soul || h.soul.ctl < 0) return null;
    const m = this.g.players.get(h.soul.ctl);
    return m && m.alive && m.minionOf === h.id ? m : null;
  }

  isDriven(m) { const h = this.holderOf(m); return !!h && h.soul?.ctl === m.id; }

  // Players with no say over their own character (their client stops predicting).
  locked(p) { return p.minionOf != null || (p.soul ? p.soul.ctl >= 0 : false); }

  list(h) { return h.soul ? h.soul.list.map((id) => this.g.players.get(id)).filter((m) => m && m.minionOf === h.id) : []; }

  notice(p, text) { if (p && p.connId !== null) this.g.send(p.connId, { t: 'notice', text }); }

  // Tell the holder's client who it is driving, with that body's facing and slot (so the view and the
  // weapon don't jump), or its own body's when control comes back.
  sendCtl(h) {
    if (h.connId === null) return;
    const m = this.controlled(h);
    const b = m || h;
    this.g.send(h.connId, { t: 'mctl', c: m ? m.id : -1, y: round2(b.ms.yaw), p: round2(b.ms.pitch), s: b.ws.slot });
  }

  // ---------------------------------------------------------------- capture
  onKill(killer, victim, weaponId, burnSrc) {
    const g = this.g;
    if (victim.minionOf != null) this.free(victim, true);
    if (victim.soul) this.releaseAll(victim, 'died');
    const stolen = weaponId === 'soulstealer' || (weaponId === 'afterburn' && burnSrc === 'soulstealer');
    if (!stolen || !killer || killer === victim || !killer.alive || !killer.weapons?.includes('soulstealer')) return;
    if (g.state === MATCH_STATE.ENDED) return;
    victim.pendingSoul = { holder: killer.id, at: g.time + RISE_DELAY, x: victim.ms.x, y: victim.ms.y, z: victim.ms.z, yaw: victim.ms.yaw };
    victim.respawnAt = 0; // stays down until it rises
    g.event(['ss', killer.id, victim.id, round2(victim.ms.x), round2(victim.ms.y + 1.1), round2(victim.ms.z)]);
    this.notice(victim, `${killer.name} stole your soul. You will rise as their minion.`);
  }

  rise(v, h) {
    const g = this.g;
    const at = v.pendingSoul;
    v.pendingSoul = null;
    if (v.origTeam == null) v.origTeam = v.team;
    v.team = h.team;
    v.minionOf = h.id;
    g.spawnPlayer(v);
    v.ms.x = at.x; v.ms.y = at.y + 0.05; v.ms.z = at.z; v.ms.yaw = at.yaw;
    v.ms.vx = v.ms.vy = v.ms.vz = 0;
    v.spawnYaw = at.yaw;
    v.history = [];
    v.cmdQueue = [];
    v.spawnProtectUntil = g.time + 1;
    if (!v.bot) {
      const brain = new BotController(g, v);
      brain.yaw = v.ms.yaw;
      brain.role = 'attack';
      v.minionBrain = brain;
    } else { v.bot.path = null; v.bot.goal = null; v.bot.target = null; v.bot.yaw = v.ms.yaw; }
    h.soul ||= { list: [], ctl: -1 };
    if (!h.soul.list.includes(v.id)) h.soul.list.push(v.id);
    g.rosterDirty = true;
    g.event(['sm', h.id, v.id, 1, round2(at.x), round2(at.y + 1), round2(at.z)]);
    this.notice(v, `You are ${h.name}'s minion. You get your character back when they free you or you die.`);
    this.notice(h, `${v.name} is now your minion. K / L: take control (cycle) · J: free.`);
  }

  // ---------------------------------------------------------------- release
  free(m, died = false) {
    const g = this.g;
    const h = this.holderOf(m);
    if (h?.soul) {
      h.soul.list = h.soul.list.filter((id) => id !== m.id);
      if (h.soul.ctl === m.id) { h.soul.ctl = -1; this.sendCtl(h); }
      if (!died) this.notice(h, `You freed ${m.name}.`);
    }
    if (m.origTeam != null) m.team = m.origTeam;
    m.origTeam = null;
    m.minionOf = null;
    m.minionBrain = null;
    m.cmdQueue = [];
    if (m.bot) { m.bot.path = null; m.bot.goal = null; m.bot.target = null; }
    // a freed minion who is still alive gets their own character back right where it stands
    if (!died && m.alive) { m.spawnCount++; m.spawnYaw = m.ms.yaw; }
    g.rosterDirty = true;
    g.event(['sm', h ? h.id : -1, m.id, 0, round2(m.ms.x), round2(m.ms.y + 1), round2(m.ms.z)]);
    if (!died) this.notice(m, 'You were freed. Your character is yours again.');
  }

  releaseAll(h, why) {
    if (!h.soul) return;
    const ms = this.list(h);
    h.soul.ctl = -1;
    for (const m of ms) this.free(m, false);
    h.soul = null;
    if (ms.length && why === 'weapon') this.notice(h, 'Your minions were freed.');
    this.sendCtl(h);
  }

  // Holder (or a minion) left the match.
  onLeave(p) {
    for (const q of this.g.players.values()) if (q.pendingSoul?.holder === p.id) this.cancelPending(q);
    if (p.soul) this.releaseAll(p, 'left');
    if (p.minionOf != null) {
      const h = this.holderOf(p);
      if (h?.soul) { h.soul.list = h.soul.list.filter((id) => id !== p.id); if (h.soul.ctl === p.id) { h.soul.ctl = -1; this.sendCtl(h); } }
      if (p.origTeam != null) p.team = p.origTeam;
      p.minionOf = null; p.origTeam = null; p.minionBrain = null;
    }
  }

  cancelPending(v) {
    v.pendingSoul = null;
    v.respawnAt = this.g.time + 1;
    this.g.mode.onPlayerDeath(v, null); // duels keep the dead down until the next round
  }

  // New map / restart: everyone gets their character and team back.
  reset() {
    for (const p of this.g.players.values()) {
      if (p.minionOf != null) { if (p.origTeam != null) p.team = p.origTeam; p.minionOf = null; p.origTeam = null; p.minionBrain = null; }
      p.soul = null;
      p.pendingSoul = null;
    }
  }

  // ---------------------------------------------------------------- holder input
  onMessage(h, msg) {
    if (!h.alive) return;
    const ms = this.list(h).filter((m) => m.alive);
    if (msg.a === 'free') {
      const m = this.controlled(h);
      if (m) this.free(m);
      else if (ms.length) this.releaseAll(h, 'manual');
      return;
    }
    if (msg.a !== 'next' && msg.a !== 'prev') return;
    if (!ms.length) { this.notice(h, 'You have no minions. Kill someone with the Soul-Stealer Shotgun.'); return; }
    const opts = [-1, ...ms.map((m) => m.id)];
    const cur = Math.max(0, opts.indexOf(h.soul.ctl));
    const next = opts[(cur + (msg.a === 'next' ? 1 : -1) + opts.length) % opts.length];
    this.setCtl(h, next);
  }

  setCtl(h, id) {
    const prev = this.controlled(h);
    h.soul.ctl = id;
    const m = this.controlled(h);
    if (prev && prev !== m) { prev.cmdQueue = []; if (prev.bot) { prev.bot.path = null; prev.bot.yaw = prev.ms.yaw; } if (prev.minionBrain) prev.minionBrain.yaw = prev.ms.yaw; }
    if (m) m.cmdQueue = [];
    this.sendCtl(h);
  }

  // Run one input command from a holder. Returns false when it is an ordinary command for their own body.
  // Each command says which body the client meant it for (cmd.c), so commands still in flight from before
  // a switch never yank the newly driven body around.
  run(h, cmd) {
    const m = this.controlled(h);
    const c = cmd.c ?? -1;
    if (!m && c < 0 && !(h.soul && h.soul.ctl >= 0)) return false;
    // the holder's own body just stands there (still under gravity) while they drive a minion
    this.g.runCommand(h, { seq: cmd.seq, dt: cmd.dt, b: 0, y: h.ms.yaw, p: h.ms.pitch, w: undefined, lt: cmd.lt });
    if (m && c === m.id) this.g.runCommand(m, cmd);
    return true;
  }

  // ---------------------------------------------------------------- per tick
  update(dt) {
    const g = this.g;
    for (const p of g.players.values()) {
      // souls waiting to rise
      if (p.pendingSoul && g.time >= p.pendingSoul.at) {
        const h = g.players.get(p.pendingSoul.holder);
        if (!h || !h.alive || g.state === MATCH_STATE.ENDED) this.cancelPending(p);
        else this.rise(p, h);
      }
      // holders who lost the shotgun let their minions go; a dead driven minion hands control back
      if (p.soul) {
        if (!p.weapons?.includes('soulstealer')) this.releaseAll(p, 'weapon');
        else if (p.soul.ctl >= 0 && !this.controlled(p)) { p.soul.ctl = -1; this.sendCtl(p); }
      }
    }
  }

  // Undriven human minions fight on their own (bots keep their normal brain).
  think(dt) {
    const g = this.g;
    for (const m of g.players.values()) {
      if (m.minionOf == null || !m.alive) continue;
      if (this.isDriven(m)) { m.cmdQueue.length = 0; continue; }
      if (!m.minionBrain) continue;
      const keep = m.cmdQueue;
      m.cmdQueue = [];
      m.minionBrain.update(dt);
      const cmds = m.cmdQueue;
      m.cmdQueue = keep;
      for (const c of cmds) g.runCommand(m, c);
    }
  }

  // Snapshot fields for one player.
  me(p) {
    const out = {};
    if (p.minionOf != null) out.mb = p.minionOf;
    if (p.soul && p.soul.list.length) {
      out.mn = {
        c: p.soul.ctl,
        l: this.list(p).map((m) => {
          const w = m.ws.w[m.ws.slot];
          return [m.id, Math.ceil(m.hp), m.maxHp, m.alive ? 1 : 0, m.ws.slot, w ? w.clip : 0, w ? w.reserve : 0];
        }),
      };
    }
    if (this.locked(p)) out.lock = 1;
    return out;
  }
}
