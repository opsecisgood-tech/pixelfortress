// Team assignment and balancing rules (pure functions, unit tested).
import { TEAM } from './constants.js';

/**
 * Choose a team for a joining player.
 * players: array of { team, isBot, score }
 * maxPerTeam: cap per team
 * Returns 0 (RED), 1 (BLUE) or -1 if the room is full.
 */
export function chooseTeam(players, maxPerTeam, preferred = -1) {
  const humans = [0, 0], total = [0, 0], score = [0, 0];
  for (const p of players) {
    if (p.team !== 0 && p.team !== 1) continue;
    total[p.team]++;
    if (!p.isBot) humans[p.team]++;
    score[p.team] += p.score || 0;
  }
  const canJoin = (t) => total[t] < maxPerTeam;
  if (!canJoin(0) && !canJoin(1)) return -1;
  if ((preferred === 0 || preferred === 1) && canJoin(preferred) && total[preferred] <= total[1 - preferred]) return preferred;
  if (!canJoin(0)) return 1;
  if (!canJoin(1)) return 0;
  if (total[0] !== total[1]) return total[0] < total[1] ? TEAM.RED : TEAM.BLUE;
  // Equal size: balance on human count, then on score (weaker team gets the player).
  if (humans[0] !== humans[1]) return humans[0] < humans[1] ? TEAM.RED : TEAM.BLUE;
  if (score[0] !== score[1]) return score[0] < score[1] ? TEAM.RED : TEAM.BLUE;
  return TEAM.RED;
}

export function isValidTeam(t) {
  return t === 0 || t === 1;
}

// Can a player switch to `target` team? Prevents stacking.
export function canSwitchTeam(players, playerId, target, maxPerTeam) {
  if (!isValidTeam(target)) return false;
  const me = players.find((p) => p.id === playerId);
  if (!me || me.team === target) return false;
  const counts = [0, 0];
  for (const p of players) if (isValidTeam(p.team) && p.id !== playerId) counts[p.team]++;
  if (counts[target] >= maxPerTeam) return false;
  // would the switch make teams uneven by more than one?
  return counts[target] + 1 - counts[1 - target] <= 1;
}

// Which team should lose a bot when a human joins (keep teams even).
export function teamToTrimBot(players) {
  const counts = [0, 0];
  for (const p of players) if (isValidTeam(p.team)) counts[p.team]++;
  return counts[0] >= counts[1] ? 0 : 1;
}

// Check class limit for a team.
export function classAllowed(players, team, classId, limit, exceptId) {
  if (!limit) return true;
  let n = 0;
  for (const p of players) if (p.team === team && p.classId === classId && p.id !== exceptId) n++;
  return n < limit;
}
