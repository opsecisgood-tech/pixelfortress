// 3D crate-opening stage, rendered full screen behind the crate UI.
//  - Supply crate:  a detailed wooden shipping crate in natural plywood (corner posts, rails, X braces,
//                   planked walls and lid, stencil). Drops in, wobbles, the lid pops off.
//  - Armored crate: the same crate, painted blue. Heavier drop and a harder rattle before the lid blows.
//  - Vault crate:   a riveted steel vault cube with a round door (spoked wheel, locking bars, hinges,
//                   dial). Descends slowly, the wheel spins, the bars retract and the door swings open.
// Anti z-fighting: every part sits at its own depth (no two faces share a plane where they overlap);
// details like plank grooves, grain, rivets and the stencil are painted into textures, not stacked.
import * as THREE from 'three';

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ---------------------------------------------------------------- textures (canvas)
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const shade = (hex, f) => {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0, g = Math.min(255, ((hex >> 8) & 255) * f) | 0, b = Math.min(255, (hex & 255) * f) | 0;
  return `rgb(${r},${g},${b})`;
};
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Plank wall: vertical boards with grooves, grain and knots.
function plankCanvas(base, seed) {
  const c = canvas(256, 256), x = c.getContext('2d'), r = rng(seed);
  const n = 5, w = 256 / n;
  for (let i = 0; i < n; i++) {
    x.fillStyle = shade(base, 0.92 + r() * 0.16); x.fillRect(i * w, 0, w, 256);
    for (let k = 0; k < 18; k++) { x.fillStyle = shade(base, 0.78 + r() * 0.12); x.fillRect(i * w + 2 + r() * (w - 4), 0, 1, 256); }
    if (r() < 0.6) { const ky = r() * 220 + 18, kx = i * w + 8 + r() * (w - 16); x.fillStyle = shade(base, 0.6); x.beginPath(); x.ellipse(kx, ky, 3, 6, 0, 0, Math.PI * 2); x.fill(); }
    x.fillStyle = shade(base, 0.45); x.fillRect(i * w, 0, 2, 256);
    x.fillStyle = shade(base, 1.12); x.fillRect(i * w + 2, 0, 1, 256);
  }
  return c;
}
// Board (rails, posts, braces): grain along the length (horizontal = along u), nails near the ends.
function boardCanvas(base, seed, vertical = false, text = null, textCol = '#3a2a1c') {
  const L = 256, S = 48;
  const c = vertical ? canvas(S, L) : canvas(L, S), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = shade(base, 1.04); x.fillRect(0, 0, c.width, c.height);
  for (let k = 0; k < 26; k++) {
    x.fillStyle = shade(base, 0.8 + r() * 0.14);
    if (vertical) x.fillRect(2 + r() * (S - 4), 0, 1, L); else x.fillRect(0, 2 + r() * (S - 4), L, 1);
  }
  x.fillStyle = shade(base, 0.55);
  if (vertical) { x.fillRect(0, 0, 2, L); x.fillRect(S - 2, 0, 2, L); } else { x.fillRect(0, 0, L, 2); x.fillRect(0, S - 2, L, 2); }
  // nail heads
  x.fillStyle = '#3d3a36';
  const nails = vertical ? [[S / 2 - 6, 14], [S / 2 + 6, 14], [S / 2 - 6, L - 14], [S / 2 + 6, L - 14]] : [[14, S / 2 - 7], [14, S / 2 + 7], [L - 14, S / 2 - 7], [L - 14, S / 2 + 7]];
  for (const [nx, ny] of nails) x.fillRect(nx - 2, ny - 2, 4, 4);
  if (text) {
    x.save(); x.globalAlpha = 0.82; x.fillStyle = textCol;
    x.font = 'bold 30px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, L / 2, S / 2 + 2);
    // worn stencil: knock a few holes out of the paint
    x.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { x.globalAlpha = 0.5 * r(); x.fillRect(L * 0.2 + r() * L * 0.6, 8 + r() * (S - 16), 2 + r() * 3, 1 + r() * 2); }
    x.restore();
    // repaint the wood under the knocked-out paint
    x.save(); x.globalCompositeOperation = 'destination-over'; x.fillStyle = shade(base, 1.04); x.fillRect(0, 0, L, S); x.restore();
  }
  return c;
}
// Brushed steel panel with seams and rivet rows (vault body).
function steelCanvas(seed) {
  const c = canvas(512, 512), x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#b9bec4'; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 420; k++) { const v = 170 + r() * 50 | 0; x.fillStyle = `rgba(${v},${v + 3},${v + 6},0.35)`; x.fillRect(0, r() * 512, 512, 1); }
  // panel seams (quarters) with a light/dark edge
  x.fillStyle = '#6e737a'; x.fillRect(0, 254, 512, 3); x.fillRect(254, 0, 3, 512);
  x.fillStyle = '#e4e8ec'; x.fillRect(0, 257, 512, 1); x.fillRect(257, 0, 1, 512);
  // border frame
  x.strokeStyle = '#7d8289'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 506);
  // rivets along seams and edges
  const rivet = (px, py) => {
    const g = x.createRadialGradient(px - 1.5, py - 1.5, 0.5, px, py, 5.5);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c3c8ce'); g.addColorStop(1, '#5e636a');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill();
  };
  for (let t = 22; t < 512; t += 26) { rivet(t, 16); rivet(t, 496); rivet(16, t); rivet(496, t); rivet(t, 240); rivet(t, 272); }
  return c;
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
function std(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }

