// Procedural pixel-art texture generation. Every surface texture in the game is painted here at runtime
// (32x32 or 16x16 canvases, nearest-neighbour filtered) — no external image assets.
import * as THREE from 'three';
import { mulberry32 } from '../../shared/math.js';

const cache = new Map();

export function hexToRgb(h) { return [(h >> 16) & 255, (h >> 8) & 255, h & 255]; }
export function rgbStr(r, g, b, a = 1) { return a === 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  return rgbStr(Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f));
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return ((A[0] + (B[0] - A[0]) * t) << 16) | ((A[1] + (B[1] - A[1]) * t) << 8) | (A[2] + (B[2] - A[2]) * t);
}

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && false ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Fill with noisy base colour.
function noiseFill(ctx, w, h, hex, amount, rnd, step = 1) {
  const [r, g, b] = hexToRgb(hex);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const f = 1 + (rnd() - 0.5) * amount;
      ctx.fillStyle = rgbStr(r * f, g * f, b * f);
      ctx.fillRect(x, y, step, step);
    }
  }
}
function px(ctx, x, y, color, w = 1, h = 1) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

// ---------------------------------------------------------------- material recipes
// tile: world metres per texture repeat; 'face' = 0..1 per face.
export const MATERIALS = {
  sand: { tile: 4, paint: (c, r) => { noiseFill(c, 32, 32, 0xdcb06b, 0.14, r); for (let i = 0; i < 40; i++) px(c, r() * 32 | 0, r() * 32 | 0, shade(0xdcb06b, 0.82 + r() * 0.3)); for (let i = 0; i < 6; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#a88050', 2, 1); } },
  road: { tile: 4, paint: (c, r) => { noiseFill(c, 32, 32, 0x5a5550, 0.16, r); px(c, 0, 15, '#d8c35a', 32, 2); for (let i = 0; i < 20; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#4a4642'); } },
  asphalt: { tile: 4, paint: (c, r) => { noiseFill(c, 32, 32, 0x3c3c44, 0.18, r); for (let i = 0; i < 30; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#2f2f36'); } },
  rock: { tile: 3, paint: (c, r) => { noiseFill(c, 32, 32, 0xa9774b, 0.18, r, 2); strata(c, r, 0xa9774b); } },
  rockgrey: { tile: 3, paint: (c, r) => { noiseFill(c, 32, 32, 0x7d8088, 0.2, r, 2); strata(c, r, 0x7d8088); } },
  concrete: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0xb2aca2, 0.1, r); panelLines(c, '#958f86', 16); for (let i = 0; i < 12; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#9c968c'); } },
  plaster: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0xd9cfbd, 0.07, r); px(c, 0, 26, '#8a7f6e', 32, 6); px(c, 0, 26, '#6f6658', 32, 1); } },
  tile: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0xc9c3b6, 0.06, r); grid(c, '#9e978a', 8); } },
  metalfloor: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x76797c, 0.08, r); for (let y = 2; y < 32; y += 6) for (let x = (y % 12 ? 0 : 3); x < 32; x += 6) px(c, x, y, '#9a9ea2', 3, 1); panelLines(c, '#55585b', 16); } },
  roof: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x6e5e52, 0.1, r); for (let x = 0; x < 32; x += 4) px(c, x, 0, '#5a4c42', 1, 32); } },
  corrugated: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0xa08a6a, 0.08, r); for (let x = 0; x < 32; x += 4) { px(c, x, 0, '#7f6c52', 1, 32); px(c, x + 2, 0, '#b49e7c', 1, 32); } rust(c, r, 10); } },
  grate: { tile: 1, alpha: false, paint: (c, r) => { noiseFill(c, 32, 32, 0x55595d, 0.1, r); for (let i = 0; i < 32; i += 4) { px(c, i, 0, '#2d3033', 2, 32); px(c, 0, i, '#2d3033', 32, 1); } } },
  railing: { tile: 1, alpha: true, paint: (c) => { c.clearRect(0, 0, 32, 32); px(c, 0, 0, '#d6b02e', 32, 4); for (let x = 2; x < 32; x += 8) px(c, x, 0, '#b8961f', 2, 32); px(c, 0, 16, '#b8961f', 32, 2); } },
  fence: { tile: 2, alpha: true, paint: (c) => { c.clearRect(0, 0, 32, 32); c.fillStyle = '#9da3a8'; for (let i = -32; i < 32; i += 4) { for (let k = 0; k < 32; k++) { c.fillRect(i + k, k, 1, 1); c.fillRect(i + 32 - k, k, 1, 1); } } px(c, 0, 0, '#6e7378', 32, 2); } },
  metalstair: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0x6c7176, 0.1, r); px(c, 0, 0, '#d6b02e', 32, 3); for (let x = 1; x < 32; x += 3) px(c, x, 6, '#4c5054', 1, 26); } },
  crate: { tile: 'face', paint: (c, r) => { noiseFill(c, 32, 32, 0xa6783f, 0.1, r); for (let y = 0; y < 32; y += 8) px(c, 0, y, '#7a5428', 32, 1); px(c, 0, 0, '#5e3f1c', 32, 3); px(c, 0, 29, '#5e3f1c', 32, 3); px(c, 0, 0, '#5e3f1c', 3, 32); px(c, 29, 0, '#5e3f1c', 3, 32); for (let k = 3; k < 29; k++) px(c, k, k, '#6a4822', 2, 2); } },
  shelf: { tile: 'face', paint: (c, r) => { noiseFill(c, 32, 32, 0x4f6d8a, 0.08, r); for (let y = 0; y < 32; y += 10) px(c, 0, y, '#d48a2a', 32, 2); for (let i = 0; i < 6; i++) px(c, 2 + i * 5, 3 + (i % 2) * 10, '#a6783f', 4, 6); } },
  sandbag: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0xb59a6a, 0.12, r); for (let y = 0; y < 32; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < 32; x += 12) { px(c, x, y, '#8f7850', 12, 1); px(c, x, y, '#8f7850', 1, 8); } } },
  crane: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0xe2b12a, 0.08, r); for (let i = -32; i < 32; i += 8) for (let k = 0; k < 32; k++) px(c, i + k, k, '#2b2b2b', 3, 1); } },
  hazard: { tile: 1, paint: (c) => { for (let i = -32; i < 64; i += 8) for (let k = 0; k < 32; k++) { px(c, i + k, k, '#e2b12a', 4, 1); px(c, i + k + 4, k, '#222', 4, 1); } } },
  woodplank: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x8c6239, 0.1, r); for (let x = 0; x < 32; x += 6) px(c, x, 0, '#5d3f22', 1, 32); for (let i = 0; i < 8; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#6e4c2c', 1, 3); } },
  rail: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x6a5848, 0.1, r); for (let x = 0; x < 32; x += 8) px(c, x, 0, '#4d3a2a', 4, 32); px(c, 0, 6, '#8d9298', 32, 3); px(c, 0, 23, '#8d9298', 32, 3); } },
  flatcar: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x4a3b32, 0.1, r); panelLines(c, '#2e241e', 8); } },
  glass: { tile: 2, alpha: true, opacity: 0.35, paint: (c) => { c.fillStyle = 'rgba(170,215,235,0.55)'; c.fillRect(0, 0, 32, 32); px(c, 0, 0, 'rgba(70,80,90,0.9)', 32, 2); px(c, 0, 0, 'rgba(70,80,90,0.9)', 2, 32); for (let k = 4; k < 14; k++) px(c, k + 4, k, 'rgba(255,255,255,0.5)'); } },
  team_red: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0xc8402f, 0.08, r); px(c, 0, 0, '#8b2519', 32, 2); px(c, 0, 30, '#8b2519', 32, 2); } },
  team_blue: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0x3a72c4, 0.08, r); px(c, 0, 0, '#1f4682', 32, 2); px(c, 0, 30, '#1f4682', 32, 2); } },
  teamdark_red: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x7a2b22, 0.1, r); panelLines(c, '#5a1d16', 16); } },
  teamdark_blue: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x284a7a, 0.1, r); panelLines(c, '#1a3357', 16); } },
  metal: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x80868c, 0.08, r); panelLines(c, '#5d6268', 16); rivets(c, '#a4aab0', 16); } },
  darkmetal: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x41454c, 0.1, r); panelLines(c, '#2a2d32', 16); rivets(c, '#5c6168', 16); } },
  steel: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x9aa1a8, 0.06, r); panelLines(c, '#6f767d', 32); for (let i = 0; i < 6; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#b9c0c6', 4, 1); } },
  // Frostfall
  snow: { tile: 4, paint: (c, r) => { noiseFill(c, 32, 32, 0xe8f0f6, 0.05, r); for (let i = 0; i < 26; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#cfdde8'); for (let i = 0; i < 6; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#ffffff', 2, 1); } },
  snowrock: { tile: 3, paint: (c, r) => { noiseFill(c, 32, 32, 0x7b8796, 0.18, r, 2); px(c, 0, 0, '#eef4f8', 32, 6); for (let x = 0; x < 32; x += 2) px(c, x, 6, '#eef4f8', 2, r() * 5 | 0); } },
  ice: { tile: 3, paint: (c, r) => { noiseFill(c, 32, 32, 0x9fd3ea, 0.08, r); for (let i = 0; i < 5; i++) { let x = r() * 32 | 0, y = r() * 32 | 0; for (let k = 0; k < 10; k++) { px(c, x, y, '#dff4fc'); x += r() < 0.5 ? 1 : 0; y += 1; } } } },
  labwall: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0xd7dde2, 0.04, r); panelLines(c, '#a9b2ba', 16); px(c, 0, 20, '#3d8fd6', 32, 2); } },
  labfloor: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x9fb0bd, 0.05, r); grid(c, '#7f909d', 16); } },
  insulated: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x5f7f99, 0.08, r); for (let y = 0; y < 32; y += 4) px(c, 0, y, '#4b6a82', 32, 1); px(c, 0, 0, '#e8f0f6', 32, 3); } },
  // Pixelworks
  conveyor: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0x2b2b2e, 0.1, r); for (let y = 0; y < 32; y += 4) px(c, 0, y, '#4a4a50', 32, 2); px(c, 0, 0, '#e2b12a', 3, 32); px(c, 29, 0, '#e2b12a', 3, 32); } },
  factorywall: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x8a8f7a, 0.08, r); panelLines(c, '#6a6f5c', 16); px(c, 0, 26, '#4c5048', 32, 6); } },
  factoryfloor: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x6c6e70, 0.1, r); grid(c, '#56585a', 16); for (let i = 0; i < 6; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#4a3f2f', 3, 2); } },
  brick: { tile: 2, paint: (c, r) => bricks(c, r, 0x9c4a32, '#6e3222', 8, 4) },
  pipe: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0x5e7a68, 0.08, r); px(c, 0, 4, '#7d9c88', 32, 3); px(c, 0, 26, '#3f5446', 32, 3); } },
  // Sandstone Fortress
  sandstone: { tile: 2, paint: (c, r) => bricks(c, r, 0xd2a86b, '#a77f48', 16, 8) },
  sandbrick: { tile: 2, paint: (c, r) => bricks(c, r, 0xc49157, '#8f6534', 8, 4) },
  sandtile: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0xd9b77e, 0.06, r); grid(c, '#b38f57', 8); for (let i = 0; i < 4; i++) px(c, (r() * 4 | 0) * 8 + 2, (r() * 4 | 0) * 8 + 2, '#c47a3a', 4, 4); } },
  plank: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x7a5432, 0.1, r); for (let y = 0; y < 32; y += 5) px(c, 0, y, '#553820', 32, 1); } },
  // Neon district
  citywall: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x3a3550, 0.1, r); panelLines(c, '#2a2640', 16); for (let i = 0; i < 4; i++) px(c, (r() * 4 | 0) * 8 + 2, (r() * 4 | 0) * 8 + 2, r() < 0.5 ? '#ffd76a' : '#2b2840', 4, 5); } },
  citybrick: { tile: 2, paint: (c, r) => bricks(c, r, 0x5a3c4a, '#3b2632', 8, 4) },
  sidewalk: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x6d6a78, 0.08, r); grid(c, '#56535f', 16); } },
  neon_pink: { tile: 1, emissive: 0xff3fa8, paint: (c) => neon(c, '#ff3fa8') },
  neon_cyan: { tile: 1, emissive: 0x3ff2ff, paint: (c) => neon(c, '#3ff2ff') },
  neon_yellow: { tile: 1, emissive: 0xffe03f, paint: (c) => neon(c, '#ffe03f') },
  neon_green: { tile: 1, emissive: 0x58ff6a, paint: (c) => neon(c, '#58ff6a') },
  window: { tile: 2, emissive: 0x6a5a30, paint: (c, r) => { noiseFill(c, 32, 32, 0x2a2838, 0.06, r); for (let y = 2; y < 32; y += 10) for (let x = 2; x < 32; x += 10) px(c, x, y, r() < 0.55 ? '#ffd27a' : '#1e1c2a', 7, 7); } },
  // Overgrown outpost
  grass: { tile: 4, paint: (c, r) => { noiseFill(c, 32, 32, 0x5c8f3a, 0.16, r); for (let i = 0; i < 40; i++) px(c, r() * 32 | 0, r() * 32 | 0, r() < 0.5 ? '#76ad48' : '#477330', 1, 2); } },
  dirt: { tile: 4, paint: (c, r) => { noiseFill(c, 32, 32, 0x7a5a3a, 0.16, r); for (let i = 0; i < 20; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#5e4428', 2, 1); } },
  mossconcrete: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x9a9a8c, 0.1, r); panelLines(c, '#7f7f72', 16); for (let i = 0; i < 70; i++) { const y = r() < 0.6 ? 24 + r() * 8 : r() * 32; px(c, r() * 32 | 0, y | 0, r() < 0.5 ? '#5d8a3a' : '#4a7030', 2, 1); } for (let i = 0; i < 5; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#4b4b44', 1, 4); } },
  moss: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x4f7c35, 0.2, r, 2); } },
  rustmetal: { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, 0x7c6a5a, 0.1, r); panelLines(c, '#5a4c40', 16); rust(c, r, 30); } },
  water: { tile: 4, alpha: true, opacity: 0.75, paint: (c, r) => { noiseFill(c, 32, 32, 0x2f7f86, 0.08, r); for (let i = 0; i < 10; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#6fc3c8', 4, 1); } },
  bark: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0x5e4026, 0.14, r); for (let x = 0; x < 32; x += 5) px(c, x, 0, '#402a16', 1, 32); } },
  leaves: { tile: 1, paint: (c, r) => { noiseFill(c, 32, 32, 0x3f7a2c, 0.25, r, 2); for (let i = 0; i < 20; i++) px(c, r() * 32 | 0, r() * 32 | 0, '#6aa848', 2, 2); } },
};

