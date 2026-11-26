// 3D crate-opening stage, rendered full screen behind the crate UI. Each tier has its own model and
// choreography:
//  - Supply:  wooden crate roped shut. Drops in, wobbles, the rope snaps and the lid pops off.
//  - Armored: steel-banded crate wrapped in chains with a padlock. Drops heavily, rattles harder and
//             harder, the padlock bursts, chains fall away, the lid is blown off.
//  - Vault:   black-and-gold vault crate with glowing seams. Descends slowly, levitates and spins up
//             while light beams sweep, then the lid erupts in a column of light.
// After it opens, the crate glows while the reel spins; on reveal the stage bursts in the rarity colour
// (rays and sparks scale with rarity). Everything uses simple boxes and a small particle pool.
import * as THREE from 'three';

const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;

const mats = new Map();
function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive || 0}|${opts.basic ? 1 : 0}|${opts.opacity ?? 1}`;
  if (!mats.has(key)) {
    const m = opts.basic
      ? new THREE.MeshBasicMaterial({ color, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, depthWrite: (opts.opacity ?? 1) >= 1 })
      : new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.75, metalness: opts.metal ?? 0.05, emissive: opts.emissive || 0, emissiveIntensity: opts.ei ?? 1 });
    mats.set(key, m);
  }
  return mats.get(key);
}
const box = (parent, w, h, d, x, y, z, m) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
};

// ---------------------------------------------------------------- crate models (body 1x1x1, origin at the base centre)
function plankFaces(g, plank, frame, s = 1) {
  // frame posts and rims
  for (const x of [-0.47, 0.47]) for (const z of [-0.47, 0.47]) box(g, 0.1 * s, 0.98, 0.1 * s, x, 0.49, z, frame);
  for (const y of [0.05, 0.93]) {
    box(g, 1.02, 0.1, 0.08, 0, y, -0.49, frame); box(g, 1.02, 0.1, 0.08, 0, y, 0.49, frame);
    box(g, 0.08, 0.1, 1.02, -0.49, y, 0, frame); box(g, 0.08, 0.1, 1.02, 0.49, y, 0, frame);
  }
  // diagonal braces on the four sides
  for (const [x, z, ry] of [[0, -0.5, 0], [0, 0.5, 0], [-0.5, 0, Math.PI / 2], [0.5, 0, Math.PI / 2]]) {
    const b = box(g, 1.15, 0.09, 0.05, x, 0.49, z, frame);
    b.rotation.set(0, ry, Math.PI / 4);
  }
  box(g, 0.96, 0.9, 0.96, 0, 0.48, 0, plank);
}

function buildCrate(tierId) {
  const g = new THREE.Group();
  const lid = new THREE.Group();
  lid.position.y = 0.98;
  g.add(lid);
  const fx = { lid, straps: [], glow: [], lock: null };
  if (tierId === 'supply') {
    const plank = mat(0xb08455), frame = mat(0x7a5532), rope = mat(0xd8c08a);
    plankFaces(g, plank, frame);
    box(lid, 1.04, 0.1, 1.04, 0, 0.05, 0, frame);
    box(lid, 0.92, 0.06, 0.92, 0, 0.11, 0, plank);
    for (let i = -1; i <= 1; i++) box(lid, 0.92, 0.02, 0.04, 0, 0.145, i * 0.3, frame);
    // stencil plate
    box(g, 0.5, 0.22, 0.02, 0, 0.5, -0.515, mat(0x3a2a1a));
    // rope tied around (front-to-back and side-to-side), snaps on open
    for (const ry of [0, Math.PI / 2]) {
      const r = new THREE.Group();
      box(r, 1.06, 0.06, 0.06, 0, 1.0, 0, rope); box(r, 0.06, 1.0, 0.06, 0.53, 0.5, 0, rope); box(r, 0.06, 1.0, 0.06, -0.53, 0.5, 0, rope);
      box(r, 0.16, 0.12, 0.12, 0, 1.03, 0, rope);
      r.rotation.y = ry;
      g.add(r); fx.straps.push(r);
    }
  } else if (tierId === 'armored') {
    const plank = mat(0x8a6440), frame = mat(0x5a606a, { metal: 0.3, rough: 0.45 }), chain = mat(0x7a808a, { metal: 0.3, rough: 0.4 });
    plankFaces(g, plank, frame);
    // steel corner caps
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) for (const y of [0.04, 0.94]) box(g, 0.16, 0.14, 0.16, x, y, z, frame);
    box(lid, 1.06, 0.12, 1.06, 0, 0.06, 0, frame);
    box(lid, 0.9, 0.06, 0.9, 0, 0.13, 0, plank);
    box(g, 0.56, 0.24, 0.02, 0, 0.5, -0.52, mat(0x1e2024));
    // chains wrapped diagonally both ways: links alternate orientation
    for (const dir of [1, -1]) {
      const c = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const t = i / 8 - 0.5;
        const l = box(c, i % 2 ? 0.05 : 0.12, 0.07, i % 2 ? 0.12 : 0.05, t * 1.1, 0.5 + t * dir * 0.9, -0.56, chain);
        l.rotation.z = -dir * 0.68;
      }
      for (let i = 0; i < 6; i++) box(c, 0.12, 0.06, 0.05, 0, 1.0, -0.5 + i * 0.2, chain).rotation.y = i % 2 ? Math.PI / 2 : 0;
      g.add(c); fx.straps.push(c);
    }
    // padlock on the front
    const lock = new THREE.Group();
    box(lock, 0.26, 0.24, 0.1, 0, 0, 0, mat(0x7a8b96, { metal: 0.3, rough: 0.35 }));
    box(lock, 0.04, 0.18, 0.04, -0.08, 0.18, 0, chain); box(lock, 0.04, 0.18, 0.04, 0.08, 0.18, 0, chain); box(lock, 0.2, 0.04, 0.04, 0, 0.27, 0, chain);
    box(lock, 0.04, 0.07, 0.02, 0, -0.02, -0.06, mat(0x15171a));
    lock.position.set(0.05, 0.36, -0.64);
    g.add(lock); fx.lock = lock;
  } else {
    const body = mat(0x2a2e36, { metal: 0.2, rough: 0.5 }), gold = mat(0xf0bf3a, { metal: 0.25, rough: 0.4, emissive: 0x3a2a00 }), seam = mat(0xffd86a, { basic: true });
    box(g, 0.98, 0.94, 0.98, 0, 0.47, 0, body);
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) box(g, 0.12, 0.98, 0.12, x, 0.49, z, gold);
    for (const y of [0.04, 0.92]) { box(g, 1.02, 0.08, 1.02, 0, y, 0, gold); }
    // glowing seams on each face
    for (const [x, z, ry] of [[0, -0.5, 0], [0, 0.5, 0], [-0.5, 0, Math.PI / 2], [0.5, 0, Math.PI / 2]]) {
      const s1 = box(g, 0.7, 0.025, 0.02, x, 0.3, z, seam); s1.rotation.y = ry; fx.glow.push(s1);
      const s2 = box(g, 0.7, 0.025, 0.02, x, 0.66, z, seam); s2.rotation.y = ry; fx.glow.push(s2);
    }
    // vault dial on the front
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16), gold);
    dial.rotation.x = Math.PI / 2; dial.position.set(0, 0.48, -0.53); g.add(dial); fx.dial = dial;
    box(g, 0.04, 0.12, 0.03, 0, 0.53, -0.57, body);
    box(lid, 1.06, 0.12, 1.06, 0, 0.06, 0, gold);
    box(lid, 0.86, 0.08, 0.86, 0, 0.15, 0, body);
    box(lid, 0.3, 0.06, 0.3, 0, 0.21, 0, gold);
  }
  return { g, fx };
}

// ---------------------------------------------------------------- stage
export class CrateStage {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15171c);
    this.scene.fog = new THREE.Fog(0x15171c, 6, 14);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.hemi = new THREE.HemisphereLight(0xdfe6f0, 0x2a2420, 0.9);
    this.key = new THREE.DirectionalLight(0xffffff, 2.2); this.key.position.set(-2.5, 4, -3);
    this.rim = new THREE.PointLight(0xffc870, 0, 8); this.rim.position.set(0, 1.2, 0);
    this.scene.add(this.hemi, this.key, this.rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), mat(0x262a31, { rough: 0.9 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.18, 48), mat(0xffffff, { basic: true, opacity: 0.0 }).clone());
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.01; this.scene.add(this.ring);
    // light beams (vault + reveal)
    this.beams = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 7, 0.02), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      b.position.y = 3.5; b.rotation.y = (i / 6) * Math.PI; b.rotation.z = 0.25;
      this.beams.add(b);
    }
    this.scene.add(this.beams);
    // particle pool
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

  spark(o) {
    const p = this.parts.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = o.life ?? 1;
    p.m.position.set(o.x ?? 0, o.y ?? 0.6, o.z ?? 0);
    p.v = [o.vx ?? 0, o.vy ?? 0, o.vz ?? 0];
    p.g = o.g ?? 3; p.size = o.size ?? 0.06; p.spin = o.spin ?? 0;
    p.m.material.color.set(o.color ?? 0xffffff);
    p.m.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.m.scale.setScalar(p.size);
    p.m.visible = true;
  }
  burst(n, color, speed = 4, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 - 0.2;
      this.spark({ x: o.x ?? 0, y: o.y ?? 1, z: o.z ?? 0, vx: Math.cos(a) * Math.cos(e) * speed * (0.4 + Math.random()), vy: Math.sin(e) * speed + (o.up ?? 2), vz: Math.sin(a) * Math.cos(e) * speed * (0.4 + Math.random()), life: 0.6 + Math.random() * (o.life ?? 0.8), size: (o.size ?? 0.06) * (0.6 + Math.random() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color, g: o.g ?? 6, add: o.add });
    }
  }

  /**
   * Start a show. tierId: supply | armored | vault; colour: rarity colour (hex) for the reveal.
   * Calls cb.onOpen() when the crate has burst open (start the reel) - timings differ per tier.
   */
  start(tierId, rarityIndex, rarityColor, cb = {}) {
    if (this.crate) this.scene.remove(this.crate.g);
    for (const p of this.parts) { p.life = 0; p.m.visible = false; }
    // reset effects left over from a previous show
    for (const b of this.beams.children) { b.material.opacity = 0; b.material.color.set(0xfff0c0); }
    this.ring.material.opacity = 0; this.ring.scale.setScalar(1);
    this.crate = buildCrate(tierId);
    this.scene.add(this.crate.g);
    this.tier = tierId;
    this.rarity = rarityIndex;
    this.color = new THREE.Color(rarityColor === 'rainbow' ? 0xff6ad5 : rarityColor);
    this.cb = cb;
    this.t = 0; this.phase = 'drop';
    this.lidV = null; this.strapFall = [];
    this.T = { supply: { drop: 0.55, shake: 0.9 }, armored: { drop: 0.5, shake: 1.5 }, vault: { drop: 1.3, shake: 1.9 } }[tierId];
    this.active = true;
    this.revealT = -1;
    this.rim.color.set(tierId === 'vault' ? 0xffd070 : tierId === 'armored' ? 0x9ac8ff : 0xffc080);
    this.rim.intensity = 0;
  }

  // reel has stopped on the item
  reveal() {
    if (!this.crate) return;
    this.revealT = 0;
    const c = this.color.getHex();
    const r = this.rarity;
    const n = [20, 30, 45, 70, 100, 130, 150][r] || 30;
    const cols = r >= 6 ? [0xff6a6a, 0xffd36a, 0x6aff8a, 0x6ad8ff, 0xb06aff] : [c, 0xffffff];
    this.burst(n, cols, 3 + r * 0.8, { y: 1.1, up: 3 + r * 0.4, size: 0.05 + r * 0.008, add: r >= 3, life: 0.8 + r * 0.15 });
    this.rim.color.copy(this.color);
  }

  stop() { this.active = false; if (this.crate) { this.scene.remove(this.crate.g); this.crate = null; } }

  update(dt, aspect) {
    this.camera.aspect = aspect || 1;
    this.camera.updateProjectionMatrix();
    this.t += dt;
    const C = this.crate;
    const now = performance.now() / 1000;
    // slow orbiting camera
    const ang = -0.55 + Math.sin(now * 0.25) * 0.12;
    this.camera.position.set(Math.sin(ang) * 4.2, 2.3, -Math.cos(ang) * 4.2);
    this.camera.lookAt(0, 0.75, 0);
    if (C) {
      const g = C.g, fx = C.fx, T = this.T, t = this.t;
      if (this.phase === 'drop') {
        const k = Math.min(1, t / T.drop);
        if (this.tier === 'vault') {
          // slow descent with a gentle settle
          g.position.y = 3.2 * (1 - easeOutCubic(k));
          g.rotation.y = (1 - k) * 2.5;
        } else {
          g.position.y = 4 * (1 - easeInCubic(k));
          g.rotation.y = -0.4;
        }
        if (k >= 1) {
          this.phase = 'shake'; this.t = 0; g.position.y = 0;
          this.cb.onLand?.(this.tier);
          this.burst(this.tier === 'armored' ? 26 : 16, [0x8a8070, 0x5a5348], 2.4, { y: 0.05, up: 1, g: 4, size: 0.07 });
        }
      } else if (this.phase === 'shake') {
        const k = Math.min(1, t / T.shake);
        if (this.tier === 'supply') {
          // a few hops and wobbles
          g.position.y = Math.abs(Math.sin(t * 14)) * 0.08 * k;
          g.rotation.z = Math.sin(t * 22) * 0.06 * k; g.rotation.y = -0.4 + Math.sin(t * 9) * 0.05;
        } else if (this.tier === 'armored') {
          // rattling builds up; the padlock jitters harder and harder
          const a = 0.02 + 0.07 * k * k;
          g.position.x = Math.sin(t * 61) * a; g.rotation.z = Math.sin(t * 47) * a; g.rotation.y = -0.4 + Math.sin(t * 31) * a;
          if (fx.lock) fx.lock.rotation.z = Math.sin(t * 70) * 0.3 * k;
          if (Math.random() < dt * 20 * k) this.spark({ x: (Math.random() - 0.5) * 1.1, y: Math.random(), z: -0.55, vy: 1, life: 0.3, size: 0.03, color: 0xffd080, add: true, g: 2 });
        } else {
          // vault levitates and spins up while beams fade in and seams pulse
          g.position.y = 0.35 * easeOutCubic(k) + Math.sin(t * 3) * 0.04;
          g.rotation.y = -0.4 + t * t * 2.2;
          for (const s of fx.glow) s.material.color.setHSL(0.12, 1, 0.55 + 0.35 * Math.sin(t * 18));
          this.beams.rotation.y += dt * (0.6 + k * 2);
          for (const b of this.beams.children) b.material.opacity = 0.18 * k;
          if (fx.dial) fx.dial.rotation.y = t * 9;
          if (Math.random() < dt * 40 * k) { const a = Math.random() * Math.PI * 2; this.spark({ x: Math.cos(a) * 1.2, y: 0.2 + Math.random() * 1.2, z: Math.sin(a) * 1.2, vx: -Math.cos(a) * 1.5, vz: -Math.sin(a) * 1.5, vy: 0.6, life: 0.7, size: 0.04, color: 0xffe08a, add: true, g: 0 }); }
        }
        this.rim.intensity = 2.5 * k;
        if (k >= 1) this.open();
      } else if (this.phase === 'open' || this.phase === 'glow') {
        // lid flies; straps/chains fall; crate glows and idles while the reel spins
        if (this.lidV) {
          const L = fx.lid;
          L.position.x += this.lidV[0] * dt; L.position.y += this.lidV[1] * dt; L.position.z += this.lidV[2] * dt;
          this.lidV[1] -= 9 * dt;
          L.rotation.x += this.lidV[3] * dt; L.rotation.z += this.lidV[4] * dt;
          if (L.position.y < -2) { L.visible = false; this.lidV = null; }
        }
        for (const s of this.strapFall) {
          s.o.position.y += s.v * dt; s.v -= 7 * dt; s.o.rotation.z += s.r * dt;
          if (s.o.position.y < -3) s.o.visible = false;
        }
        if (this.tier === 'vault') {
          g.position.y = 0.35 + Math.sin(now * 2) * 0.04; g.rotation.y += dt * 0.6;
          this.beams.rotation.y += dt * 0.8;
        } else { g.position.x *= 0.8; g.rotation.z *= 0.8; g.position.y *= 0.8; }
        // light spilling out of the open top
        if (Math.random() < dt * (this.tier === 'vault' ? 40 : this.tier === 'armored' ? 22 : 14)) {
          this.spark({ x: (Math.random() - 0.5) * 0.7, y: g.position.y + 0.95, z: (Math.random() - 0.5) * 0.7, vy: 1.2 + Math.random(), vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, life: 0.9, size: 0.035, color: this.tier === 'vault' ? 0xffe08a : 0xfff4d0, add: true, g: -0.3 });
        }
        this.rim.intensity = 2.2 + Math.sin(now * 6) * 0.4;
      }
      // reveal: rarity-coloured pulse, ring and rays
      if (this.revealT >= 0) {
        this.revealT += dt;
        const k = Math.min(1, this.revealT / 0.6);
        this.ring.material.color.copy(this.color);
        this.ring.material.opacity = (1 - k) * 0.9;
        this.ring.scale.setScalar(1 + k * 2.5);
        const rays = this.rarity >= 2;
        for (const b of this.beams.children) { b.material.color.copy(this.color); b.material.opacity = rays ? Math.max(b.material.opacity * 0.98, 0.22 * (1 - Math.min(1, this.revealT / 3))) : b.material.opacity * 0.95; }
        this.beams.rotation.y += dt * 0.6;
        if (this.rarity >= 6) this.color.setHSL((now * 0.3) % 1, 0.85, 0.6);
        this.rim.color.copy(this.color);
      }
    }
    // particles
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.v[1] -= p.g * dt;
      p.m.position.x += p.v[0] * dt; p.m.position.y += p.v[1] * dt; p.m.position.z += p.v[2] * dt;
      if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v[1] *= -0.3; p.v[0] *= 0.7; p.v[2] *= 0.7; }
      p.m.material.opacity = Math.min(1, p.life / p.max * 1.6);
      p.m.rotation.x += dt * 4; p.m.rotation.y += dt * 3;
    }
  }

  open() {
    const C = this.crate, fx = C.fx;
    this.phase = 'open'; this.t = 0;
    const power = this.tier === 'vault' ? 1.6 : this.tier === 'armored' ? 1.25 : 1;
    this.lidV = [(Math.random() - 0.5) * 2, 5.5 * power, (Math.random() - 0.5) * 2 + 1.5, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6];
    for (const s of fx.straps) this.strapFall.push({ o: s, v: 0.5, r: (Math.random() - 0.5) * 2 });
    if (fx.lock) { this.strapFall.push({ o: fx.lock, v: 2.5, r: 6 }); this.burst(24, [0xffd080, 0xffffff], 3, { x: 0.05, y: 0.4, z: -0.65, up: 1.5, size: 0.04, add: true }); }
    const cols = this.tier === 'vault' ? [0xffe08a, 0xffffff, 0xffb84a] : this.tier === 'armored' ? [0xbcd8ff, 0xffffff, 0x8a8f98] : [0xd8b07a, 0xb08455, 0xffffff];
    this.burst(this.tier === 'vault' ? 90 : this.tier === 'armored' ? 55 : 35, cols, 3.5 * power, { y: C.g.position.y + 1, up: 3, add: this.tier !== 'supply', size: 0.05 });
    if (this.tier === 'vault') for (const b of this.beams.children) b.material.opacity = 0.35;
    this.cb.onOpen?.(this.tier);
  }
}
