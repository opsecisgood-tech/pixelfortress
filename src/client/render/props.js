// Decorative prop builders (environmental storytelling). Each returns a THREE.Group positioned at the
// prop origin (feet). Static props are later merged for performance; animated ones set userData.dynamic.
import * as THREE from 'three';
import { bx, cyl, colorMat } from './blocks.js';
import { textTexture } from './textures.js';
import { TEAM_COLORS_HEX, TEAM_DARK_HEX } from '../../shared/constants.js';

const C = {
  metal: 0x80868c, dark: 0x3b3f45, rust: 0x8a4a24, yellow: 0xe2b12a, wood: 0x8c6239, darkwood: 0x5d3f22,
  green: 0x4f7c35, leaf: 0x3f7a2c, leaf2: 0x5c9a3a, bark: 0x5e4026, snow: 0xeef4f8, rock: 0x7d8088, sand: 0xc49157,
  glass: 0x9fd3ea, red: 0xc8402f, white: 0xe8ecef, black: 0x222222,
};

function teamCol(t) { return t === 1 ? TEAM_COLORS_HEX[1] : t === 0 ? TEAM_COLORS_HEX[0] : 0x888888; }

function label(text, w, h, color = '#fff', bg = '#2a2a2a', font) {
  const tex = textTexture(text, { w: 128, h: 32, bg, fg: color, font: font || 'bold 20px monospace', border: '#111' });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

function glowMat(color) { return colorMat(color, { basic: true }); }

export const PROPS = {
  flagbase(g, d) {
    cyl(g, 0, 0, 0, 0.8, 0.12, teamCol(d.team), 8);
    cyl(g, 0, 0.12, 0, 0.6, 0.06, 0xffffff, 8, { basic: true, material: glowMat(teamCol(d.team)) });
  },
  resupply(g, d) {
    bx(g, 0, 0, 0, 1.4, 2.2, 0.7, 0x4a4f55);
    bx(g, 0, 0.2, -0.36, 1.2, 1.8, 0.04, teamCol(d.team));
    bx(g, 0, 1.2, -0.39, 0.5, 0.5, 0.02, 0xffffff, { material: glowMat(0xffffff) });
    bx(g, 0, 1.3, -0.4, 0.3, 0.1, 0.02, 0, { material: glowMat(teamCol(d.team)) });
    bx(g, 0, 1.2, -0.4, 0.1, 0.3, 0.02, 0, { material: glowMat(teamCol(d.team)) });
  },
  spawnsign(g, d) {
    const m = label(d.team === 1 ? 'BLU SPAWN' : 'RED SPAWN', 2.4, 0.6, '#fff', d.team === 1 ? '#2a5aa0' : '#a33224');
    m.position.set(0, 0, -0.05);
    g.add(m);
  },
  banner(g, d) {
    bx(g, 0, 0, 0, 0.1, 0.1, 1.6, C.dark);
    bx(g, 0, -3, 0, 0.05, 3, 1.4, teamCol(d.team));
    bx(g, 0, -2.2, 0, 0.07, 0.8, 0.8, 0xffffff, { material: colorMat(TEAM_DARK_HEX[d.team ?? 0]) });
  },
  teamsign(g, d) {
    const m = label(d.label || 'HQ', 5, 1.2, '#fff', d.team === 1 ? '#2a5aa0' : '#a33224', 'bold 22px monospace');
    m.rotation.y = 0;
    m.position.set(0, 0, -0.05);
    g.add(m);
  },
  lamp(g, d) {
    bx(g, 0, 0, 0, 0.15, 3.6, 0.15, C.dark);
    bx(g, 0, 3.6, -0.3, 0.12, 0.12, 0.7, C.dark);
    bx(g, 0, 3.4, -0.55, 0.4, 0.2, 0.4, d.color || 0xffe2a0, { material: glowMat(d.color || 0xffe2a0) });
  },
  streetlight(g, d) {
    bx(g, 0, 0, 0, 0.2, 6, 0.2, 0x4a4f55);
    bx(g, 0, 6, -0.6, 0.18, 0.18, 1.4, 0x4a4f55);
    bx(g, 0, 5.75, -1.1, 0.5, 0.25, 0.6, 0, { material: glowMat(d.color || 0xffd28a) });
  },
  hangingLamp(g, d) {
    bx(g, 0, -1.5, 0, 0.04, 1.5, 0.04, C.black);
    bx(g, 0, -1.8, 0, 0.8, 0.3, 0.8, C.dark);
    bx(g, 0, -1.9, 0, 0.6, 0.1, 0.6, 0, { material: glowMat(0xffe8c0) });
  },
  forklift(g) {
    bx(g, 0, 0.2, 0, 1.3, 0.9, 1.8, C.yellow);
    bx(g, 0, 1.1, 0.3, 1.2, 0.9, 0.9, 0x333333, { opacity: 1 });
    bx(g, 0, 2.0, 0.3, 1.3, 0.08, 1.0, C.yellow);
    bx(g, 0, 0, -1.1, 1.0, 2.2, 0.12, C.dark);
    bx(g, -0.3, 0.1, -1.6, 0.15, 0.06, 0.9, C.metal);
    bx(g, 0.3, 0.1, -1.6, 0.15, 0.06, 0.9, C.metal);
    for (const [x, z] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]]) cyl(g, x, 0.0, z, 0.25, 0.25, C.black, 8, { rz: Math.PI / 2 });
  },
  barrel(g, d) {
    const col = d.color || [0x2f62a8, 0xb2412e, 0x3f7f43, 0xd2a128][Math.abs(Math.round(d.pos[0] * 3 + d.pos[2])) % 4];
    cyl(g, 0, 0, 0, 0.42, 1.2, col, 10);
    cyl(g, 0, 0.35, 0, 0.44, 0.06, C.dark, 10);
    cyl(g, 0, 0.8, 0, 0.44, 0.06, C.dark, 10);
  },
  pallet(g) {
    for (const z of [-0.5, 0, 0.5]) bx(g, 0, 0, z, 1.2, 0.12, 0.15, C.wood);
    for (const x of [-0.5, 0, 0.5]) bx(g, x, 0.12, 0, 0.14, 0.04, 1.2, C.wood);
    bx(g, 0.1, 0.16, 0, 0.8, 0.5, 0.8, 0xa6783f);
  },
  craneCab(g) {
    bx(g, 0, 0, 0, 2.2, 2, 2.2, C.yellow);
    bx(g, 0, 0.6, -1.12, 1.8, 0.9, 0.05, C.glass);
  },
  craneHook(g) {
    const h = new THREE.Group();
    h.userData.dynamic = true;
    h.userData.anim = 'sway';
    bx(h, 0, 0, 0, 0.05, 7, 0.05, C.black);
    bx(h, 0, -0.6, 0, 0.6, 0.6, 0.3, C.yellow);
    bx(h, 0, -1.0, 0, 0.12, 0.5, 0.12, C.dark);
    h.position.y = 0;
    g.add(h);
  },
  cactus(g) {
    bx(g, 0, 0, 0, 0.5, 2.6, 0.5, 0x4f8a3a);
    bx(g, 0.45, 1.0, 0, 0.45, 0.35, 0.35, 0x4f8a3a);
    bx(g, 0.55, 1.0, 0, 0.35, 1.1, 0.35, 0x4f8a3a);
    bx(g, -0.45, 1.5, 0, 0.45, 0.3, 0.3, 0x4f8a3a);
    bx(g, -0.55, 1.5, 0, 0.3, 0.8, 0.3, 0x4f8a3a);
    bx(g, 0, 2.6, 0, 0.3, 0.15, 0.3, 0xe06aa8);
  },
  rockpile(g) {
    bx(g, 0, 0, 0, 2.4, 1.2, 1.8, 0xa9774b);
    bx(g, 0.8, 0, 0.9, 1.2, 0.8, 1.2, 0x9a6a40);
    bx(g, -0.5, 1.2, -0.2, 1.1, 0.7, 1.0, 0xb4845a);
  },
  tumbleweed(g) {
    const t = new THREE.Group();
    t.userData.dynamic = true; t.userData.anim = 'roll';
    bx(t, 0, -0.35, 0, 0.7, 0.7, 0.7, 0x9a7a48, { opacity: 1 });
    bx(t, 0, -0.45, 0, 0.9, 0.5, 0.5, 0x8a6a3a);
    t.position.y = 0.4;
    g.add(t);
  },
  watertower(g) {
    for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) bx(g, x, 0, z, 0.25, 6, 0.25, C.darkwood);
    cyl(g, 0, 6, 0, 1.7, 3, 0x8c6239, 10);
    cyl(g, 0, 9, 0, 1.8, 0.5, 0x6e4c2c, 10, { r2: 0.3 });
    bx(g, 0, 7, -1.75, 2.2, 0.5, 0.05, 0x2a2a2a);
  },
  sign(g, d) {
    bx(g, -0.8, 0, 0, 0.12, 2.2, 0.12, C.dark);
    bx(g, 0.8, 0, 0, 0.12, 2.2, 0.12, C.dark);
    const m = label(d.label || 'SIGN', 2.0, 0.7, '#111', '#e2b12a');
    m.position.set(0, 1.85, -0.07);
    m.rotation.y = Math.PI;
    g.add(m);
    const m2 = m.clone(); m2.position.z = 0.07; m2.rotation.y = 0; g.add(m2);
  },
  pipe(g, d) {
    const len = d.len || 6;
    bx(g, 0, 0.6, 0, len, 0.5, 0.5, 0x5e7a68);
    for (let x = -len / 2 + 0.5; x < len / 2; x += 2) bx(g, x, 0, 0, 0.2, 0.6, 0.6, C.dark);
  },
  // ---- Frostfall
  pine(g, d) {
    const s = d.scale || 1;
    bx(g, 0, 0, 0, 0.5 * s, 1.6 * s, 0.5 * s, C.bark);
    for (let i = 0; i < 4; i++) {
      const w = (2.6 - i * 0.55) * s;
      bx(g, 0, (1.2 + i * 1.0) * s, 0, w, 1.0 * s, w, 0x2f5a3a);
      bx(g, 0, (2.0 + i * 1.0) * s, 0, w * 0.85, 0.22 * s, w * 0.85, C.snow);
    }
  },
  icicles(g, d) {
    const n = d.n || 6;
    for (let i = 0; i < n; i++) bx(g, (i - n / 2) * 0.35, -0.6 - (i % 3) * 0.2, 0, 0.12, 0.6 + (i % 3) * 0.2, 0.12, 0xd6f0fb);
  },
  antenna(g) {
    bx(g, 0, 0, 0, 0.2, 9, 0.2, C.metal);
    for (let y = 2; y < 9; y += 2) bx(g, 0, y, 0, 1.2 - y * 0.08, 0.08, 0.08, C.metal);
    bx(g, 0, 9, 0, 0.3, 0.3, 0.3, 0, { material: glowMat(0xff4040) });
  },
  dish(g) {
    bx(g, 0, 0, 0, 0.6, 1.6, 0.6, C.metal);
    const d = new THREE.Group();
    d.position.set(0, 2.2, 0);
    d.rotation.x = -0.6;
    bx(d, 0, -0.1, 0, 3, 0.2, 3, C.white);
    bx(d, 0, 0.1, 0, 2.4, 0.2, 2.4, 0xd0d6da);
    bx(d, 0, 0.3, 0, 0.12, 1.2, 0.12, C.dark);
    g.add(d);
  },
  labtank(g, d) {
    cyl(g, 0, 0, 0, 0.7, 0.3, C.dark, 10);
    cyl(g, 0, 0.3, 0, 0.6, 2.2, d.color || 0x58ffd0, 10, { material: colorMat(d.color || 0x58ffd0, { basic: true, opacity: 0.55 }) });
    cyl(g, 0, 2.5, 0, 0.7, 0.3, C.dark, 10);
  },
  console(g, d) {
    bx(g, 0, 0, 0, 1.4, 1.0, 0.8, 0x4a4f55);
    bx(g, 0, 1.0, 0.1, 1.4, 0.6, 0.12, 0x3a3f45, { rx: -0.4 });
    bx(g, 0, 1.05, 0.0, 1.1, 0.4, 0.02, 0, { material: glowMat(d.color || 0x3ff2a0), rx: -0.4 });
    for (let i = 0; i < 4; i++) bx(g, -0.45 + i * 0.3, 0.92, -0.35, 0.12, 0.08, 0.08, 0, { material: glowMat([0xff4040, 0xffd040, 0x40ff60, 0x40a0ff][i]) });
  },
  snowpile(g, d) {
    const s = d.scale || 1;
    bx(g, 0, 0, 0, 2.4 * s, 0.6 * s, 1.8 * s, C.snow);
    bx(g, 0.2, 0.6 * s, 0, 1.4 * s, 0.4 * s, 1.0 * s, C.snow);
  },
  generator(g) {
    bx(g, 0, 0, 0, 2.2, 1.6, 1.4, 0x5f7f99);
    bx(g, 0, 1.6, 0, 1.6, 0.3, 1.0, C.dark);
    bx(g, -1.12, 0.4, 0, 0.04, 0.8, 1.0, C.dark);
    bx(g, 0.6, 1.9, 0.2, 0.25, 0.8, 0.25, C.metal);
    bx(g, 0.0, 0.9, -0.71, 0.4, 0.3, 0.02, 0, { material: glowMat(0x40ff60) });
  },
  crystal(g, d) {
    const col = d.color || 0x9fe6ff;
    bx(g, 0, 0, 0, 0.6, 1.8, 0.6, col, { ry: 0.4, material: colorMat(col, { emissive: 0x204050 }) });
    bx(g, 0.4, 0, 0.2, 0.4, 1.1, 0.4, col, { ry: 0.9, rz: 0.2, material: colorMat(col, { emissive: 0x204050 }) });
    bx(g, -0.3, 0, -0.2, 0.35, 0.8, 0.35, col, { ry: 0.2, rz: -0.25, material: colorMat(col, { emissive: 0x204050 }) });
  },
  floodlight(g, d) {
    bx(g, 0, 0, 0, 0.2, 4, 0.2, C.dark);
    bx(g, 0, 4, 0, 1.2, 0.6, 0.4, C.dark);
    bx(g, 0, 4.1, -0.21, 1.0, 0.4, 0.02, 0, { material: glowMat(d.color || 0xdff0ff) });
  },
  // ---- Pixelworks
  robotArm(g, d) {
    bx(g, 0, 0, 0, 1.2, 0.5, 1.2, C.dark);
    const a = new THREE.Group();
    a.userData.dynamic = true; a.userData.anim = 'robot'; a.userData.phase = (d.pos[0] + d.pos[2]) * 0.3;
    a.position.y = 0.5;
    bx(a, 0, 0, 0, 0.6, 0.4, 0.6, 0xe28a2a);
    const upper = new THREE.Group(); upper.position.y = 0.4; upper.name = 'upper'; a.add(upper);
    bx(upper, 0, 0, 0, 0.35, 2.0, 0.35, 0xe28a2a);
    const fore = new THREE.Group(); fore.position.y = 2.0; fore.name = 'fore'; upper.add(fore);
    bx(fore, 0, 0, 0, 0.28, 1.6, 0.28, 0xe2b12a);
    bx(fore, 0, 1.6, 0, 0.5, 0.25, 0.5, C.dark);
    bx(fore, 0, 1.85, 0, 0.15, 0.2, 0.15, 0, { material: glowMat(0x3ff2ff) });
    g.add(a);
  },
  press(g) {
    bx(g, -1.1, 0, 0, 0.4, 4, 0.8, C.dark);
    bx(g, 1.1, 0, 0, 0.4, 4, 0.8, C.dark);
    bx(g, 0, 4, 0, 2.6, 0.6, 1.0, 0xe2b12a);
    const ram = new THREE.Group(); ram.userData.dynamic = true; ram.userData.anim = 'press'; ram.position.y = 2.5;
    bx(ram, 0, 0, 0, 1.6, 1.2, 0.7, 0x80868c);
    bx(ram, 0, 1.2, 0, 0.4, 1.0, 0.4, C.metal);
    g.add(ram);
    bx(g, 0, 0, 0, 2.0, 0.6, 1.0, C.dark);
  },
  gear(g, d) {
    const r = d.r || 1.6;
    const gr = new THREE.Group(); gr.userData.dynamic = true; gr.userData.anim = 'spinZ'; gr.userData.speed = d.speed || 0.6;
    bx(gr, 0, -r * 0.8, 0, r * 1.6, r * 1.6, 0.3, 0x80868c);
    for (let i = 0; i < 8; i++) {
      const t = bx(gr, 0, -0.25, 0, 0.5, 0.5, 0.32, 0x6d7378);
      t.position.set(Math.cos(i * Math.PI / 4) * r * 0.95, Math.sin(i * Math.PI / 4) * r * 0.95, 0);
      t.rotation.z = i * Math.PI / 4;
    }
    bx(gr, 0, -0.3, 0.05, 0.6, 0.6, 0.35, C.dark);
    gr.position.y = 0;
    g.add(gr);
  },
  silo(g, d) {
    cyl(g, 0, 0, 0, d.r || 2, d.h || 8, 0x9aa1a8, 12);
    cyl(g, 0, d.h || 8, 0, d.r || 2, 1, 0x80868c, 12, { r2: 0.4 });
    bx(g, 0, (d.h || 8) * 0.5, -(d.r || 2), 1.6, 0.8, 0.05, C.yellow);
  },
  fan(g) {
    bx(g, 0, 0, 0, 2.4, 2.4, 0.4, C.dark);
    const f = new THREE.Group(); f.userData.dynamic = true; f.userData.anim = 'spinZ'; f.userData.speed = 6;
    f.position.set(0, 1.2, -0.22);
    for (let i = 0; i < 4; i++) { const b = bx(f, 0, -0.1, 0, 1.0, 0.2, 0.04, C.metal); b.position.set(Math.cos(i * Math.PI / 2) * 0.5, Math.sin(i * Math.PI / 2) * 0.5, 0); b.rotation.z = i * Math.PI / 2; }
    g.add(f);
  },
  warningLight(g) {
    bx(g, 0, 0, 0, 0.3, 0.2, 0.3, C.dark);
    const l = new THREE.Group(); l.userData.dynamic = true; l.userData.anim = 'spinY'; l.userData.speed = 5;
    l.position.y = 0.2;
    bx(l, 0, 0, 0, 0.26, 0.3, 0.26, 0, { material: glowMat(0xff7a20) });
    bx(l, 0.16, 0.05, 0, 0.06, 0.2, 0.2, 0, { material: glowMat(0xffd040) });
    g.add(l);
  },
  cablereel(g) {
    cyl(g, 0, 0, 0, 0.9, 0.12, C.darkwood, 10, { rx: 0 });
    cyl(g, 0, 0.12, 0, 0.5, 0.8, 0x222222, 10);
    cyl(g, 0, 0.92, 0, 0.9, 0.12, C.darkwood, 10);
  },
  // ---- Sandstone
  palm(g, d) {
    const s = d.scale || 1;
    for (let i = 0; i < 6; i++) bx(g, i * 0.12 * s, i * 0.9 * s, 0, 0.45 * s, 0.9 * s, 0.45 * s, i % 2 ? 0x8a6a3a : 0x7a5a2e);
    const top = 5.4 * s;
    for (let i = 0; i < 6; i++) {
      const leaf = bx(g, 0.7 * s, top, 0, 2.6 * s, 0.12 * s, 0.6 * s, 0x4f8a3a);
      leaf.position.set(0.7 * s + Math.cos(i) * 1.1 * s, top - 0.2 * s, Math.sin(i * 1.05) * 1.1 * s);
      leaf.rotation.y = i * 1.05;
      leaf.rotation.z = -0.35;
    }
  },
  torch(g, d) {
    bx(g, 0, 0, 0, 0.15, 1.2, 0.15, C.darkwood);
    bx(g, 0, 1.2, 0, 0.3, 0.2, 0.3, C.dark);
    const f = new THREE.Group(); f.userData.dynamic = true; f.userData.anim = 'flicker';
    f.position.y = 1.4;
    bx(f, 0, 0, 0, 0.22, 0.35, 0.22, 0, { material: glowMat(0xffa030) });
    bx(f, 0, 0.1, 0, 0.12, 0.35, 0.12, 0, { material: glowMat(0xfff080) });
    g.add(f);
    void d;
  },
  urn(g, d) {
    cyl(g, 0, 0, 0, 0.35, 0.2, 0xb0703a, 8, { r2: 0.45 });
    cyl(g, 0, 0.2, 0, 0.45, 0.6, 0xc47a3a, 8, { r2: 0.3 });
    cyl(g, 0, 0.8, 0, 0.3, 0.2, 0xa06030, 8, { r2: 0.2 });
    void d;
  },
  awning(g, d) {
    const col = d.color || 0xc8402f;
    bx(g, -1.4, 0, -0.9, 0.12, 2.6, 0.12, C.darkwood);
    bx(g, 1.4, 0, -0.9, 0.12, 2.6, 0.12, C.darkwood);
    for (let i = 0; i < 6; i++) bx(g, -1.5 + i * 0.5 + 0.25, 2.6, 0, 0.5, 0.08, 2.0, i % 2 ? col : 0xeeeeee, { rx: 0.25 });
  },
  well(g) {
    cyl(g, 0, 0, 0, 1.2, 0.9, 0xb38f57, 10);
    cyl(g, 0, 0.85, 0, 1.0, 0.06, 0x2f6f8a, 10, { material: colorMat(0x2f6f8a, { basic: true }) });
    bx(g, -1.1, 0.9, 0, 0.15, 1.6, 0.15, C.darkwood);
    bx(g, 1.1, 0.9, 0, 0.15, 1.6, 0.15, C.darkwood);
    bx(g, 0, 2.5, 0, 2.6, 0.5, 1.4, 0x9c4a32, { rx: 0 });
  },
  cart(g) {
    bx(g, 0, 0.5, 0, 2.0, 0.7, 1.2, C.wood);
    cyl(g, -0.7, 0.15, 0.65, 0.4, 0.1, C.darkwood, 8, { rx: Math.PI / 2 });
    cyl(g, 0.7, 0.15, 0.65, 0.4, 0.1, C.darkwood, 8, { rx: Math.PI / 2 });
    bx(g, 1.4, 0.6, 0, 1.2, 0.08, 0.1, C.darkwood);
    bx(g, -0.2, 1.2, 0, 1.2, 0.5, 0.9, 0xc49157);
  },
  // ---- Neon district
  billboard(g, d) {
    bx(g, -1.6, 0, 0, 0.2, d.h || 3, 0.2, C.dark);
    bx(g, 1.6, 0, 0, 0.2, d.h || 3, 0.2, C.dark);
    const tex = textTexture(d.label || 'PIXEL', { w: 128, h: 48, bg: d.bg || '#1a1030', fg: d.fg || '#ff3fa8', font: 'bold 30px monospace', border: d.fg || '#ff3fa8' });
    const m = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 0.15), [colorMat(0x222222), colorMat(0x222222), colorMat(0x222222), colorMat(0x222222), new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
    m.position.y = (d.h || 3) + 0.8;
    g.add(m);
  },
  neonSign(g, d) {
    const tex = textTexture(d.label || 'OPEN', { w: 128, h: 32, bg: '#120c1c', fg: d.fg || '#3ff2ff', font: 'bold 22px monospace', border: d.fg || '#3ff2ff' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.w || 3, (d.w || 3) / 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.position.y = 0;
    g.add(m);
  },
  vent(g) {
    bx(g, 0, 0, 0, 1.4, 0.8, 1.4, 0x6a6f78);
    for (let i = 0; i < 4; i++) bx(g, -0.5 + i * 0.33, 0.8, 0, 0.08, 0.06, 1.2, C.dark);
  },
  acunit(g) {
    bx(g, 0, 0, 0, 1.2, 0.9, 0.7, 0xb8bcc2);
    cyl(g, 0, 0.45, -0.36, 0.3, 0.02, C.dark, 10, { rx: Math.PI / 2 });
  },
  car(g, d) {
    const col = d.color || 0x3a72c4;
    bx(g, 0, 0.3, 0, 1.8, 0.7, 4, col);
    bx(g, 0, 1.0, 0.3, 1.6, 0.6, 2.0, col);
    bx(g, 0, 1.05, -0.72, 1.5, 0.5, 0.04, 0x1a2a3a);
    bx(g, -0.6, 0.55, -2.01, 0.35, 0.18, 0.02, 0, { material: glowMat(0xfff4c0) });
    bx(g, 0.6, 0.55, -2.01, 0.35, 0.18, 0.02, 0, { material: glowMat(0xfff4c0) });
    bx(g, -0.6, 0.55, 2.01, 0.35, 0.18, 0.02, 0, { material: glowMat(0xff3030) });
    bx(g, 0.6, 0.55, 2.01, 0.35, 0.18, 0.02, 0, { material: glowMat(0xff3030) });
    for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) cyl(g, x, 0.0, z, 0.32, 0.2, C.black, 8, { rz: Math.PI / 2 });
  },
  hydrant(g) {
    cyl(g, 0, 0, 0, 0.18, 0.7, 0xd03a2a, 8);
    cyl(g, 0, 0.7, 0, 0.2, 0.15, 0xb02a1a, 8, { r2: 0.1 });
    bx(g, 0, 0.4, 0, 0.55, 0.12, 0.12, 0xb02a1a);
  },
  trashbin(g) {
    bx(g, 0, 0, 0, 0.9, 1.0, 0.7, 0x3f7f43);
    bx(g, 0, 1.0, 0, 0.95, 0.1, 0.75, 0x2f6033);
  },
  holo(g, d) {
    cyl(g, 0, 0, 0, 0.6, 0.3, C.dark, 10);
    const h = new THREE.Group(); h.userData.dynamic = true; h.userData.anim = 'spinY'; h.userData.speed = 1.2; h.userData.bob = true;
    h.position.y = 1.6;
    bx(h, 0, -0.5, 0, 1.0, 1.0, 1.0, 0, { material: colorMat(d.color || 0x3ff2ff, { basic: true, opacity: 0.55 }) });
    bx(h, 0, -0.25, 0, 0.5, 0.5, 0.5, 0, { material: glowMat(0xffffff) });
    g.add(h);
  },
  // ---- Overgrown outpost
  tree(g, d) {
    const s = d.scale || 1;
    bx(g, 0, 0, 0, 0.7 * s, 3.2 * s, 0.7 * s, C.bark);
    bx(g, 0, 2.6 * s, 0, 3.6 * s, 1.6 * s, 3.6 * s, C.leaf);
    bx(g, 0.3 * s, 4.2 * s, -0.2 * s, 2.6 * s, 1.2 * s, 2.6 * s, C.leaf2);
    bx(g, -0.2 * s, 5.4 * s, 0.1 * s, 1.4 * s, 0.8 * s, 1.4 * s, C.leaf);
  },
  bush(g, d) {
    const s = d.scale || 1;
    bx(g, 0, 0, 0, 1.4 * s, 0.9 * s, 1.2 * s, C.leaf);
    bx(g, 0.4 * s, 0.4 * s, 0.2 * s, 0.8 * s, 0.7 * s, 0.8 * s, C.leaf2);
  },
  vine(g, d) {
    const len = d.len || 3;
    for (let i = 0; i < 5; i++) bx(g, (i - 2) * 0.4, -len + (i % 2) * 0.6, 0, 0.12, len - (i % 2) * 0.6, 0.12, i % 2 ? C.leaf2 : C.leaf, { shadow: false });
  },
  mushroom(g, d) {
    const s = d.scale || 1;
    bx(g, 0, 0, 0, 0.2 * s, 0.5 * s, 0.2 * s, 0xe8dcc0);
    bx(g, 0, 0.5 * s, 0, 0.7 * s, 0.25 * s, 0.7 * s, d.color || 0xc8402f);
    bx(g, 0.15 * s, 0.75 * s, 0.1 * s, 0.12 * s, 0.02, 0.12 * s, 0xffffff);
  },
  lilypad(g) { bx(g, 0, 0, 0, 0.9, 0.04, 0.9, 0x4f9a3a, { shadow: false }); },
  fern(g) {
    for (let i = 0; i < 5; i++) { const b = bx(g, 0, 0, 0, 0.12, 0.9, 0.4, C.leaf2, { shadow: false }); b.rotation.y = i * 1.25; b.rotation.z = 0.4; }
  },
  brokenmachine(g) {
    bx(g, 0, 0, 0, 2.4, 1.4, 1.6, 0x7c6a5a);
    bx(g, 0.4, 1.4, 0, 1.2, 0.8, 1.2, 0x6a584a, { rz: 0.15 });
    bx(g, -1.3, 0.2, 0.3, 0.6, 0.4, 0.6, 0x8a4a24);
    bx(g, 0.5, 2.2, 0.0, 0.2, 1.4, 0.2, C.dark, { rz: 0.5 });
    bx(g, -0.3, 0.6, -0.81, 0.5, 0.3, 0.02, 0x44403a);
  },
  log(g, d) { cyl(g, 0, 0.4, 0, 0.4, d.len || 3, C.bark, 8, { rz: Math.PI / 2 }); },
  stump(g) { cyl(g, 0, 0, 0, 0.5, 0.6, C.bark, 8); bx(g, 0, 0.6, 0, 0.7, 0.04, 0.7, 0xa88a5a); },
};

