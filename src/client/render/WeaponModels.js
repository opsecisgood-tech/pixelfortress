// Blocky, exaggerated weapon models (original designs). Defined as box lists in metres; the barrel points
// toward -Z, the grip is near the origin. Melee weapons point up (+Y). Used for viewmodels, third-person
// models, kill-feed icons and the loadout inspector. Weapon skins recolour palette keys.
import * as THREE from 'three';
import { colorMat, boxGeo } from './blocks.js';
import { TEAM_COLORS_HEX } from '../../shared/constants.js';

const BASE = {
  metal: 0x5d636b, dark: 0x2b2e33, light: 0xaab1b8, wood: 0x8a5a32, grip: 0x3a2a20, tape: 0xdedede,
  orange: 0xe2852a, yellow: 0xe2b12a, red: 0xc8402f, green: 0x5aa04a, white: 0xe8ecef, olive: 0x5e6a3a,
  glow: 0x7fffb0, cyan: 0x3ff2ff, fire: 0xff8a2a, glass: 0x9fd3ea, brass: 0xc9a14a, black: 0x1a1a1a, steel: 0xc8ced4,
};

const SKINS = {
  none: {},
  camo: { metal: 0xa08a5a, dark: 0x6a5a3a, olive: 0x8a7a4a, black: 0x4a3f2a },
  carbon: { metal: 0x2e2f33, dark: 0x18191b, light: 0x45474c, wood: 0x2a2a2a, olive: 0x232427 },
  candy: { metal: 0xf2f2f2, dark: 0xd8384a, light: 0xffffff, wood: 0xff9ac8, olive: 0xf2f2f2 },
  neon: { metal: 0x241a3a, dark: 0x120c1f, light: 0xff3fa8, wood: 0x2a1a44, olive: 0x241a3a, glow: 0xff3fa8, cyan: 0xff3fa8 },
  gold: { metal: 0xd8a830, dark: 0xa07818, light: 0xffe08a, wood: 0x8a5a20, olive: 0xc89a28, steel: 0xffe08a },
};

