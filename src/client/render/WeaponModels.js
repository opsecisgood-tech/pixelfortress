// Voxel weapon models. Every weapon is a small pixel-art sprite (side view, muzzle to the right)
// drawn with the PixelSprite DSL and extruded into chunky voxels with outlines and edge shading.
// Guns: barrel points -Z, grip pixel at the origin. Melee: tip points +Y, grip at the origin.
// Weapon skins recolour palette keys.
import * as THREE from 'three';
import { PixelSprite, voxelizeSprite, VOXEL_MATERIAL, VOXEL_GLOW_MATERIAL } from './voxel.js';
import { colorMat, boxGeo } from './blocks.js';
import { TEAM_COLORS_HEX } from '../../shared/constants.js';
import { getItem } from '../../shared/config/cosmetics.js';

const BASE = {
  metal: 0x7c838c, dark: 0x34373d, light: 0xd7dbe0, wood: 0x9a6232, woodDark: 0x6e4220, grip: 0x3d2b20, tape: 0xe6e2d6,
  orange: 0xe8892c, yellow: 0xe8b32a, red: 0xcc3b2c, green: 0x5aa04a, white: 0xeef0f2, olive: 0x66733d, glow: 0x86ffb8,
  cyan: 0x52f0ff, fire: 0xffa23a, brass: 0xd0a446, black: 0x222326, steel: 0xc8cdd2, gunmetal: 0x52575f, khaki: 0xb08a54,
};
const GLOW = new Set(['glow', 'cyan', 'fire']);

// Weapon skins come from the cosmetics catalog: a pattern drawn across the sprite in a 3-colour palette.
// Pattern colours replace the body keys (metal, wood, polymer...) and keep their light/dark tone.
const SKINNABLE = { metal: 1, gunmetal: 0.85, steel: 1.15, light: 1.25, dark: 0.62, black: 0.55, wood: 1, woodDark: 0.75, olive: 0.9, khaki: 1.05, white: 1.25 };
const hash2 = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tone(c, f) {
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
}
const GLOW_BIT = 0x1000000;
function hsl(h, s, l) { return new THREE.Color().setHSL(h, s, l).getHex(); }
function skinPattern(item) {
  if (!item || item.slot !== 'weaponSkin' || item.shape === 'none' || !item.colors) return null;
  const [A, B, C] = item.colors;
  const glowy = item.fx === 'glow', rainbow = item.fx === 'rainbow';
  return (x, y, k) => {
    const f = SKINNABLE[k];
    if (f === undefined) return null;
    let col = A, glow = false;
    switch (item.shape) {
      case 'solid': col = (y % 7 === 0) ? B : A; break;
      case 'stripes': col = Math.floor((x + y) / 3) % 2 ? A : B; break;
      case 'checker': col = ((x >> 1) + (y >> 1)) % 2 ? A : B; break;
      case 'camo': { const n = vnoise(x / 4.5, y / 3.5, 3); col = n < 0.42 ? A : n < 0.66 ? B : C; break; }
      case 'digital': { const n = vnoise((x >> 1) / 2.2, (y >> 1) / 2.2, 7); col = n < 0.4 ? A : n < 0.65 ? B : C; break; }
      case 'dots': col = (x % 4 === 1 && y % 4 === 1) || (x % 4 === 3 && y % 4 === 3) ? C : A; break;
      case 'chevron': col = Math.floor((x + Math.abs((y % 6) - 3)) / 2) % 3 === 0 ? B : Math.floor((x + Math.abs((y % 6) - 3)) / 2) % 3 === 1 ? A : C; break;
      case 'carbon': col = ((x + (y >> 1)) % 2) ? A : B; break;
      case 'damascus': { const w = Math.sin(x * 0.55 + Math.sin(y * 0.9) * 2.2); col = w > 0.35 ? C : w > -0.3 ? A : B; break; }
      case 'circuit': { const on = (x % 6 === 0 && hash2(0, y >> 2, 5) > 0.3) || (y % 4 === 1 && hash2(x >> 2, 0, 9) > 0.45); col = on ? B : A; glow = on; if (on && hash2(x, y, 2) > 0.85) col = C; break; }
      case 'lava': { const n = vnoise(x / 3.5, y / 2.5, 11); col = n > 0.62 ? C : n > 0.45 ? B : A; glow = n > 0.45; break; }
      case 'galaxy': { const n = vnoise(x / 5, y / 3, 13); col = hash2(x, y, 17) > 0.93 ? 0xffffff : n > 0.6 ? C : n > 0.42 ? B : A; glow = col === 0xffffff || n > 0.6; break; }
      case 'gilded': col = (x + y) % 5 === 0 ? C : (y % 3 === 0 ? B : A); break;
      default: col = A;
    }
    if (rainbow) { col = hsl(((x * 0.035 + y * 0.05) % 1 + 1) % 1, 0.85, col === A ? 0.55 : col === B ? 0.42 : 0.7); glow = glow || (x + y) % 9 === 0; }
    const out = tone(col, glowy && glow ? 1.1 : f);
    return (glow && (glowy || rainbow || item.fx === 'glow')) ? out | GLOW_BIT : out;
  };
}

