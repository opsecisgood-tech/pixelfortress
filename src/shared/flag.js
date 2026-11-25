// Capture-the-Flag flag state machine. Pure logic: callers supply players and receive events.
// States: AT_BASE -> CARRIED -> (DROPPED -> RETURNING -> AT_BASE) | CAPTURED -> AT_BASE
import { FLAG_STATE } from './constants.js';

export class Flag {
  constructor(team, basePos, opts = {}) {
    this.team = team;
    this.base = [...basePos];
    this.pos = [...basePos];
    this.state = FLAG_STATE.AT_BASE;
    this.carrier = -1;
    this.dropTimer = 0;
    this.returnProgress = 0;
    this.capturedTimer = 0;
    this.dropReturnTime = opts.dropReturnTime ?? 25;
    this.returnTouchTime = opts.returnTouchTime ?? 2.5;
    this.pickupRadius = opts.pickupRadius ?? 1.3;
  }

  get available() {
    return this.state === FLAG_STATE.AT_BASE || this.state === FLAG_STATE.DROPPED || this.state === FLAG_STATE.RETURNING;
  }

  // Try a pickup by an enemy player. Returns event or null.
  tryPickup(player) {
    if (!player.alive) return null;
    if (player.team === this.team) return null;
    if (!this.available) return null;
    if (player.carrying !== undefined && player.carrying !== -1) return null;
    const from = this.state;
    this.state = FLAG_STATE.CARRIED;
    this.carrier = player.id;
    this.returnProgress = 0;
    this.dropTimer = 0;
    return { type: 'pickup', team: this.team, player: player.id, fromBase: from === FLAG_STATE.AT_BASE };
  }

  // Carrier eliminated or disconnected: drop at a valid location.
  drop(pos) {
    if (this.state !== FLAG_STATE.CARRIED) return null;
    const by = this.carrier;
    this.state = FLAG_STATE.DROPPED;
    this.carrier = -1;
    this.pos = [...pos];
    this.dropTimer = this.dropReturnTime;
    this.returnProgress = 0;
    return { type: 'drop', team: this.team, player: by };
  }

  // Update while carried: follow carrier.
  follow(pos) {
    if (this.state === FLAG_STATE.CARRIED) this.pos = [pos[0], pos[1], pos[2]];
  }

  /**
   * Tick dropped/returning logic.
   * defendersTouching: array of alive teammate ids within pickup radius of the dropped flag
   * attackersTouching: array of alive enemy ids within radius (contest blocks return)
   */
  update(dt, defendersTouching = [], attackersTouching = []) {
    if (this.state === FLAG_STATE.CAPTURED) {
      this.capturedTimer -= dt;
      if (this.capturedTimer <= 0) return this.resetToBase('reset');
      return null;
    }
    if (this.state !== FLAG_STATE.DROPPED && this.state !== FLAG_STATE.RETURNING) return null;
    this.dropTimer -= dt;
    if (this.dropTimer <= 0) return this.resetToBase('timeout');
    if (defendersTouching.length > 0 && attackersTouching.length === 0) {
      this.state = FLAG_STATE.RETURNING;
      this.returnProgress += (dt / this.returnTouchTime) * Math.min(3, defendersTouching.length);
      if (this.returnProgress >= 1) {
        const ev = this.resetToBase('returned');
        ev.player = defendersTouching[0];
        return ev;
      }
    } else {
      if (this.state === FLAG_STATE.RETURNING) this.state = FLAG_STATE.DROPPED;
      this.returnProgress = Math.max(0, this.returnProgress - dt * 0.5);
    }
    return null;
  }

  // Capture: carrier must be holding this flag and their own flag must be at base.
  canCapture(carrierId, ownFlag) {
    return this.state === FLAG_STATE.CARRIED && this.carrier === carrierId && ownFlag.state === FLAG_STATE.AT_BASE;
  }

  capture() {
    const by = this.carrier;
    this.state = FLAG_STATE.CAPTURED;
    this.carrier = -1;
    this.capturedTimer = 0.1;
    this.pos = [...this.base];
    return { type: 'capture', team: this.team, player: by };
  }

  resetToBase(reason) {
    this.state = FLAG_STATE.AT_BASE;
    this.carrier = -1;
    this.pos = [...this.base];
    this.dropTimer = 0;
    this.returnProgress = 0;
    return { type: 'return', team: this.team, reason, player: -1 };
  }
}