function strata(c, r, base) {
  for (let y = 4; y < 32; y += 7 + (r() * 4 | 0)) { px(c, 0, y, shade(base, 0.78), 32, 1); px(c, 0, y + 1, shade(base, 1.12), 32, 1); }
}
function panelLines(c, color, step) { for (let i = 0; i < 32; i += step) { px(c, i, 0, color, 1, 32); px(c, 0, i, color, 32, 1); } }
function grid(c, color, step) { for (let i = 0; i < 32; i += step) { px(c, i, 0, color, 1, 32); px(c, 0, i, color, 32, 1); } }
function rivets(c, color, step) { for (let y = 2; y < 32; y += step) for (let x = 2; x < 32; x += step) { px(c, x, y, color); px(c, x + step - 4, y, color); } }
function rust(c, r, n) { for (let i = 0; i < n; i++) px(c, r() * 32 | 0, r() * 32 | 0, r() < 0.5 ? '#8a4a24' : '#a85c2c', 1 + (r() * 2 | 0), 1 + (r() * 3 | 0)); }
function bricks(c, r, base, mortar, bw, bh) {
  c.fillStyle = mortar; c.fillRect(0, 0, 32, 32);
  for (let y = 0, row = 0; y < 32; y += bh, row++) {
    for (let x = row % 2 ? -bw / 2 : 0; x < 32; x += bw) {
      const f = 0.86 + r() * 0.24;
      c.fillStyle = shade(base, f);
      c.fillRect(x + 1, y + 1, bw - 1, bh - 1);
      if (r() < 0.3) { c.fillStyle = shade(base, f * 1.12); c.fillRect(x + 1, y + 1, bw - 1, 1); }
    }
  }
}
function neon(c, color) {
  c.fillStyle = '#16131f'; c.fillRect(0, 0, 32, 32);
  c.fillStyle = color; c.fillRect(2, 2, 28, 28);
  c.fillStyle = 'rgba(255,255,255,0.65)'; c.fillRect(4, 4, 24, 3);
}

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const CONTAINER_COLORS = { red: 0xb2412e, blue: 0x2f62a8, green: 0x3f7f43, yellow: 0xd2a128, orange: 0xd06a28 };