// ------------------------------------------------------------------ sprites
// Each entry: { w, h, px (metres per pixel), grip:[x,y], muzzle:[x,y], draw(S), melee?, fp, spin? }
export const WEAPON_MODELS = {
  // ---------------- SCOUT
  scattershot: {
    w: 42, h: 16, px: 0.0175, grip: [13, 11], muzzle: [41, 5],
    draw(S) {
      S.poly([[8, 6], [11, 3], [26, 3], [26, 9], [12, 9], [8, 8]], 'light', 5);
      S.rect(14, 4, 8, 3, 'dark', 5); S.rect(15, 5, 6, 1, 'hl', 5);
      S.poly([[10, 9], [17, 9], [14, 16], [7, 16]], 'wood', 5);
      S.line(11, 10, 9, 15, 'woodDark'); S.line(14, 10, 12, 15, 'woodDark');
      S.rect(17, 9, 1, 3, 'dark', 3); S.rect(17, 11, 4, 1, 'dark', 3); S.rect(20, 9, 1, 3, 'dark', 3); S.px(19, 10, 'dark', 1);
      S.rect(26, 4, 15, 2, 'metal', 3); S.rect(26, 6, 13, 2, 'gunmetal', 3); S.px(39, 3, 'dark', 1);
      S.rect(29, 6, 7, 3, 'wood', 5); for (const x of [30, 32, 34]) S.line(x, 6, x, 8, 'woodDark');
    },
    fp: { pos: [0.2, -0.2, -0.38], scale: 1 },
  },
  sidekick: {
    w: 22, h: 15, px: 0.0145, grip: [6, 10], muzzle: [21, 3],
    draw(S) {
      S.rect(4, 2, 17, 4, 'metal', 3); for (const x of [6, 8, 10]) S.px(x, 3, 'dark');
      S.px(19, 1, 'dark', 1); S.px(5, 1, 'dark', 1);
      S.rect(4, 6, 13, 2, 'dark', 3);
      S.poly([[3, 8], [9, 8], [8, 15], [2, 15]], 'black', 3); S.rect(4, 9, 3, 4, 'grip', 3);
      S.line(9, 8, 9, 10, 'dark', 1); S.line(9, 10, 12, 10, 'dark', 1); S.line(12, 8, 12, 10, 'dark', 1); S.px(10, 9, 'dark', 1);
    },
    fp: { pos: [0.18, -0.17, -0.33], scale: 1.1 },
  },
  streetbat: {
    w: 46, h: 8, px: 0.0175, grip: [5, 3], melee: true,
    draw(S) {
      S.rect(0, 2, 1, 4, 'dark', 5);
      S.rect(1, 3, 12, 2, 'tape', 3); for (const x of [3, 6, 9, 12]) S.line(x, 3, x, 4, 'khaki');
      S.poly([[13, 3], [26, 2], [45, 1], [45, 7], [26, 6], [13, 5]], 'wood', 5);
      S.line(18, 3, 44, 2, 'hl'); S.rect(28, 2, 2, 4, 'red', 5);
      S.line(33, 5, 43, 6, 'woodDark');
    },
    fp: { pos: [0.24, -0.3, -0.42], scale: 1, rot: [-0.25, 0.2, -0.4] },
  },
  // ---------------- SPY
  silencedpistol: {
    w: 32, h: 15, px: 0.0145, grip: [6, 10], muzzle: [31, 4],
    draw(S) {
      S.rect(4, 2, 16, 4, 'dark', 3); for (const x of [6, 8]) S.px(x, 3, 'black');
      S.rect(20, 2, 11, 4, 'black', 5); for (const x of [23, 26, 29]) S.line(x, 2, x, 5, 'gunmetal');
      S.rect(4, 6, 13, 2, 'gunmetal', 3);
      S.poly([[3, 8], [9, 8], [8, 15], [2, 15]], 'black', 3); S.rect(4, 9, 3, 4, 'team', 3);
      S.line(9, 8, 9, 10, 'dark', 1); S.line(9, 10, 12, 10, 'dark', 1); S.line(12, 8, 12, 10, 'dark', 1);
    },
    fp: { pos: [0.18, -0.17, -0.34], scale: 1.05 },
  },
  revolver: {
    w: 28, h: 16, px: 0.0145, grip: [5, 11], muzzle: [27, 4],
    draw(S) {
      S.rect(11, 3, 16, 3, 'metal', 3); S.rect(11, 6, 14, 1, 'gunmetal', 3); S.px(26, 2, 'metal', 1);
      S.poly([[5, 3], [11, 3], [11, 9], [6, 9], [4, 6]], 'gunmetal', 3);
      S.rect(7, 4, 5, 5, 'light', 5); S.line(8, 5, 8, 7, 'metal', 5); S.line(10, 5, 10, 7, 'metal', 5);
      S.px(4, 2, 'dark', 1); S.px(3, 2, 'dark', 1);
      S.line(8, 9, 8, 11, 'dark', 1); S.line(8, 11, 11, 11, 'dark', 1); S.line(11, 9, 11, 11, 'dark', 1); S.px(9, 10, 'dark', 1);
      S.poly([[4, 9], [8, 9], [6, 16], [1, 16], [2, 12]], 'wood', 3); S.line(5, 10, 3, 14, 'woodDark'); S.px(4, 12, 'brass');
    },
    fp: { pos: [0.18, -0.17, -0.33], scale: 1.1 },
  },
  shadowblade: {
    w: 30, h: 9, px: 0.0145, grip: [4, 4], melee: true,
    draw(S) {
      S.rect(0, 3, 9, 3, 'black', 3); S.px(2, 4, 'gunmetal'); S.px(5, 4, 'gunmetal'); S.rect(7, 3, 1, 3, 'team', 3);
      S.rect(9, 1, 2, 7, 'dark', 5);
      S.poly([[11, 2], [25, 2], [29, 4], [25, 7], [11, 7]], 'steel', 3);
      S.line(12, 6, 25, 6, 'hl'); S.line(12, 3, 22, 3, 'light');
      for (let x = 12; x < 20; x += 2) S.px(x, 2, 'dark');
    },
    fp: { pos: [0.22, -0.22, -0.36], scale: 1.15, rot: [-0.9, 0.1, -0.2] },
  },
  // ---------------- MARKSMAN
  longshot: {
    w: 60, h: 16, px: 0.0168, grip: [17, 10], muzzle: [59, 6], scope: true,
    draw(S) {
      S.poly([[0, 7], [4, 4], [19, 4], [19, 9], [11, 10], [3, 13], [0, 12]], 'wood', 5);
      S.line(3, 8, 10, 6, 'woodDark'); S.rect(0, 7, 1, 5, 'dark', 5);
      S.poly([[14, 9], [19, 9], [18, 14], [13, 14]], 'wood', 5);
      S.rect(19, 4, 10, 4, 'dark', 3); S.px(23, 3, 'light', 1); S.px(24, 3, 'light', 1);
      S.rect(29, 5, 30, 2, 'metal', 3); S.rect(56, 4, 3, 4, 'dark', 3);
      S.rect(29, 7, 12, 2, 'wood', 3);
      S.rect(18, 1, 13, 2, 'black', 3); S.rect(30, 0, 3, 4, 'black', 5); S.rect(16, 0, 2, 4, 'black', 5);
      S.rect(31, 1, 1, 2, 'cyan', 5); S.rect(20, 3, 2, 1, 'dark', 3); S.rect(27, 3, 2, 1, 'dark', 3);
      S.line(19, 8, 19, 11, 'dark', 1); S.line(19, 11, 22, 11, 'dark', 1);
    },
    fp: { pos: [0.19, -0.2, -0.42], scale: 1 },
  },
  compactsmg: {
    w: 30, h: 18, px: 0.0155, grip: [8, 10], muzzle: [29, 4],
    draw(S) {
      S.rect(5, 3, 18, 5, 'dark', 3); S.line(7, 2, 20, 2, 'gunmetal', 1);
      S.rect(23, 4, 6, 2, 'metal', 3); S.rect(27, 3, 2, 4, 'black', 3);
      S.poly([[13, 8], [17, 8], [18, 17], [14, 17]], 'metal', 3);
      S.poly([[6, 8], [10, 8], [9, 15], [5, 15]], 'grip', 3);
      S.rect(0, 4, 5, 1, 'metal', 1); S.rect(0, 4, 1, 5, 'metal', 1);
      S.rect(9, 4, 4, 1, 'team', 3);
    },
    fp: { pos: [0.19, -0.2, -0.36], scale: 1 },
  },
  utilityknife: {
    w: 22, h: 7, px: 0.013, grip: [5, 3], melee: true,
    draw(S) {
      S.rect(0, 1, 13, 5, 'yellow', 3); S.rect(3, 2, 7, 3, 'dark', 3); S.px(11, 3, 'gunmetal');
      S.poly([[13, 2], [19, 2], [22, 4], [13, 5]], 'steel', 1); S.line(14, 4, 19, 4, 'hl');
    },
    fp: { pos: [0.22, -0.22, -0.34], scale: 1.25, rot: [-0.9, 0.1, -0.2] },
  },
  // ---------------- MECHANIC
  rivetgun: {
    w: 34, h: 18, px: 0.0155, grip: [10, 11], muzzle: [33, 6],
    draw(S) {
      S.rect(6, 3, 18, 6, 'yellow', 5); S.line(6, 6, 23, 6, 'orange');
      S.rect(24, 4, 9, 4, 'dark', 3); S.rect(31, 3, 2, 6, 'gunmetal', 3);
      S.rect(8, 0, 12, 3, 'metal', 5); S.rect(8, 0, 1, 3, 'dark', 5); S.rect(19, 0, 1, 3, 'dark', 5);
      S.poly([[8, 9], [13, 9], [12, 17], [7, 17]], 'grip', 5);
      S.rect(16, 9, 6, 5, 'dark', 3); for (const x of [17, 19, 21]) S.px(x, 10, 'brass');
      S.px(33, 6, 'fire', 1);
    },
    fp: { pos: [0.2, -0.21, -0.36], scale: 1 },
  },
  constructor: {
    w: 30, h: 20, px: 0.0155, grip: [9, 15], muzzle: [29, 9],
    draw(S) {
      S.rect(6, 6, 14, 7, 'yellow', 5); S.rect(6, 6, 14, 1, 'orange', 5);
      S.rect(20, 7, 6, 5, 'dark', 3); S.rect(26, 6, 3, 7, 'cyan', 3);
      S.line(16, 5, 16, 1, 'dark', 1); S.px(16, 0, 'fire', 1);
      S.rect(8, 8, 9, 2, 'cyan', 5);
      S.poly([[8, 13], [12, 13], [11, 19], [7, 19]], 'grip', 3);
    },
    fp: { pos: [0.2, -0.2, -0.35], scale: 1 },
  },
  wrench: {
    w: 36, h: 14, px: 0.016, grip: [4, 7], melee: true,
    draw(S) {
      S.rect(0, 5, 26, 4, 'metal', 3); S.rect(0, 5, 9, 4, 'red', 3); S.line(10, 6, 25, 6, 'hl');
      S.poly([[25, 3], [29, 0], [35, 0], [35, 14], [29, 14], [25, 11]], 'metal', 3);
      S.clear(30, 4, 6, 6); S.px(29, 7, 'gunmetal');
    },
    fp: { pos: [0.24, -0.28, -0.4], scale: 1.1, rot: [-0.3, 0.2, -0.4] },
  },
  // ---------------- DOCTOR
  syringelauncher: {
    w: 40, h: 16, px: 0.016, grip: [9, 11], muzzle: [39, 6],
    draw(S) {
      S.rect(6, 4, 26, 5, 'white', 5); S.line(7, 8, 31, 8, 'light');
      S.rect(32, 5, 7, 3, 'metal', 3); S.px(38, 4, 'dark', 1);
      for (const x0 of [10, 19]) { S.rect(x0, 1, 6, 3, 'glow', 3); S.rect(x0, 1, 1, 3, 'dark', 3); S.rect(x0 + 5, 1, 1, 3, 'dark', 3); }
      S.poly([[8, 9], [12, 9], [11, 15], [7, 15]], 'grip', 3);
      S.rect(0, 3, 6, 7, 'red', 5); S.rect(2, 5, 2, 3, 'white', 5);
    },
    fp: { pos: [0.2, -0.21, -0.38], scale: 1 },
  },
  medbeam: {
    w: 34, h: 18, px: 0.0155, grip: [9, 14], muzzle: [33, 8],
    draw(S) {
      S.rect(6, 5, 16, 7, 'white', 5);
      S.rect(11, 6, 5, 5, 'red', 5); S.line(13, 6, 13, 10, 'white'); S.line(11, 8, 15, 8, 'white');
      S.rect(22, 6, 7, 5, 'metal', 3); S.rect(29, 5, 3, 7, 'glow', 3);
      S.rect(0, 4, 6, 9, 'metal', 5); S.rect(0, 4, 6, 1, 'team', 5);
      S.poly([[8, 12], [12, 12], [11, 18], [7, 18]], 'grip', 3);
    },
    fp: { pos: [0.2, -0.2, -0.35], scale: 1 },
  },
  surgicalsaw: {
    w: 32, h: 12, px: 0.0145, grip: [4, 6], melee: true,
    draw(S) {
      S.rect(0, 4, 9, 4, 'dark', 3); S.rect(6, 4, 1, 4, 'red', 3);
      S.rect(9, 2, 22, 6, 'steel', 1); S.line(10, 3, 29, 3, 'hl');
      for (let x = 9; x < 31; x += 2) S.px(x, 8, 'steel', 1);
      S.rect(9, 1, 22, 1, 'metal', 3);
    },
    fp: { pos: [0.22, -0.24, -0.38], scale: 1.1, rot: [-0.7, 0.15, -0.25] },
  },
  // ---------------- JUGGERNAUT
  cyclone: {
    w: 58, h: 24, px: 0.0175, grip: [5, 13], muzzle: [57, 11], spin: { from: 25, to: 56, y: 11, r: 4 },
    draw(S) {
      S.rect(4, 4, 19, 13, 'dark', 7); S.rect(4, 4, 19, 1, 'gunmetal', 7);
      S.rect(7, 17, 11, 6, 'olive', 5); S.rect(8, 18, 9, 1, 'brass', 5);
      S.rect(9, 1, 10, 1, 'metal', 3); S.rect(9, 1, 1, 3, 'metal', 3); S.rect(18, 1, 1, 3, 'metal', 3);
      S.rect(23, 5, 2, 12, 'metal', 7);
      S.poly([[1, 10], [5, 10], [5, 17], [2, 17]], 'grip', 3);
      S.rect(10, 8, 6, 4, 'team', 7);
    },
    fp: { pos: [0.2, -0.28, -0.5], scale: 1 },
  },
  breacher: {
    w: 46, h: 16, px: 0.0175, grip: [14, 11], muzzle: [45, 5],
    draw(S) {
      S.poly([[0, 6], [9, 5], [12, 9], [2, 12], [0, 11]], 'dark', 5); S.rect(0, 6, 1, 5, 'black', 5);
      S.poly([[9, 4], [26, 3], [26, 9], [12, 9]], 'black', 5); S.rect(15, 5, 7, 1, 'gunmetal', 5);
      S.poly([[11, 9], [17, 9], [15, 15], [10, 15]], 'grip', 5);
      S.rect(26, 4, 19, 2, 'metal', 3); S.rect(26, 6, 16, 2, 'gunmetal', 3); S.px(43, 3, 'dark', 1);
      S.rect(29, 6, 8, 3, 'wood', 5); for (const x of [30, 32, 34, 36]) S.line(x, 6, x, 8, 'woodDark');
      S.line(17, 9, 17, 11, 'dark', 1); S.line(17, 11, 20, 11, 'dark', 1);
    },
    fp: { pos: [0.2, -0.22, -0.38], scale: 1 },
  },
  foundryhammer: {
    w: 44, h: 17, px: 0.0175, grip: [4, 8], melee: true,
    draw(S) {
      S.rect(0, 7, 34, 3, 'wood', 3); S.rect(0, 7, 8, 3, 'grip', 3); S.line(9, 7, 33, 7, 'hl');
      S.rect(34, 0, 9, 17, 'dark', 7); S.rect(34, 7, 9, 3, 'orange', 7); S.rect(34, 0, 9, 1, 'gunmetal', 7);
    },
    fp: { pos: [0.26, -0.34, -0.46], scale: 1, rot: [-0.2, 0.25, -0.45] },
  },
  // ---------------- INCINERATOR
  thermal: {
    w: 52, h: 20, px: 0.0168, grip: [12, 15], muzzle: [51, 9], flame: true,
    draw(S) {
      S.rect(6, 5, 16, 9, 'red', 7); S.rect(6, 5, 16, 1, 'orange', 7); S.rect(9, 6, 2, 7, 'dark', 7); S.rect(17, 6, 2, 7, 'dark', 7);
      S.rect(22, 8, 24, 3, 'metal', 3); S.rect(30, 7, 2, 5, 'dark', 3); S.rect(38, 7, 2, 5, 'dark', 3);
      S.rect(46, 6, 5, 7, 'dark', 5); S.px(48, 5, 'fire', 1);
      S.poly([[10, 14], [15, 14], [14, 20], [9, 20]], 'grip', 3);
      S.line(4, 9, 0, 13, 'black', 3); S.rect(12, 3, 4, 2, 'gunmetal', 3);
    },
    fp: { pos: [0.21, -0.24, -0.42], scale: 1 },
  },
  flarelauncher: {
    w: 24, h: 16, px: 0.0155, grip: [6, 10], muzzle: [23, 5],
    draw(S) {
      S.rect(8, 3, 15, 5, 'orange', 5); S.rect(21, 2, 2, 7, 'dark', 5); S.line(9, 4, 20, 4, 'hl');
      S.rect(4, 3, 5, 6, 'dark', 5); S.px(3, 2, 'dark', 1);
      S.poly([[4, 8], [9, 8], [7, 16], [2, 16]], 'orange', 5); S.line(5, 10, 4, 14, 'red');
      S.line(9, 8, 9, 10, 'dark', 1); S.line(9, 10, 12, 10, 'dark', 1);
    },
    fp: { pos: [0.18, -0.18, -0.33], scale: 1.15 },
  },
  furnaceaxe: {
    w: 40, h: 18, px: 0.0168, grip: [4, 9], melee: true,
    draw(S) {
      S.rect(0, 8, 33, 3, 'wood', 3); S.rect(0, 8, 7, 3, 'grip', 3); S.line(8, 8, 32, 8, 'hl');
      S.poly([[29, 6], [35, 1], [39, 0], [39, 18], [35, 17], [29, 12]], 'red', 3);
      S.line(39, 0, 39, 17, 'steel', 3); S.line(38, 1, 38, 16, 'steel', 3);
      S.rect(25, 7, 4, 5, 'dark', 3);
    },
    fp: { pos: [0.25, -0.32, -0.44], scale: 1, rot: [-0.25, 0.2, -0.45] },
  },
  // ---------------- DEMOLITIONIST
  blastcaster: {
    w: 60, h: 19, px: 0.0175, grip: [21, 14], muzzle: [59, 7],
    draw(S) {
      S.rect(4, 4, 51, 7, 'olive', 7); S.line(5, 5, 54, 5, 'hl');
      S.rect(54, 2, 5, 11, 'dark', 7); S.rect(0, 2, 5, 11, 'dark', 7);
      S.rect(40, 4, 2, 7, 'yellow', 7); S.rect(28, 1, 6, 3, 'dark', 3); S.px(32, 1, 'fire', 1);
      S.rect(19, 11, 4, 6, 'grip', 3); S.rect(34, 11, 4, 6, 'grip', 3);
      S.rect(10, 6, 6, 3, 'team', 7);
    },
    fp: { pos: [0.22, -0.22, -0.32], scale: 1 },
  },
  chargelauncher: {
    w: 42, h: 18, px: 0.0168, grip: [15, 14], muzzle: [41, 7],
    draw(S) {
      S.poly([[0, 6], [10, 5], [12, 10], [2, 13], [0, 12]], 'wood', 5); S.line(2, 9, 9, 7, 'woodDark');
      S.rect(12, 4, 3, 7, 'dark', 5);
      S.rect(15, 2, 9, 11, 'gunmetal', 7); S.rect(15, 7, 9, 1, 'brass', 7); S.rect(15, 2, 9, 1, 'metal', 7);
      S.rect(24, 5, 17, 4, 'metal', 5); S.rect(39, 4, 2, 6, 'dark', 5);
      S.poly([[13, 11], [17, 11], [16, 17], [12, 17]], 'grip', 3);
      S.px(36, 3, 'dark', 1);
    },
    fp: { pos: [0.2, -0.22, -0.38], scale: 1 },
  },
  demohammer: {
    w: 48, h: 16, px: 0.0175, grip: [4, 7], melee: true,
    draw(S) {
      S.rect(0, 6, 38, 3, 'wood', 3); S.rect(0, 6, 8, 3, 'grip', 3); S.line(9, 6, 37, 6, 'hl');
      S.rect(38, 1, 9, 14, 'metal', 7); S.rect(46, 3, 2, 10, 'yellow', 7); S.rect(38, 1, 9, 1, 'light', 7);
    },
    fp: { pos: [0.26, -0.34, -0.46], scale: 1, rot: [-0.2, 0.25, -0.45] },
  },
};

