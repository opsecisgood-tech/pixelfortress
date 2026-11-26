// Round-end key rewards. Pure and deterministic; the game SERVER calls this when a match ends and sends
// the result to clients (clients never decide or claim rewards).
//
// Rules:
//  - Only kills of real players by real players count. Bots (and turrets' bot owners, environment,
//    self/team kills) never count, as killer or victim.
//  - Anti-farming: a killer/victim pair counts at most PAIR_CAP times, one victim at most VICTIM_CAP
//    times for the team, and the team must have killed at least MIN_DISTINCT_VICTIMS different players.
//  - The winning team qualifies with at least TEAM_KILLS_REQUIRED counted kills in a match that ran at
//    least MIN_MATCH_SECONDS. Draws earn nothing.
//  - Eligible players: humans on the winning team who were in the match for MIN_PRESENCE_SECONDS or
//    got a counted kill.
//  - Keys per eligible player: 1, +1 if the team reached BONUS_TEAM_KILLS, +1 for PERSONAL_KILLS
//    counted kills of their own (max 3).
export const KEY_RULES = {
  TEAM_KILLS_REQUIRED: 10,
  BONUS_TEAM_KILLS: 20,
  PERSONAL_KILLS: 4,
  PAIR_CAP: 3,
  VICTIM_CAP: 5,
  MIN_DISTINCT_VICTIMS: 2,
  MIN_MATCH_SECONDS: 90,
  MIN_PRESENCE_SECONDS: 60,
  MAX_KEYS: 3,
};

/**
 * @param kills   [{ killer, victim, team }] - only kills between two human players on opposite teams,
 *                recorded by the server while the match was live
 * @param players [{ id, team, isBot, presence }] - presence = seconds in this match
 * @param winner  winning team (0/1) or -1 for a draw
 * @param duration match seconds
 * @returns { teams: [{ counted, distinctVictims, qualified }], keys: { [playerId]: n } }
 */
export function computeKeyRewards({ kills, players, winner, duration }, R = KEY_RULES) {
  const human = new Map(players.filter((p) => !p.isBot).map((p) => [p.id, p]));
  const teams = [0, 1].map(() => ({ counted: 0, distinctVictims: 0, qualified: false }));
  const perPlayer = new Map();
  const pairCount = new Map(), victimCount = [new Map(), new Map()], victims = [new Set(), new Set()];
  for (const k of kills) {
    const killer = human.get(k.killer), victim = human.get(k.victim);
    // both must be humans known to the server, on opposite teams, and the credited team must match
    if (!killer || !victim || killer.id === victim.id) continue;
    if (k.team !== 0 && k.team !== 1) continue;
    if (k.killerTeam !== undefined && k.killerTeam === k.victimTeam) continue;
    const pk = `${k.killer}>${k.victim}`;
    const pc = pairCount.get(pk) || 0;
    if (pc >= R.PAIR_CAP) continue;
    const vc = victimCount[k.team].get(k.victim) || 0;
    if (vc >= R.VICTIM_CAP) continue;
    pairCount.set(pk, pc + 1);
    victimCount[k.team].set(k.victim, vc + 1);
    victims[k.team].add(k.victim);
    teams[k.team].counted++;
    perPlayer.set(k.killer, (perPlayer.get(k.killer) || 0) + 1);
  }
  for (const t of [0, 1]) {
    teams[t].distinctVictims = victims[t].size;
    teams[t].qualified = winner === t && duration >= R.MIN_MATCH_SECONDS
      && teams[t].counted >= R.TEAM_KILLS_REQUIRED && victims[t].size >= R.MIN_DISTINCT_VICTIMS;
  }
  const keys = {};
  if (winner === 0 || winner === 1) {
    const T = teams[winner];
    if (T.qualified) {
      for (const p of human.values()) {
        if (p.team !== winner) continue;
        const own = perPlayer.get(p.id) || 0;
        if ((p.presence || 0) < R.MIN_PRESENCE_SECONDS && own === 0) continue;
        let n = 1;
        if (T.counted >= R.BONUS_TEAM_KILLS) n++;
        if (own >= R.PERSONAL_KILLS) n++;
        keys[p.id] = Math.min(R.MAX_KEYS, n);
      }
    }
  }
  return { teams, keys };
}