export function materialRecipe(name) {
  if (MATERIALS[name]) return MATERIALS[name];
  if (name && name.startsWith('container_')) {
    const col = CONTAINER_COLORS[name.slice(10)] || 0x888888;
    return { tile: 2.6, paint: (c, r) => { noiseFill(c, 32, 32, col, 0.08, r); for (let x = 0; x < 32; x += 4) { px(c, x, 0, shade(col, 0.72), 1, 32); px(c, x + 2, 0, shade(col, 1.15), 1, 32); } px(c, 0, 0, shade(col, 0.6), 32, 2); px(c, 0, 30, shade(col, 0.6), 32, 2); rust(c, r, 6); } };
  }
  const tint = 0x707070 + (hashStr(name || 'x') & 0x3f3f3f);
  return { tile: 2, paint: (c, r) => { noiseFill(c, 32, 32, tint, 0.12, r); panelLines(c, shade(tint, 0.75), 16); } };
}

export function getTexture(name) {
  const key = 'm:' + name;
  if (cache.has(key)) return cache.get(key);
  const rec = materialRecipe(name);
  const cv = canvas(32, 32);
  const ctx = cv.getContext('2d');
  rec.paint(ctx, mulberry32(hashStr(name)));
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

const matCache = new Map();
export function getWorldMaterial(name) {
  if (matCache.has(name)) return matCache.get(name);
  const rec = materialRecipe(name);
  const opts = { map: getTexture(name), vertexColors: true };
  if (rec.alpha) { opts.transparent = (rec.opacity ?? 1) < 1; opts.alphaTest = rec.opacity ? 0 : 0.5; opts.opacity = rec.opacity ?? 1; opts.side = THREE.DoubleSide; opts.depthWrite = !opts.transparent; }
  let m;
  if (rec.emissive) m = new THREE.MeshBasicMaterial({ map: opts.map, vertexColors: false });
  else m = new THREE.MeshLambertMaterial(opts);
  m.userData.tile = rec.tile;
  matCache.set(name, m);
  return m;
}

// Small canvas texture with text (signs, billboards, nameplates).
export function textTexture(text, { w = 128, h = 32, bg = '#222', fg = '#fff', font = 'bold 18px monospace', border = null, pixel = true } = {}) {
  const key = `t:${text}:${w}:${h}:${bg}:${fg}:${font}:${border}`;
  if (cache.has(key)) return cache.get(key);
  const cv = canvas(w, h);
  const c = cv.getContext('2d');
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
  if (border) { c.fillStyle = border; c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(w - 2, 0, 2, h); }
  c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(cv);
  if (pixel) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearFilter; }
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export { canvas as makeCanvas, noiseFill, px as pixel };
