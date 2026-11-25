// Player settings with localStorage persistence and graphics presets.

export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
  reload: 'KeyR', primary: 'Digit1', secondary: 'Digit2', melee: 'Digit3', ability: 'KeyE', scoreboard: 'Tab',
  classmenu: 'KeyM', chat: 'KeyT', teamchat: 'KeyY', lastweapon: 'KeyQ',
};

export const KEY_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', sprint: 'Sprint',
  crouch: 'Crouch', reload: 'Reload', primary: 'Primary weapon', secondary: 'Secondary weapon', melee: 'Melee weapon',
  ability: 'Class ability', scoreboard: 'Scoreboard', classmenu: 'Change class', chat: 'Chat', teamchat: 'Team chat', lastweapon: 'Last weapon',
};

export const MOBILE_BUTTONS = ['fire', 'jump', 'reload', 'ability', 'crouch', 'weapon', 'alt', 'sprint'];

export const DEFAULT_MOBILE_LAYOUT = {
  joystick: { x: 0.14, y: 0.72, s: 1 },
  fire: { x: 0.88, y: 0.62, s: 1.25 },
  jump: { x: 0.93, y: 0.84, s: 1 },
  reload: { x: 0.78, y: 0.86, s: 0.85 },
  ability: { x: 0.79, y: 0.45, s: 0.95 },
  crouch: { x: 0.68, y: 0.88, s: 0.8 },
  weapon: { x: 0.95, y: 0.38, s: 0.8 },
  alt: { x: 0.7, y: 0.66, s: 0.85 },
  sprint: { x: 0.05, y: 0.45, s: 0.8 },
};

export const GRAPHICS_PRESETS = {
  low: { pixelRatio: 0.75, shadows: false, shadowSize: 512, maxLights: 0, fxLights: 1, particleMult: 0.4, maxParticles: 500, decals: false, maxDecals: 0, weather: false, propDetail: 0, fogMult: 0.75, antialias: false },
  medium: { pixelRatio: 1, shadows: true, shadowSize: 1024, maxLights: 4, fxLights: 2, particleMult: 0.75, maxParticles: 1200, decals: true, maxDecals: 40, weather: true, propDetail: 1, fogMult: 1, antialias: false },
  high: { pixelRatio: 1.25, shadows: true, shadowSize: 2048, maxLights: 8, fxLights: 4, particleMult: 1, maxParticles: 2500, decals: true, maxDecals: 80, weather: true, propDetail: 1, fogMult: 1.15, antialias: true },
  ultra: { pixelRatio: 2, shadows: true, shadowSize: 4096, maxLights: 12, fxLights: 6, particleMult: 1.4, maxParticles: 4000, decals: true, maxDecals: 140, weather: true, propDetail: 1, fogMult: 1.3, antialias: true },
};

export const CROSSHAIRS = ['cross', 'dot', 'circle', 'tee', 'classic'];

const DEFAULTS = {
  name: '',
  sensitivity: 1,
  sensX: 1,
  sensY: 1,
  invertY: false,
  fov: 90,
  quality: 'auto',
  overrides: {},          // per-setting graphics overrides
  resolutionScale: 1,
  masterVolume: 0.8,
  musicVolume: 0.45,
  effectsVolume: 0.85,
  announcer: true,
  hitSound: true,
  hrtf: true,
  crosshair: { style: 'cross', color: '#7dff6a', size: 1, gap: 4, thickness: 2, dot: true, outline: true, dynamic: true },
  keys: { ...DEFAULT_KEYS },
  mobile: { layout: structuredClone(DEFAULT_MOBILE_LAYOUT), lookSens: 1, joySens: 1, autoFire: false, opacity: 0.55 },
  forceTouch: false,
  reduceMotion: false,
  cameraShake: 1,
  viewBob: 1,
  damageNumbers: true,
  colorblind: false,
  showFps: false,
  showPing: true,
  showNames: true,
  serverUrl: '',
  lastMode: 'tdm',
  lastMap: 'dusty_depot',
  botFill: 8,
  botDifficulty: 0.55,
};

const KEY = 'pf_settings_v1';

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { s = {}; }
  const out = { ...structuredClone(DEFAULTS), ...s };
  out.crosshair = { ...DEFAULTS.crosshair, ...(s.crosshair || {}) };
  out.keys = { ...DEFAULT_KEYS, ...(s.keys || {}) };
  out.mobile = { ...structuredClone(DEFAULTS.mobile), ...(s.mobile || {}) };
  out.mobile.layout = { ...structuredClone(DEFAULT_MOBILE_LAYOUT), ...((s.mobile && s.mobile.layout) || {}) };
  return out;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function isTouchDevice() {
  return (typeof window !== 'undefined') && (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;
}

export function resolveQuality(s) {
  let preset = s.quality;
  if (preset === 'auto') preset = isTouchDevice() ? 'low' : (window.devicePixelRatio > 1.5 ? 'medium' : 'high');
  const q = { ...GRAPHICS_PRESETS[preset] || GRAPHICS_PRESETS.medium, ...(s.overrides || {}), preset };
  q.pixelRatio = Math.min(q.pixelRatio * (s.resolutionScale || 1), window.devicePixelRatio || 1) || 1;
  return q;
}
