// Capture the Flag: server-validated pickups, drops, returns and captures using the shared Flag state machine.
import { Flag } from '../../shared/flag.js';
import { FLAG_STATE, otherTeam } from '../../shared/constants.js';
import { SCORE_VALUES } from '../../shared/config/modes.js';
import { round2 } from '../../shared/math.js';

export class CaptureTheFlag {
  constructor(game) {
    this.g = game;
    this.id = 'ctf';
    this.reset();
  }

  reset() {
    const cfg = this.g.modeCfg;
    this.flags = [0, 1].map((t) => new Flag(t, this.g.map.flags[t], {
      dropReturnTime: cfg.flagDropReturnTime, returnTouchTime: cfg.flagReturnTouchTime, pickupRadius: cfg.flagPickupRadius,
    }));
  }

  emit(ev) {
    if (!ev) return;
    this.g.event(['fl', ev.type, ev.team, ev.player ?? -1, ev.reason || '']);
  }

  onKill(killer, victim) {
    // defense credit: killing the carrier of your flag, or an enemy near your flag
    const myFlag = this.flags[killer.team];
    const near = Math.hypot(victim.ms.x - myFlag.pos[0], victim.ms.z - myFlag.pos[2]) < 10;
    if (victim.carrying === killer.team || near) {
      killer.stats.defenses++;
      killer.stats.score += SCORE_VALUES.defense;
    }
  }

  onPlayerDeath(victim) {
    this.dropFrom(victim);
  }

  onPlayerLeave(p) {
    this.dropFrom(p);
  }

  dropFrom(p) {
    if (p.carrying === undefined || p.carrying < 0) return;
    const flag = this.flags[p.carrying];
    p.carrying = -1;
    // drop at a valid location: on the floor beneath the carrier
    const floor = this.g.world.floorBelow(p.ms.x, p.ms.z, p.ms.y + 1, 0.3);
    let pos = [p.ms.x, Number.isFinite(floor) ? floor : p.ms.y, p.ms.z];
    if (!Number.isFinite(floor) || pos[1] < this.g.map.killY + 2) pos = [...flag.base];
    this.emit(flag.drop(pos));
  }

  update(dt) {
    const g = this.g;
    const radius = g.modeCfg.flagPickupRadius;
    const capR = g.modeCfg.captureRadius;
    const live = g.state === 'playing' || g.state === 'overtime';
    for (const flag of this.flags) {
      if (flag.state === FLAG_STATE.CARRIED) {
        const c = g.players.get(flag.carrier);
        if (!c || !c.alive) { if (c) this.dropFrom(c); else this.emit(flag.resetToBase('lost')); continue; }
        flag.follow([c.ms.x, c.ms.y, c.ms.z]);
        // capture check: carrier on own flag base while own flag at base
        const own = this.flags[c.team];
        const d = Math.hypot(c.ms.x - own.base[0], c.ms.z - own.base[2]);
        if (d <= capR && Math.abs(c.ms.y - own.base[1]) < 2 && flag.canCapture(c.id, own) && live) {
          const ev = flag.capture();
          c.carrying = -1;
          c.stats.captures++;
          c.stats.score += SCORE_VALUES.capture;
          this.emit(ev);
          g.addScore(c.team, 1, 'capture');
          if (c.bot) c.bot.onCapture();
        }
        continue;
      }
      const defenders = [], attackers = [];
      for (const p of g.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.ms.x - flag.pos[0], p.ms.z - flag.pos[2]);
        if (d > radius || Math.abs(p.ms.y - flag.pos[1]) > 1.8) continue;
        if (p.team === flag.team) defenders.push(p.id); else attackers.push(p);
      }
      // pickup by an enemy (disguise is dropped)
      if (live && flag.available && attackers.length) {
        const p = attackers.find((a) => a.carrying < 0);
        if (p) {
          const ev = flag.tryPickup({ id: p.id, alive: p.alive, team: p.team, carrying: p.carrying });
          if (ev) {
            p.carrying = flag.team;
            if (p.disguise) g.abilities.reveal(p);
            p.stats.pickups++;
            p.stats.score += SCORE_VALUES.flagPickup;
            this.emit(ev);
            continue;
          }
        }
      }
      const ev = flag.update(dt, defenders, attackers.map((a) => a.id));
      if (ev) {
        if (ev.reason === 'returned' && ev.player >= 0) {
          const r = g.players.get(ev.player);
          if (r) { r.stats.returns++; r.stats.score += SCORE_VALUES.flagReturn; }
        }
        this.emit(ev);
      }
    }
  }

  snapshot() {
    return this.flags.map((f) => [f.team, f.state, round2(f.pos[0]), round2(f.pos[1]), round2(f.pos[2]), f.carrier, round2(f.returnProgress), Math.max(0, Math.round(f.dropTimer))]);
  }

  // helpers for bots
  enemyFlag(team) { return this.flags[otherTeam(team)]; }
  ownFlag(team) { return this.flags[team]; }
}
