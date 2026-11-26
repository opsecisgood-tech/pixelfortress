// Shared engine constants. Used by server simulation, client prediction and tests.
// Nothing in /src/shared may import three.js or touch the DOM.

export const GAME_VERSION = '1.0.0';
export const PROTOCOL_VERSION = 3;

export const SERVER_TICK_RATE = 30;          // authoritative simulation steps per second
export const SNAPSHOT_RATE = 20;             // snapshots per second sent to clients
export const CMD_RATE = 60;                  // client input commands per second
export const CMD_DT = 1 / CMD_RATE;
export const INTERP_DELAY = 0.1;             // seconds remote entities are rendered in the past
export const MAX_LAG_COMP = 0.3;             // max rewind for hitscan lag compensation (s)
export const RECONNECT_GRACE = 60;           // seconds a disconnected player's slot is held

export const TEAM = { RED: 0, BLUE: 1 };
export const TEAM_NAMES = ['RED', 'BLUE'];
export const TEAM_COLORS = ['#d8473b', '#3f7fd6'];
export const TEAM_COLORS_HEX = [0xd8473b, 0x3f7fd6];
export const TEAM_DARK_HEX = [0x7a2219, 0x1e3f73];
export const otherTeam = (t) => (t === 0 ? 1 : 0);

// Physics
export const GRAVITY = 24;
export const PLAYER_RADIUS = 0.4;            // half-width of collision hull
export const PLAYER_HEIGHT = 1.85;
export const CROUCH_HEIGHT = 1.25;
export const EYE_HEIGHT = 1.62;
export const CROUCH_EYE_HEIGHT = 1.06;
export const STEP_HEIGHT = 0.55;
export const BASE_SPEED = 7.0;               // m/s at 100% class speed
export const SPRINT_MULT = 1.22;
export const CROUCH_MULT = 0.5;
export const BASE_JUMP_VELOCITY = 8.2;
export const GROUND_ACCEL = 11;
export const AIR_ACCEL = 2.4;
export const AIR_SPEED_CAP = 1.1;            // fraction of max speed air accel can push toward
export const FRICTION = 7.5;
export const STOP_SPEED = 2.5;
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;
export const MAX_FALL_SPEED = 45;
export const FALL_DAMAGE_SPEED = 17;         // impact speed above which fall damage applies
export const FALL_DAMAGE_PER_MS = 6;         // hp per m/s over threshold

// Input button bits (held state, sent in every command)
export const BTN = {
  FORWARD: 1,
  BACK: 2,
  LEFT: 4,
  RIGHT: 8,
  JUMP: 16,
  SPRINT: 32,
  CROUCH: 64,
  FIRE: 128,
  ALT: 256,
  RELOAD: 512,
  ABILITY: 1024,
};

export const SLOT = { PRIMARY: 0, SECONDARY: 1, MELEE: 2 };
export const SLOT_NAMES = ['primary', 'secondary', 'melee'];

// Player status flag bits (replicated in snapshots)
export const PF = {
  ALIVE: 1,
  GROUNDED: 2,
  CROUCH: 4,
  SPRINT: 8,
  FIRING: 16,
  RELOADING: 32,
  ABILITY: 64,          // class ability currently active
  BURNING: 128,
  DISGUISED: 256,
  SPAWN_PROTECT: 256 * 2,
  CARRIER: 256 * 4,
  OVERCHARGED: 256 * 8,
  REVEALED: 256 * 16,
  SCOPED: 256 * 32,
  SPUN: 256 * 64,
  HEALED: 256 * 128,
  RALLIED: 65536,       // boosted by a Soldier's Rally Cry
  CLOAKED: 131072,      // Spy invisibility watch active
};

export const MATCH_STATE = {
  WARMUP: 'warmup',
  PREROUND: 'preround',
  PLAYING: 'playing',
  OVERTIME: 'overtime',
  ENDED: 'ended',
};

export const FLAG_STATE = {
  AT_BASE: 0,
  CARRIED: 1,
  DROPPED: 2,
  RETURNING: 3,
  CAPTURED: 4,
};
export const FLAG_STATE_NAMES = ['AT BASE', 'TAKEN', 'DROPPED', 'RETURNING', 'CAPTURED'];