function woodMats(tierId) {
  const base = tierId === 'armored' ? 0x3f72c8 : 0xd8b27c;   // plywood / painted blue
  const k = `wood-${tierId}`;
  return std(k, () => ({
    wall: new THREE.MeshStandardMaterial({ map: tex(plankCanvas(base, 11)), roughness: 0.85 }),
    inner: new THREE.MeshStandardMaterial({ map: tex(plankCanvas(base, 23)), roughness: 0.9, color: 0xb0a090 }),
    boardH: new THREE.MeshStandardMaterial({ map: tex(boardCanvas(base, 31, false)), roughness: 0.8 }),
    boardV: new THREE.MeshStandardMaterial({ map: tex(boardCanvas(base, 37, true)), roughness: 0.8 }),
    stencil: new THREE.MeshStandardMaterial({ map: tex(boardCanvas(base, 41, false, tierId === 'armored' ? 'ARMORED' : 'FRAGILE', tierId === 'armored' ? '#f2f0e8' : '#3a2a1c')), roughness: 0.8 }),
    lid: new THREE.MeshStandardMaterial({ map: tex(plankCanvas(base, 53)), roughness: 0.85 }),
  }));
}
function vaultMats() {
  return std('vault', () => ({
    body: new THREE.MeshStandardMaterial({ map: tex(steelCanvas(7)), metalness: 0.35, roughness: 0.38 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc8cdd3, metalness: 0.4, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x80868d, metalness: 0.4, roughness: 0.4 }),
    bright: new THREE.MeshStandardMaterial({ color: 0xe6eaee, metalness: 0.45, roughness: 0.25 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xfff2c8 }),
  }));
}

const B = (parent, w, h, d, x, y, z, m) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
};
const C = (parent, r, len, x, y, z, m, axis = 'z', seg = 24) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2; else if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
};