export function buildProp(d) {
  const g = new THREE.Group();
  const fn = PROPS[d.type];
  if (fn) fn(g, d);
  else bx(g, 0, 0, 0, 0.8, 0.8, 0.8, 0x888888);
  g.position.set(d.pos[0], d.pos[1], d.pos[2]);
  g.rotation.y = d.rot || 0;
  if (d.scale && !['pine', 'palm', 'tree', 'bush', 'mushroom', 'snowpile'].includes(d.type)) g.scale.setScalar(d.scale);
  return g;
}

// Animate dynamic props each frame.
export function animateProp(o, t, dt) {
  const a = o.userData.anim;
  switch (a) {
    case 'sway': o.rotation.z = Math.sin(t * 0.7) * 0.06; o.rotation.x = Math.sin(t * 0.5) * 0.04; break;
    case 'roll': o.rotation.x += dt * 1.5; o.position.y = 0.4 + Math.abs(Math.sin(t * 2)) * 0.15; break;
    case 'spinZ': o.rotation.z += dt * (o.userData.speed || 1); break;
    case 'spinY': o.rotation.y += dt * (o.userData.speed || 1); if (o.userData.bob) o.position.y = (o.userData.baseY ??= o.position.y) + Math.sin(t * 2) * 0.15; break;
    case 'press': o.position.y = (o.userData.baseY ??= o.position.y) - Math.max(0, Math.sin(t * 1.4)) * 1.4; break;
    case 'flicker': o.scale.setScalar(0.85 + Math.sin(t * 17 + o.id) * 0.1 + Math.sin(t * 9) * 0.08); break;
    case 'robot': {
      const ph = o.userData.phase || 0;
      o.rotation.y = Math.sin(t * 0.6 + ph) * 1.2;
      const up = o.getObjectByName('upper'); const fo = o.getObjectByName('fore');
      if (up) up.rotation.z = Math.sin(t * 0.9 + ph) * 0.5 - 0.3;
      if (fo) fo.rotation.z = Math.sin(t * 1.3 + ph) * 0.8 + 0.6;
      break;
    }
    default:
  }
}