// Precompute muzzle offsets in metres (used by the viewmodel / third-person rigs).
for (const m of Object.values(WEAPON_MODELS)) {
  if (m.melee) m.muzzle3 = [0, (m.w - m.grip[0]) * m.px, 0];
  else m.muzzle3 = [0, -(m.muzzle[1] - m.grip[1]) * m.px, -(m.muzzle[0] - m.grip[0]) * m.px];
}

const geoCache = new Map();

function buildGeometry(id, skin, team) {
  const item = getItem(skin);
  const key = `${id}|${item ? item.id : 'none'}|${team}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const def = WEAPON_MODELS[id];
  const pal = { ...BASE, team: TEAM_COLORS_HEX[team ?? 0] };
  const S = new PixelSprite(def.w, def.h);
  def.draw(S);
  const px = def.px;
  const [gx, gy] = def.grip;
  const map = def.melee
    ? (x, y, l) => [l * px, (x - gx) * px, (y - gy) * px]
    : (x, y, l) => [l * px, -(y - gy) * px, -(x - gx) * px];
  const g = voxelizeSprite(S, pal, { size: px, map, glowKeys: GLOW, seed: id.length * 97, pattern: skinPattern(item) });
  geoCache.set(key, g);
  return g;
}

/**
 * Build a THREE.Group for a weapon.
 * opts: { skin, team, scale, shadow }
 * group.userData: { muzzle: Object3D, spin: Group|null, def }
 */
export function buildWeapon(id, opts = {}) {
  const def = WEAPON_MODELS[id] || WEAPON_MODELS.sidekick;
  const geo = buildGeometry(WEAPON_MODELS[id] ? id : 'sidekick', opts.skin, opts.team);
  const g = new THREE.Group();
  const solid = new THREE.Mesh(geo.solid, VOXEL_MATERIAL);
  solid.castShadow = opts.shadow !== false;
  g.add(solid);
  if (geo.glow) g.add(new THREE.Mesh(geo.glow, VOXEL_GLOW_MATERIAL));
  let spin = null;
  if (def.spin) {
    // rotary barrel cluster: six outlined voxel rods around the bore axis
    const pal = BASE;
    spin = new THREE.Group();
    const px = def.px;
    const len = (def.spin.to - def.spin.from) * px;
    spin.position.set(0, -(def.spin.y - def.grip[1]) * px, -((def.spin.from + def.spin.to) / 2 - def.grip[0]) * px);
    const rodMat = colorMat(pal.metal), edgeMat = colorMat(0x17181b, { flat: true });
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2;
      const r = def.spin.r * px * 0.75;
      const rod = new THREE.Mesh(boxGeo(px * 1.6, px * 1.6, len), rodMat);
      rod.position.set(Math.cos(t) * r, Math.sin(t) * r, 0);
      spin.add(rod);
    }
    const core = new THREE.Mesh(boxGeo(px * 1.4, px * 1.4, len * 1.02), edgeMat);
    spin.add(core);
    for (const z of [-len / 2 + px, len / 2 - px * 2, 0]) {
      const ring = new THREE.Mesh(boxGeo(px * 8, px * 8, px * 1.4), colorMat(pal.dark));
      ring.position.z = z;
      spin.add(ring);
    }
    g.add(spin);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...def.muzzle3);
  g.add(muzzle);
  g.userData = { muzzle, spin, def };
  if (opts.scale) g.scale.setScalar(opts.scale);
  return g;
}