// ---------------------------------------------------------------- wooden crate (supply / armored)
// Layers outward from the centre on each side face (distances from the centre):
//   walls 0.44..0.48 | rails 0.48..0.515 | braces 0.48..0.505 | corner posts reach 0.53 (all distinct)
function buildWoodCrate(tierId) {
  const M = woodMats(tierId);
  const g = new THREE.Group();
  const H = 0.96; // body height (lid sits on top)
  // open-topped box: four walls + floor; side walls fit between front/back walls (no overlap)
  B(g, 0.96, H, 0.04, 0, H / 2, -0.46, M.wall);
  B(g, 0.96, H, 0.04, 0, H / 2, 0.46, M.wall);
  B(g, 0.04, H, 0.88, -0.46, H / 2, 0, M.wall);
  B(g, 0.04, H, 0.88, 0.46, H / 2, 0, M.wall);
  B(g, 0.88, 0.04, 0.88, 0, 0.06, 0, M.inner);
  // corner posts (square, at each vertical edge)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.11, H + 0.012, 0.11, sx * 0.475, H / 2, sz * 0.475, M.boardV);
  // rails: bottom and top band on each face, between the posts
  const railY = [0.068, H - 0.068];
  for (const y of railY) {
    B(g, 0.84, 0.13, 0.034, 0, y, -0.498, M.boardH); B(g, 0.84, 0.13, 0.034, 0, y, 0.498, M.boardH);
    B(g, 0.034, 0.13, 0.84, -0.498, y, 0, M.boardH); B(g, 0.034, 0.13, 0.84, 0.498, y, 0, M.boardH);
  }
  // X braces on every side (two diagonals, the second slightly further out so they never share a plane)
  const span = H - 0.26, diag = Math.hypot(0.82, span), ang = Math.atan2(span, 0.82);
  const face = (px, pz, ry, front) => {
    for (const [i, a] of [[0, ang], [1, -ang]]) {
      const depth = i === 0 ? 0.022 : 0.029;
      const off = (i === 0 ? 0.482 : 0.484) + depth / 2;
      const m = front && i === 0 ? [M.boardH, M.boardH, M.boardH, M.boardH, M.boardH, M.stencil] : M.boardH;
      const b = new THREE.Mesh(new THREE.BoxGeometry(diag - 0.04, 0.11, depth), m);
      const grp = new THREE.Group();
      grp.rotation.y = ry; grp.position.set(0, H / 2, 0);
      b.position.set(0, 0, -off);
      b.rotation.z = a;
      b.castShadow = true;
      grp.add(b); g.add(grp);
      void px; void pz;
    }
  };
  face(0, -1, 0, true); face(0, 1, Math.PI, false); face(-1, 0, -Math.PI / 2, false); face(1, 0, Math.PI / 2, false);
  // lid: planked panel + rim boards + its own X brace, in a group so it can fly off
  const lid = new THREE.Group();
  lid.position.y = H;
  B(lid, 1.0, 0.05, 1.0, 0, 0.025, 0, M.lid);
  for (const [w, d, x, z] of [[1.04, 0.1, 0, -0.47], [1.04, 0.1, 0, 0.47], [0.1, 0.84, -0.47, 0], [0.1, 0.84, 0.47, 0]]) B(lid, w, 0.035, d, x, 0.0675, z, M.boardH);
  const ld = Math.hypot(0.84, 0.84) - 0.1;
  // two lid braces at different heights (0.051..0.073 and 0.053..0.081): never coplanar with each other or the panel
  const l1 = B(lid, ld, 0.022, 0.1, 0, 0.062, 0, M.boardH); l1.rotation.y = Math.PI / 4;
  const l2 = B(lid, ld, 0.028, 0.1, 0, 0.067, 0, M.boardH); l2.rotation.y = -Math.PI / 4;
  // glow inside (visible once the lid is off): a warm light panel just above the floor
  const glow = B(g, 0.8, 0.01, 0.8, 0, 0.09, 0, new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0 }));
  g.add(lid);
  return { g, fx: { kind: 'wood', lid, glow } };
}

