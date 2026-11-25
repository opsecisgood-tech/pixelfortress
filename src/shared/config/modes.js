// Game mode configuration (single source of truth).

export const MODES = {
  tdm: {
    id: 'tdm',
    name: 'Team Deathmatch',
    short: 'TDM',
    description: 'Two teams, one goal: eliminate the enemy. First team to the score limit — or ahead when time runs out — wins.',
    scoreLimit: 100,
    duration: 8 * 60,
    respawnDelay: 4,
    friendlyFire: false,
    overtime: true,
    overtimeMax: 120,
    maxPlayers: 16,
    preRound: 5,
    scorePerKill: 1,
  },
  ctf: {
    id: 'ctf',
    name: 'Capture the Flag',
    short: 'CTF',
    description: 'Steal the enemy intel and bring it home while your own flag is safe at base. First to 5 captures wins.',
    scoreLimit: 5,
    duration: 12 * 60,
    respawnDelay: 6,
    friendlyFire: false,
    overtime: true,
    overtimeMax: 180,
    maxPlayers: 16,
    preRound: 5,
    flagDropReturnTime: 25,      // seconds a dropped flag waits before auto-return
    flagReturnTouchTime: 2.5,    // seconds a defender must stand on dropped flag to return it
    flagPickupRadius: 1.3,
    captureRadius: 2.2,
  },
};

export const SCORE_VALUES = {
  kill: 2,
  assist: 1,
  capture: 5,
  flagPickup: 1,
  flagReturn: 2,
  defense: 1,          // killing an enemy near your flag / killing the enemy carrier
  healPerPoint: 250,   // hp healed per point
  turretKill: 1,
  damagePerPoint: 500,
};

export const BOT_FILL_OPTIONS = [0, 4, 6, 8, 12];

export const MATCH_DEFAULTS = {
  endScreenTime: 15,
  spawnProtection: 2.5,
  spawnShieldDps: 60,
  assistWindow: 10,
  healAssistWindow: 6,
};