// [x, y, z, w, h, d, colorKey, opts?]  (centre-anchored boxes)
export const WEAPON_MODELS = {
  scattershot: {
    muzzle: [0, 0.07, -0.62],
    parts: [
      [0, 0.02, 0.22, 0.07, 0.11, 0.3, 'wood'], [0, 0.05, -0.02, 0.09, 0.12, 0.22, 'dark'],
      [-0.025, 0.08, -0.36, 0.045, 0.045, 0.52, 'metal'], [0.025, 0.08, -0.36, 0.045, 0.045, 0.52, 'metal'],
      [0, 0.02, -0.3, 0.08, 0.05, 0.3, 'wood'], [0, -0.06, 0.02, 0.05, 0.12, 0.06, 'grip'], [0, 0.12, -0.08, 0.02, 0.02, 0.05, 'light'],
    ],
    fp: { pos: [0.2, -0.2, -0.36], scale: 1 },
  },
  sidekick: {
    muzzle: [0, 0.06, -0.22],
    parts: [
      [0, 0.06, -0.06, 0.05, 0.06, 0.28, 'metal'], [0, -0.03, 0.03, 0.045, 0.14, 0.07, 'dark', { rx: 0.2 }],
      [0, 0.0, -0.03, 0.04, 0.03, 0.08, 'dark'], [0, 0.1, -0.18, 0.012, 0.015, 0.02, 'light'], [0, 0.08, 0.06, 0.03, 0.02, 0.02, 'light'],
    ],
    fp: { pos: [0.18, -0.17, -0.32], scale: 1.1 },
  },
  streetbat: {
    melee: true,
    parts: [
      [0, 0.06, 0, 0.045, 0.16, 0.045, 'tape'], [0, 0.32, 0, 0.055, 0.4, 0.055, 'wood'], [0, 0.62, 0, 0.075, 0.3, 0.075, 'wood'],
      [0, -0.03, 0, 0.06, 0.02, 0.06, 'dark'], [0, 0.55, 0, 0.078, 0.03, 0.078, 'red'],
    ],
    fp: { pos: [0.24, -0.3, -0.42], scale: 1, rot: [-0.25, 0.2, -0.4] },
  },
  silencedpistol: {
    muzzle: [0, 0.06, -0.42],
    parts: [
      [0, 0.06, -0.05, 0.05, 0.06, 0.24, 'dark'], [0, 0.06, -0.3, 0.04, 0.04, 0.22, 'black'], [0, -0.03, 0.03, 0.045, 0.14, 0.07, 'grip', { rx: 0.2 }],
      [0, 0.1, -0.12, 0.012, 0.015, 0.02, 'light'], [0, 0.0, -0.04, 0.04, 0.025, 0.07, 'dark'],
    ],
    fp: { pos: [0.18, -0.17, -0.34], scale: 1.05 },
  },
  revolver: {
    muzzle: [0, 0.075, -0.36],
    parts: [
      [0, 0.075, -0.2, 0.035, 0.035, 0.3, 'metal'], [0, 0.07, -0.02, 0.07, 0.07, 0.1, 'light'], [0, 0.09, 0.05, 0.04, 0.05, 0.1, 'metal'],
      [0, -0.02, 0.07, 0.045, 0.14, 0.06, 'wood', { rx: 0.35 }], [0, 0.12, -0.33, 0.01, 0.02, 0.02, 'light'], [0, 0.025, 0.0, 0.035, 0.02, 0.05, 'dark'],
    ],
    fp: { pos: [0.18, -0.17, -0.33], scale: 1.1 },
  },
  shadowblade: {
    melee: true,
    parts: [
      [0, 0.04, 0, 0.035, 0.12, 0.045, 'dark'], [0, 0.11, 0, 0.09, 0.02, 0.05, 'metal'], [0, 0.24, 0, 0.015, 0.24, 0.045, 'steel'],
      [0, 0.37, 0.008, 0.015, 0.04, 0.025, 'steel'], [0, 0.04, 0, 0.038, 0.03, 0.048, 'team'],
    ],
    fp: { pos: [0.22, -0.22, -0.36], scale: 1.1, rot: [-0.9, 0.1, -0.2] },
  },
  longshot: {
    muzzle: [0, 0.06, -0.95],
    scope: true,
    parts: [
      [0, 0.0, 0.3, 0.07, 0.12, 0.34, 'wood'], [0, 0.04, -0.02, 0.07, 0.09, 0.34, 'wood'], [0, 0.06, -0.55, 0.035, 0.035, 0.75, 'metal'],
      [0, 0.15, -0.05, 0.06, 0.06, 0.34, 'dark'], [0, 0.15, -0.23, 0.075, 0.075, 0.03, 'dark'], [0, 0.15, 0.12, 0.07, 0.07, 0.03, 'dark'],
      [0, 0.1, -0.05, 0.03, 0.04, 0.05, 'dark'], [0, -0.06, 0.05, 0.045, 0.1, 0.05, 'grip'], [0.045, 0.06, 0.05, 0.04, 0.02, 0.02, 'light'],
      [0, 0.15, -0.235, 0.05, 0.05, 0.02, 'cyan', { glow: true }],
    ],
    fp: { pos: [0.19, -0.2, -0.42], scale: 1 },
  },
  compactsmg: {
    muzzle: [0, 0.07, -0.36],
    parts: [
      [0, 0.06, -0.08, 0.07, 0.1, 0.32, 'dark'], [0, 0.07, -0.29, 0.035, 0.035, 0.1, 'metal'], [0, -0.07, -0.1, 0.04, 0.16, 0.05, 'metal'],
      [0, -0.04, 0.05, 0.045, 0.12, 0.05, 'grip', { rx: 0.25 }], [0, 0.03, 0.17, 0.03, 0.03, 0.14, 'metal'], [0, 0.13, -0.08, 0.02, 0.025, 0.1, 'light'],
    ],
    fp: { pos: [0.19, -0.2, -0.36], scale: 1 },
  },
  utilityknife: {
    melee: true,
    parts: [[0, 0.06, 0, 0.035, 0.16, 0.05, 'yellow'], [0, 0.06, 0, 0.037, 0.03, 0.052, 'dark'], [0, 0.18, 0.008, 0.012, 0.09, 0.035, 'steel']],
    fp: { pos: [0.22, -0.22, -0.34], scale: 1.2, rot: [-0.9, 0.1, -0.2] },
  },
  rivetgun: {
    muzzle: [0, 0.08, -0.46],
    parts: [
      [0, 0.08, -0.12, 0.1, 0.12, 0.4, 'yellow'], [0, 0.08, -0.38, 0.06, 0.06, 0.12, 'dark'], [0, 0.18, -0.1, 0.07, 0.07, 0.3, 'metal'],
      [0, -0.04, 0.02, 0.05, 0.14, 0.06, 'grip', { rx: 0.2 }], [0, -0.06, -0.2, 0.06, 0.1, 0.12, 'dark'], [0.06, 0.08, -0.12, 0.02, 0.06, 0.2, 'orange'],
      [0, 0.08, -0.45, 0.04, 0.04, 0.02, 'fire', { glow: true }],
    ],
    fp: { pos: [0.2, -0.21, -0.36], scale: 1 },
  },
  constructor: {
    muzzle: [0, 0.1, -0.38],
    parts: [
      [0, 0.06, -0.08, 0.12, 0.12, 0.28, 'yellow'], [0, 0.08, -0.28, 0.07, 0.07, 0.14, 'dark'], [0, 0.08, -0.37, 0.09, 0.09, 0.04, 'cyan', { glow: true }],
      [0.07, 0.15, -0.0, 0.015, 0.2, 0.015, 'dark'], [0.07, 0.26, 0.0, 0.03, 0.03, 0.03, 'red', { glow: true }],
      [0, -0.05, 0.03, 0.05, 0.13, 0.06, 'grip'], [-0.07, 0.07, -0.08, 0.02, 0.08, 0.16, 'cyan', { glow: true }],
    ],
    fp: { pos: [0.2, -0.2, -0.35], scale: 1 },
  },
  wrench: {
    melee: true,
    parts: [
      [0, 0.15, 0, 0.04, 0.36, 0.025, 'metal'], [0, 0.36, 0, 0.12, 0.08, 0.03, 'metal'], [0.035, 0.42, 0, 0.035, 0.06, 0.03, 'metal'],
      [-0.035, 0.42, 0, 0.035, 0.06, 0.03, 'metal'], [0, 0.04, 0, 0.05, 0.1, 0.035, 'red'],
    ],
    fp: { pos: [0.24, -0.28, -0.4], scale: 1.1, rot: [-0.3, 0.2, -0.4] },
  },
  syringelauncher: {
    muzzle: [0, 0.08, -0.5],
    parts: [
      [0, 0.08, -0.15, 0.09, 0.09, 0.56, 'white'], [0, 0.08, -0.45, 0.06, 0.06, 0.1, 'metal'],
      [0.055, 0.13, -0.15, 0.04, 0.04, 0.34, 'glow', { glow: true }], [-0.055, 0.13, -0.15, 0.04, 0.04, 0.34, 'glow', { glow: true }],
      [0, -0.04, 0.02, 0.05, 0.13, 0.06, 'grip'], [0, 0.0, 0.15, 0.06, 0.06, 0.12, 'red'],
    ],
    fp: { pos: [0.2, -0.21, -0.38], scale: 1 },
  },
  medbeam: {
    muzzle: [0, 0.09, -0.4],
    parts: [
      [0, 0.08, -0.08, 0.12, 0.12, 0.32, 'white'], [0, 0.09, -0.3, 0.07, 0.07, 0.14, 'metal'], [0, 0.09, -0.38, 0.09, 0.09, 0.03, 'glow', { glow: true }],
      [0, 0.17, -0.06, 0.06, 0.05, 0.18, 'red'], [0, 0.17, -0.06, 0.02, 0.06, 0.08, 'white'], [0, -0.04, 0.03, 0.05, 0.13, 0.06, 'grip'],
      [0, 0.04, 0.16, 0.1, 0.18, 0.1, 'metal'],
    ],
    fp: { pos: [0.2, -0.2, -0.35], scale: 1 },
  },
  surgicalsaw: {
    melee: true,
    parts: [[0, 0.06, 0, 0.04, 0.16, 0.05, 'dark'], [0, 0.26, 0.02, 0.012, 0.26, 0.09, 'steel'], [0, 0.26, -0.03, 0.014, 0.26, 0.02, 'metal'], [0, 0.06, 0, 0.042, 0.03, 0.052, 'red']],
    fp: { pos: [0.22, -0.24, -0.38], scale: 1.1, rot: [-0.7, 0.15, -0.25] },
  },
  cyclone: {
    muzzle: [0, 0.02, -0.92],
    spin: [0, 0.02, -0.55],
    parts: [
      [0, 0.02, -0.05, 0.22, 0.24, 0.42, 'dark'], [0, 0.17, -0.05, 0.08, 0.06, 0.3, 'metal'], [0, -0.13, 0.1, 0.06, 0.12, 0.08, 'grip'],
      [0.13, 0.02, -0.02, 0.06, 0.2, 0.22, 'olive'], [0, 0.02, -0.26, 0.26, 0.26, 0.04, 'metal'], [0, 0.02, -0.85, 0.24, 0.24, 0.04, 'metal'],
      [0, 0.15, 0.2, 0.14, 0.1, 0.12, 'brass'],
    ],
    spinParts: (() => {
      const a = [];
      for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; a.push([Math.cos(t) * 0.07, Math.sin(t) * 0.07, 0, 0.04, 0.04, 0.62, 'metal']); }
      a.push([0, 0, 0, 0.05, 0.05, 0.66, 'dark']);
      return a;
    })(),
    fp: { pos: [0.2, -0.28, -0.5], scale: 1 },
  },
  breacher: {
    muzzle: [0, 0.07, -0.66],
    parts: [
      [0, 0.02, 0.24, 0.07, 0.12, 0.28, 'dark'], [0, 0.05, -0.02, 0.08, 0.1, 0.24, 'metal'], [0, 0.08, -0.38, 0.045, 0.045, 0.56, 'metal'],
      [0, 0.02, -0.3, 0.07, 0.06, 0.18, 'wood'], [0, -0.06, 0.04, 0.05, 0.12, 0.06, 'grip'],
    ],
    fp: { pos: [0.2, -0.22, -0.38], scale: 1 },
  },
  foundryhammer: {
    melee: true,
    parts: [[0, 0.3, 0, 0.05, 0.64, 0.05, 'wood'], [0, 0.66, 0, 0.12, 0.14, 0.3, 'dark'], [0, 0.66, 0, 0.13, 0.04, 0.31, 'orange'], [0, 0.03, 0, 0.06, 0.08, 0.06, 'grip']],
    fp: { pos: [0.26, -0.34, -0.46], scale: 1, rot: [-0.2, 0.25, -0.45] },
  },
  thermal: {
    muzzle: [0, 0.06, -0.72],
    flame: true,
    parts: [
      [0, 0.06, -0.3, 0.08, 0.08, 0.66, 'metal'], [0, 0.06, -0.66, 0.11, 0.11, 0.08, 'dark'], [0, -0.02, -0.08, 0.13, 0.18, 0.3, 'red'],
      [0, 0.12, -0.12, 0.04, 0.06, 0.2, 'dark'], [0, -0.07, 0.08, 0.05, 0.12, 0.06, 'grip'], [0, 0.12, -0.6, 0.025, 0.025, 0.06, 'fire', { glow: true }],
      [0, -0.05, -0.38, 0.05, 0.08, 0.06, 'dark'],
    ],
    fp: { pos: [0.21, -0.24, -0.42], scale: 1 },
  },
  flarelauncher: {
    muzzle: [0, 0.08, -0.3],
    parts: [[0, 0.08, -0.12, 0.07, 0.07, 0.32, 'orange'], [0, 0.08, -0.28, 0.08, 0.08, 0.04, 'dark'], [0, -0.03, 0.04, 0.05, 0.14, 0.07, 'orange', { rx: 0.25 }], [0, 0.12, 0.02, 0.03, 0.03, 0.06, 'dark']],
    fp: { pos: [0.18, -0.18, -0.33], scale: 1.15 },
  },
  furnaceaxe: {
    melee: true,
    parts: [[0, 0.28, 0, 0.045, 0.6, 0.045, 'wood'], [0, 0.56, -0.06, 0.03, 0.16, 0.16, 'red'], [0, 0.56, -0.15, 0.02, 0.2, 0.04, 'steel'], [0, 0.6, 0.06, 0.03, 0.06, 0.08, 'dark']],
    fp: { pos: [0.25, -0.32, -0.44], scale: 1, rot: [-0.25, 0.2, -0.45] },
  },
  blastcaster: {
    muzzle: [0, 0.1, -0.72],
    parts: [
      [0, 0.1, -0.16, 0.15, 0.15, 1.0, 'olive'], [0, 0.1, -0.67, 0.18, 0.18, 0.08, 'dark'], [0, 0.1, 0.36, 0.18, 0.18, 0.06, 'dark'],
      [0.1, 0.18, -0.1, 0.05, 0.07, 0.12, 'dark'], [0.1, 0.18, -0.17, 0.04, 0.04, 0.02, 'red', { glow: true }],
      [0, -0.04, 0.0, 0.05, 0.13, 0.06, 'grip'], [0, -0.03, -0.28, 0.05, 0.11, 0.06, 'grip'], [0, 0.1, -0.4, 0.155, 0.04, 0.155, 'yellow'],
    ],
    fp: { pos: [0.22, -0.22, -0.32], scale: 1 },
  },
  chargelauncher: {
    muzzle: [0, 0.08, -0.5],
    parts: [
      [0, 0.08, -0.3, 0.09, 0.09, 0.36, 'metal'], [0, 0.06, -0.02, 0.18, 0.18, 0.16, 'dark'], [0, 0.06, -0.02, 0.19, 0.06, 0.06, 'brass'],
      [0, -0.02, 0.18, 0.07, 0.1, 0.24, 'wood'], [0, -0.06, 0.06, 0.05, 0.13, 0.06, 'grip'], [0, 0.14, -0.4, 0.02, 0.04, 0.02, 'light'],
    ],
    fp: { pos: [0.2, -0.22, -0.38], scale: 1 },
  },
  demohammer: {
    melee: true,
    parts: [[0, 0.34, 0, 0.045, 0.7, 0.045, 'wood'], [0, 0.72, 0, 0.14, 0.14, 0.34, 'metal'], [0, 0.72, 0.18, 0.1, 0.1, 0.05, 'yellow'], [0, 0.03, 0, 0.055, 0.08, 0.055, 'grip']],
    fp: { pos: [0.26, -0.34, -0.46], scale: 1, rot: [-0.2, 0.25, -0.45] },
  },
};