// ---------------------------------------------------------------- vault cube
// Front (-z) layers: body face 0.50 | inner glow 0.502..0.51 | door ring 0.50..0.53 | door 0.52..0.58 |
// hub/bars/rivets beyond 0.58 - every overlapping pair at a different depth.
function buildVault() {
  const M = vaultMats();
  const g = new THREE.Group();
  B(g, 1, 1, 1, 0, 0.5, 0, M.body);
  // chunky edge frame (12 bars) slightly proud of the faces
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.07, 1.08, 0.07, sx * 0.5, 0.5, sz * 0.5, M.dark);
  for (const y of [0, 1]) {
    B(g, 0.93, 0.07, 0.07, 0, y, -0.5, M.dark); B(g, 0.93, 0.07, 0.07, 0, y, 0.5, M.dark);
    B(g, 0.07, 0.07, 0.93, -0.5, y, 0, M.dark); B(g, 0.07, 0.07, 0.93, 0.5, y, 0, M.dark);
  }
  // light from inside, hidden behind the closed door
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.008, 40), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0 }));
  glow.rotation.x = Math.PI / 2; glow.position.set(0, 0.5, -0.506); g.add(glow);
  // door ring (frame) around the opening
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 10, 48), M.steel);
  ring.position.set(0, 0.5, -0.515); g.add(ring);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; C(g, 0.012, 0.012, Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36, -0.556, M.bright, 'z', 8); }
  // the door swings on a hinge at its left edge (the pivot group sits on the hinge axis)
  const hingeX = -0.34;
  const pivot = new THREE.Group(); pivot.position.set(hingeX, 0.5, -0.55); g.add(pivot);
  const door = new THREE.Group(); door.position.set(-hingeX, 0, 0); pivot.add(door);
  C(door, 0.31, 0.06, 0, 0, 0, M.steel, 'z', 48);
  C(door, 0.27, 0.01, 0, 0, -0.035, M.bright, 'z', 48);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; C(door, 0.011, 0.012, Math.cos(a) * 0.235, Math.sin(a) * 0.235, -0.046, M.dark, 'z', 8); }
  // hinges (two big knuckles on the frame + arms onto the door)
  for (const y of [0.19, -0.19]) {
    C(pivot, 0.04, 0.12, 0, y, -0.01, M.dark, 'y', 16);
    B(door, 0.14, 0.07, 0.03, -0.27, y, -0.052, M.dark);
  }
  // locking bars (radial) that slide in when the wheel turns
  const bars = new THREE.Group(); door.add(bars);
  [0, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 2, -Math.PI / 2].forEach((a, i) => {
    const bar = new THREE.Group(); bar.rotation.z = a; bars.add(bar);
    B(bar, 0.26, 0.026, 0.026, 0.17, 0, -0.068 - i * 0.003, M.bright);
    B(bar, 0.06, 0.07, 0.05, 0.31, 0, -0.07 - i * 0.003, M.dark);
  });
  // spoked wheel
  const wheel = new THREE.Group(); wheel.position.z = -0.1; door.add(wheel);
  C(wheel, 0.055, 0.05, 0, 0, 0, M.bright, 'z', 24);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 8, 32), M.steel); wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Group(); s.rotation.z = (i / 8) * Math.PI * 2; wheel.add(s);
    B(s, 0.15, 0.016, 0.016, 0.105, 0, 0.004 - (i % 2) * 0.002, M.steel);
    const knob = C(s, 0.016, 0.03, 0.19, 0, 0, M.bright, 'z', 12); knob.position.z = -0.006;
  }
  // combination dial and handle on the right
  const dial = new THREE.Group(); dial.position.set(0.17, 0.02, -0.075); door.add(dial);
  C(dial, 0.045, 0.03, 0, 0, 0, M.dark, 'z', 24);
  C(dial, 0.03, 0.02, 0, 0, -0.024, M.bright, 'z', 24);
  B(dial, 0.008, 0.02, 0.006, 0, 0.022, -0.036, M.dark);
  B(door, 0.025, 0.2, 0.025, 0.24, 0, -0.1, M.bright);
  B(door, 0.04, 0.025, 0.056, 0.225, 0.088, -0.074, M.bright);
  B(door, 0.04, 0.025, 0.056, 0.225, -0.088, -0.074, M.bright);
  // feet
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.12, 0.04, 0.12, sx * 0.4, -0.02, sz * 0.4, M.dark);
  return { g, fx: { kind: 'vault', pivot, wheel, bars, dial, glow } };
}

