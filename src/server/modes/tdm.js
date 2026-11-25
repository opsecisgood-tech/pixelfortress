// Team Deathmatch: every valid enemy elimination = 1 team point. First to limit wins.
export class TeamDeathmatch {
  constructor(game) {
    this.g = game;
    this.id = 'tdm';
  }
  reset() {}
  onKill(killer, victim) {
    if (killer.team === victim.team) return;
    this.g.addScore(killer.team, this.g.modeCfg.scorePerKill, 'kill');
  }
  onPlayerDeath() {}
  onPlayerLeave() {}
  update() {}
  snapshot() { return null; }
}
