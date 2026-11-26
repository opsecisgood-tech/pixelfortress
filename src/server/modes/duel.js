// Duel (1v1 / 2v2): round-based elimination. Everyone spawns at the start of a round and nobody respawns
// until it ends. The last team with someone alive takes the round (one team point); first to the score
// limit wins the match. A round that runs out of time goes to the team with more health left (draw if
// equal). The match waits (free play, quick respawns) until both teams have teamSize players, and a team
// that empties mid-match forfeits.
import { MATCH_STATE } from '../../shared/constants.js';

export class Duel {
  constructor(game) {
    this.g = game;
    this.id = game.modeId;
    this.phase = 'wait';   // wait | fight | break
    this.round = 0;
    this.timer = 0;
    this.waitAnnounce = 0;
  }

  teamSize() { return this.g.modeCfg.teamSize || 1; }
  counts() {
    const c = [0, 0], alive = [0, 0];
    for (const p of this.g.players.values()) { c[p.team]++; if (p.alive) alive[p.team]++; }
    return { c, alive };
  }
  ready() { const { c } = this.counts(); return c[0] >= this.teamSize() && c[1] >= this.teamSize(); }
  live() { return this.g.state === MATCH_STATE.PLAYING || this.g.state === MATCH_STATE.OVERTIME; }

  // called by ServerGame.startPreRound (new match)
  reset() {
    this.round = 0;
    this.timer = 0;
    this.phase = this.ready() ? 'pre' : 'wait';
  }

  // called by ServerGame.startPlaying (pre-round countdown finished)
  onStart() {
    if (this.phase === 'wait') return;
    this.startRound();
  }

  startRound() {
    const g = this.g;
    this.round++;
    this.phase = 'fight';
    this.timer = g.modeCfg.roundTime;
    g.projectiles.clear();
    g.abilities.clear();
    for (const p of g.players.values()) g.spawnPlayer(p);
    g.event(['ann', 'round', this.round, g.scores[0], g.scores[1]]);
  }

  endRound(winner, why) {
    const g = this.g;
    this.phase = 'break';
    this.timer = g.modeCfg.roundBreak;
    g.event(['ann', 'roundwin', winner, this.round, why]);
    if (winner === 0 || winner === 1) g.addScore(winner, 1, 'round'); // may end the match
  }

  onKill() {}
  onPlayerDeath(victim) {
    // inside a round the dead stay dead until the next round; otherwise (waiting / pre-round) respawn quickly
    if (this.phase === 'fight' || this.phase === 'break') victim.respawnAt = 0;
  }
  onPlayerLeave(p) {
    const g = this.g;
    if (!this.live() || this.phase === 'wait') return;
    // the leaving player is still in g.players here
    const c = [0, 0];
    for (const q of g.players.values()) if (q !== p) c[q.team]++;
    if (c[p.team] === 0 && c[1 - p.team] > 0) g.endMatch(1 - p.team, 'forfeit');
  }

  update(dt) {
    const g = this.g;
    if (g.state === MATCH_STATE.ENDED || g.state === MATCH_STATE.WARMUP) return;
    if (this.phase === 'wait') {
      // hold the clock until both sides are full, then start a fresh match
      g.timeLeft = g.modeCfg.duration;
      if (g.state === MATCH_STATE.PREROUND) g.stateTime = g.modeCfg.preRound;
      for (const p of g.players.values()) if (!p.alive && p.respawnAt === 0) p.respawnAt = g.time + g.modeCfg.respawnDelay;
      if (this.ready()) { g.startPreRound(); return; }
      this.waitAnnounce -= dt;
      if (this.waitAnnounce <= 0) {
        this.waitAnnounce = 8;
        const { c } = this.counts();
        g.event(['ann', 'duelwait', c[0] + c[1], this.teamSize() * 2]);
      }
      return;
    }
    if (this.phase === 'pre' && !this.ready()) { this.phase = 'wait'; return; }
    if (!this.live()) return;
    if (this.phase === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
      return;
    }
    if (this.phase !== 'fight') return;
    const { c, alive } = this.counts();
    if (c[0] === 0 || c[1] === 0) return; // forfeit is handled on leave
    if (alive[0] === 0 || alive[1] === 0) { this.endRound(alive[0] > 0 ? 0 : alive[1] > 0 ? 1 : -1, 'elim'); return; }
    this.timer -= dt;
    if (this.timer <= 0) {
      const hp = [0, 1].map((t) => [...g.players.values()].filter((p) => p.team === t && p.alive).reduce((s, p) => s + p.hp / p.maxHp, 0));
      this.endRound(Math.abs(hp[0] - hp[1]) < 0.01 ? -1 : hp[0] > hp[1] ? 0 : 1, 'time');
    }
  }

  snapshot() { return null; }
  info() { return { phase: this.phase, round: this.round, roundLeft: Math.max(0, Math.round(this.timer)) }; }
}