// ---------------------------------------------------------------- stage
export class CrateStage {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15171c);
    this.scene.fog = new THREE.Fog(0x15171c, 6, 14);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.hemi = new THREE.HemisphereLight(0xe8eef6, 0x2a2420, 1.15);
    this.key = new THREE.DirectionalLight(0xffffff, 2.4); this.key.position.set(-2.5, 4, -3);
    this.fill = new THREE.DirectionalLight(0xbcd0ff, 0.7); this.fill.position.set(3, 2, -1);
    this.rim = new THREE.PointLight(0xffc870, 0, 8); this.rim.position.set(0, 1.4, 0);
    this.scene.add(this.hemi, this.key, this.fill, this.rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x262a31, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.045; this.scene.add(floor);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.18, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = -0.03; this.scene.add(this.ring);
    this.beams = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 7, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      b.position.y = 3.5; b.rotation.y = (i / 6) * Math.PI; b.rotation.z = 0.25;
      this.beams.add(b);
    }
    this.scene.add(this.beams);
    this.parts = [];
    const pg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
      m.visible = false; this.scene.add(m); this.parts.push({ m, life: 0 });
    }
    this.crate = null;
    this.t = 0;
    this.phase = 'idle';
    this.active = false;
  }

  static build(tierId) { return tierId === 'vault' ? buildVault() : buildWoodCrate(tierId); }

  spark(o) {
    const p = this.parts.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = o.life ?? 1;
    p.m.position.set(o.x ?? 0, o.y ?? 0.6, o.z ?? 0);
    p.v = [o.vx ?? 0, o.vy ?? 0, o.vz ?? 0];
    p.g = o.g ?? 3;
    p.m.material.color.set(o.color ?? 0xffffff);
    p.m.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.m.scale.setScalar(o.size ?? 0.06);
    p.m.visible = true;
  }
  burst(n, color, speed = 4, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2;
      this.spark({ x: (o.x ?? 0) + (Math.random() - 0.5) * (o.spread ?? 0), y: o.y ?? 1, z: o.z ?? 0, vx: Math.cos(a) * Math.cos(e) * speed * (0.4 + Math.random()), vy: Math.sin(e) * speed + (o.up ?? 2), vz: Math.sin(a) * Math.cos(e) * speed * (0.4 + Math.random()) + (o.vz ?? 0), life: 0.6 + Math.random() * (o.life ?? 0.8), size: (o.size ?? 0.06) * (0.6 + Math.random() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color, g: o.g ?? 6, add: o.add });
    }
  }

  start(tierId, rarityIndex, rarityColor, cb = {}) {
    if (this.crate) this.scene.remove(this.crate.g);
    for (const p of this.parts) { p.life = 0; p.m.visible = false; }
    for (const b of this.beams.children) { b.material.opacity = 0; b.material.color.set(0xfff0c0); }
    this.ring.material.opacity = 0; this.ring.scale.setScalar(1);
    this.crate = CrateStage.build(tierId);
    this.scene.add(this.crate.g);
    this.tier = tierId;
    this.rarity = rarityIndex;
    this.color = new THREE.Color(rarityColor === 'rainbow' ? 0xff6ad5 : rarityColor);
    this.cb = cb;
    this.t = 0; this.phase = 'drop';
    this.lidV = null;
    this.T = { supply: { drop: 0.55, shake: 0.9 }, armored: { drop: 0.45, shake: 1.4 }, vault: { drop: 1.3, shake: 1.8 } }[tierId];
    this.active = true;
    this.revealT = -1;
    this.rim.color.set(tierId === 'vault' ? 0xfff0c8 : tierId === 'armored' ? 0x9ac8ff : 0xffc080);
    this.rim.intensity = 0;
    // inner light: above an open-topped crate, in front of the vault door
    if (tierId === 'vault') this.rim.position.set(0, 0.5, -1.1); else this.rim.position.set(0, 1.4, 0);
  }

  reveal() {
    if (!this.crate) return;
    this.revealT = 0;
    const r = this.rarity, c = this.color.getHex();
    const n = [20, 30, 45, 70, 100, 130, 150][r] || 30;
    const cols = r >= 6 ? [0xff6a6a, 0xffd36a, 0x6aff8a, 0x6ad8ff, 0xb06aff] : [c, 0xffffff];
    const vault = this.tier === 'vault';
    this.burst(n, cols, 3 + r * 0.8, { y: vault ? 0.5 : 1.0, z: vault ? -0.6 : 0, vz: vault ? -2 : 0, up: 3 + r * 0.4, size: 0.05 + r * 0.008, add: r >= 3, life: 0.8 + r * 0.15 });
    this.rim.color.copy(this.color);
  }

  stop() { this.active = false; if (this.crate) { this.scene.remove(this.crate.g); this.crate = null; } }

  update(dt, aspect) {
    this.camera.aspect = aspect || 1;
    this.camera.updateProjectionMatrix();
    this.t += dt;
    const now = performance.now() / 1000;
    const ang = -0.5 + Math.sin(now * 0.25) * 0.1;
    this.camera.position.set(Math.sin(ang) * 4, 2.1, -Math.cos(ang) * 4);
    this.camera.lookAt(0, 0.6, 0);
    const Cr = this.crate;
    if (Cr) {
      const g = Cr.g, fx = Cr.fx, T = this.T, t = this.t;
      const wood = fx.kind === 'wood';
      if (this.phase === 'drop') {
        const k = Math.min(1, t / T.drop);
        if (wood) { g.position.y = 4 * (1 - easeInCubic(k)); g.rotation.y = -0.35; }
        else { g.position.y = 3 * (1 - easeOutCubic(k)); g.rotation.y = -0.2 + (1 - k) * 1.6; }
        if (k >= 1) {
          this.phase = 'shake'; this.t = 0; g.position.y = 0;
          this.cb.onLand?.(this.tier);
          this.burst(this.tier === 'supply' ? 16 : 26, [0x8a8070, 0x5a5348], 2.4, { y: 0.02, up: 1, g: 4, size: 0.07, spread: 0.8 });
        }
      } else if (this.phase === 'shake') {
        const k = Math.min(1, t / T.shake);
        if (wood) {
          // hops and wobbles; the armored crate rattles harder, and the lid starts to lift
          const a = this.tier === 'armored' ? 0.03 + 0.06 * k * k : 0.02 + 0.04 * k;
          g.position.y = Math.abs(Math.sin(t * (this.tier === 'armored' ? 20 : 14))) * 0.07 * k;
          g.rotation.z = Math.sin(t * 23) * a; g.rotation.x = Math.sin(t * 17) * a * 0.5; g.rotation.y = -0.35 + Math.sin(t * 9) * a;
          fx.lid.position.y = 0.96 + Math.max(0, Math.sin(t * 30)) * 0.03 * k;
          if (k > 0.5 && Math.random() < dt * 25 * k) this.spark({ x: (Math.random() - 0.5) * 0.9, y: 0.98, z: (Math.random() - 0.5) * 0.9, vy: 0.8, life: 0.35, size: 0.03, color: 0xfff2c8, add: true, g: 1 });
        } else {
          // wheel spins up, locking bars slide in, the dial whirls
          g.rotation.y = -0.2;
          fx.wheel.rotation.z = -easeInOut(k) * Math.PI * 4;
          fx.dial.rotation.z = Math.sin(t * 7) * 2.5 * k;
          const bs = 1 - 0.35 * easeInOut(Math.max(0, (k - 0.4) / 0.6)); fx.bars.scale.set(bs, bs, 1);
          g.position.y = Math.sin(t * 40) * 0.004 * k;
        }
        this.rim.intensity = 2 * k;
        if (k >= 1) this.open();
      } else if (this.phase === 'open') {
        const k = Math.min(1, t / 0.9);
        if (wood) {
          if (this.lidV) {
            const L = fx.lid;
            L.position.x += this.lidV[0] * dt; L.position.y += this.lidV[1] * dt; L.position.z += this.lidV[2] * dt;
            this.lidV[1] -= 9 * dt;
            L.rotation.x += this.lidV[3] * dt; L.rotation.z += this.lidV[4] * dt;
            if (L.position.y < -2) { L.visible = false; this.lidV = null; }
          }
          g.rotation.z *= 0.85; g.rotation.x *= 0.85; g.position.y *= 0.8;
          fx.glow.material.opacity = Math.min(1, k * 1.5);
        } else {
          // door swings open on its hinge
          fx.pivot.rotation.y = easeOutCubic(k) * 1.9; // swings outward, toward the viewer
          fx.glow.material.opacity = Math.min(1, k * 1.4);
          this.beams.rotation.y += dt * 0.5;
        }
        // light spilling out
        if (Math.random() < dt * (this.tier === 'vault' ? 40 : this.tier === 'armored' ? 22 : 14)) {
          if (wood) this.spark({ x: (Math.random() - 0.5) * 0.7, y: 0.95, z: (Math.random() - 0.5) * 0.7, vy: 1.2 + Math.random(), vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 0.9, size: 0.035, color: 0xfff4d0, add: true, g: -0.3 });
          else this.spark({ x: (Math.random() - 0.5) * 0.5, y: 0.5 + (Math.random() - 0.5) * 0.5, z: -0.56, vz: -1.2 - Math.random(), vy: 0.3, life: 0.9, size: 0.035, color: 0xfff0c0, add: true, g: -0.3 });
        }
        this.rim.intensity = 2 + Math.sin(now * 6) * 0.4;
      }
      if (this.revealT >= 0) {
        this.revealT += dt;
        const k = Math.min(1, this.revealT / 0.6);
        this.ring.material.color.copy(this.color);
        this.ring.material.opacity = (1 - k) * 0.9;
        this.ring.scale.setScalar(1 + k * 2.5);
        const rays = this.rarity >= 2;
        for (const b of this.beams.children) { b.material.color.copy(this.color); b.material.opacity = rays ? Math.max(b.material.opacity * 0.98, 0.2 * (1 - Math.min(1, this.revealT / 3))) : b.material.opacity * 0.95; }
        this.beams.rotation.y += dt * 0.6;
        if (this.rarity >= 6) this.color.setHSL((now * 0.3) % 1, 0.85, 0.6);
        this.rim.color.copy(this.color);
      }
    }
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.v[1] -= p.g * dt;
      p.m.position.x += p.v[0] * dt; p.m.position.y += p.v[1] * dt; p.m.position.z += p.v[2] * dt;
      if (p.m.position.y < 0) { p.m.position.y = 0; p.v[1] *= -0.3; p.v[0] *= 0.7; p.v[2] *= 0.7; }
      p.m.material.opacity = Math.min(1, p.life / p.max * 1.6);
      p.m.rotation.x += dt * 4; p.m.rotation.y += dt * 3;
    }
  }

  open() {
    const fx = this.crate.fx;
    this.phase = 'open'; this.t = 0;
    if (fx.kind === 'wood') {
      const power = this.tier === 'armored' ? 1.25 : 1;
      this.lidV = [(Math.random() - 0.5) * 1.5, 5.2 * power, 1.4 + Math.random(), (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 5];
      const cols = this.tier === 'armored' ? [0x9cc0ff, 0xffffff, 0x3f72c8] : [0xe8c896, 0xb08455, 0xffffff];
      this.burst(this.tier === 'armored' ? 55 : 35, cols, 3.5 * power, { y: 1.0, up: 3, add: this.tier === 'armored', size: 0.05 });
    } else {
      fx.wheel.rotation.z = 0;
      this.burst(70, [0xfff0c0, 0xffffff, 0xd8dde3], 3, { y: 0.5, z: -0.6, vz: -2.5, up: 1.5, add: true, size: 0.045 });
      for (const b of this.beams.children) b.material.opacity = 0.3;
    }
    this.cb.onOpen?.(this.tier);
  }

  // Small rendered pictures of each crate for the crate screen (cached data URLs).
  static icons(gl) {
    if (CrateStage._icons) return CrateStage._icons;
    const out = {};
    const size = 220;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8eef6, 0x3a3430, 1.3));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(-2.5, 4, -3); scene.add(d);
    const f = new THREE.DirectionalLight(0xbcd0ff, 0.6); f.position.set(3, 2, -1); scene.add(f);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    cam.position.set(-1.9, 1.75, -2.6); cam.lookAt(0, 0.5, 0);
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, samples: 4 });
    const buf = new Uint8Array(size * size * 4);
    for (const id of ['supply', 'armored', 'vault']) {
      const { g } = CrateStage.build(id);
      scene.add(g);
      gl.setRenderTarget(rt); gl.setClearColor(0x000000, 0); gl.clear(); gl.render(scene, cam);
      gl.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      scene.remove(g);
      const c = canvas(size, size), x = c.getContext('2d'), img = x.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      x.putImageData(img, 0, 0);
      out[id] = c.toDataURL('image/png');
    }
    gl.setRenderTarget(null); gl.setClearColor(0x000000, 1);
    CrateStage._icons = out;
    return out;
  }
}