/**
 * Build a THREE.Group for a weapon.
 * opts: { skin, team, scale, shadow }
 * group.userData: { muzzle: Object3D, spin: Group|null, def }
 */
export function buildWeapon(id, opts = {}) {
  const def = WEAPON_MODELS[id] || WEAPON_MODELS.sidekick;
  const pal = { ...BASE, ...(SKINS[opts.skin] || {}), team: TEAM_COLORS_HEX[opts.team ?? 0] };
  const g = new THREE.Group();
  const addParts = (parent, parts) => {
    for (const p of parts) {
      const [x, y, z, w, h, d, key, o] = p;
      const col = pal[key] ?? key;
      const glow = o && o.glow;
      const m = new THREE.Mesh(boxGeo(w, h, d), glow ? colorMat(col, { basic: true }) : colorMat(col));
      m.position.set(x, y, z);
      if (o && o.rx) m.rotation.x = o.rx;
      m.castShadow = opts.shadow !== false;
      parent.add(m);
    }
  };
  addParts(g, def.parts);
  let spin = null;
  if (def.spinParts) {
    spin = new THREE.Group();
    spin.position.set(...def.spin);
    addParts(spin, def.spinParts);
    g.add(spin);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...(def.muzzle || [0, 0.4, 0]));
  g.add(muzzle);
  if (opts.skin === 'candy' || opts.skin === 'neon') {
    // stripe accent
    const s = new THREE.Mesh(boxGeo(0.005, 0.02, 0.2), colorMat(opts.skin === 'neon' ? 0x3ff2ff : 0xffffff, { basic: true }));
    s.position.set(0.05, 0.08, -0.1);
    g.add(s);
  }
  g.userData = { muzzle, spin, def };
  if (opts.scale) g.scale.setScalar(opts.scale);
  return g;
}
