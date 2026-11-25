// Visual effects with pooling: instanced pixel-cube particles, tracers, muzzle flashes with light,
// explosions, healing/repair beams, flame streams, impact decals, elimination gibs and spawn columns.
import * as THREE from 'three';
import { TEAM_COLORS_HEX } from '../../shared/constants.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

export class Effects {
  constructor(scene, quality, world) {
    this.scene = scene;
    this.quality = quality;
    this.world = world;
    this.max = quality.maxParticles;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.pmesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false }), this.max);
    this.pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pmesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.pmesh.frustumCulled = false;
    this.pmesh.count = 0;
    scene.add(this.pmesh);
    this.parts = [];
    // tracers
    this.tracers = [];
    this.tracerPool = [];
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    // lights pool
    this.lights = [];
    for (let i = 0; i < quality.fxLights; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 10, 2);
      l.userData.t = 0;
      scene.add(l);
      this.lights.push(l);
    }
    // decals
    this.decals = [];
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.scorchMat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.decalGeo = new THREE.PlaneGeometry(0.14, 0.14);
    // gibs
    this.gibs = [];
    // beams (cube chains)
    this.beamMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 600);
    this.beamMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    this.beamMesh.frustumCulled = false;
    this.beamMesh.count = 0;
    scene.add(this.beamMesh);
    this.beamCount = 0;
    this.time = 0;
  }

  setWorld(world) { this.world = world; }

  // ------------------------------------------------------------- particles
  spawn(o) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 0.6, max: o.life || 0.6, size: o.size || 0.08, end: o.end ?? 0, color: o.color ?? 0xffffff,
      g: o.g ?? 9, drag: o.drag ?? 1.5, spin: o.spin ?? 6, rot: Math.random() * 6, bounce: o.bounce || 0,
    });
  }

  burst(x, y, z, n, o) {
    n = Math.max(1, Math.round(n * this.quality.particleMult));
    for (let i = 0; i < n; i++) {
      const sp = (o.speed || 3) * (0.4 + Math.random() * 0.8);
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      let dx = Math.sin(ph) * Math.cos(th), dy = Math.cos(ph), dz = Math.sin(ph) * Math.sin(th);
      if (o.dir) { dx = dx * (o.cone || 0.5) + o.dir[0]; dy = dy * (o.cone || 0.5) + o.dir[1]; dz = dz * (o.cone || 0.5) + o.dir[2]; }
      if (o.up) dy = Math.abs(dy) + o.up;
      const colors = Array.isArray(o.color) ? o.color : [o.color ?? 0xffffff];
      this.spawn({ x, y, z, vx: dx * sp, vy: dy * sp, vz: dz * sp, life: (o.life || 0.6) * (0.6 + Math.random() * 0.7), size: (o.size || 0.08) * (0.6 + Math.random() * 0.8), end: o.end, color: colors[(Math.random() * colors.length) | 0], g: o.g, drag: o.drag, bounce: o.bounce });
    }
  }

  // ------------------------------------------------------------- weapon effects
  tracer(from, to, color = 0xfff2a8, width = 0.025, life = 0.07) {
    let t = this.tracerPool.pop();
    if (!t) { t = new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); }
    t.material.color.setHex(color);
    const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.1) { this.tracerPool.push(t); return; }
    t.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    t.scale.set(width, width, len);
    t.lookAt(to[0], to[1], to[2]);
    t.userData.life = life; t.userData.max = life;
    this.scene.add(t);
    this.tracers.push(t);
  }

  flashLight(x, y, z, color, intensity, dist, life = 0.06) {
    if (!this.lights.length) return;
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.t <= 0) { best = l; break; } else if (l.userData.t < best.userData.t) best = l;
    best.position.set(x, y, z);
    best.color.setHex(color);
    best.intensity = intensity;
    best.distance = dist;
    best.userData.t = life; best.userData.max = life; best.userData.i = intensity;
  }

  muzzle(pos, dir, weaponType, color = 0xffd27a) {
    if (weaponType === 'melee' || weaponType === 'beam') return;
    const n = weaponType === 'flame' ? 0 : 5;
    this.burst(pos.x, pos.y, pos.z, n, { color: [color, 0xffffff, 0xffa040], speed: 2.5, life: 0.08, size: 0.06, g: 0, dir, cone: 0.6 });
    this.flashLight(pos.x, pos.y, pos.z, color, 3.5, 7, 0.05);
  }

  impact(p, normal, kind) {
    const colors = kind === 'flesh' ? [0xc8402f, 0x8a2a1f, 0xe85a40] : kind === 'turret' ? [0xffd040, 0x888888] : [0xd0c0a0, 0x8a8070, 0xffffff];
    this.burst(p[0], p[1], p[2], kind === 'flesh' ? 6 : 4, { color: colors, speed: 2.5, life: 0.35, size: kind === 'flesh' ? 0.07 : 0.05, g: 12, dir: normal || null, cone: 1, up: 0.3 });
    if (kind === 'world' && normal && this.quality.decals) this.decal(p, normal, false);
  }

  decal(p, n, scorch, size = 1) {
    const m = new THREE.Mesh(this.decalGeo, scorch ? this.scorchMat : this.decalMat);
    m.position.set(p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012);
    m.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
    m.scale.setScalar(scorch ? size * 14 : size);
    m.rotation.z = Math.random() * Math.PI;
    this.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > this.quality.maxDecals) this.scene.remove(this.decals.shift());
  }

  explosion(x, y, z, radius) {
    const s = radius / 3.5;
    this.burst(x, y, z, 26 * s, { color: [0xffe070, 0xff9a30, 0xff5a20, 0xffffff], speed: 7 * s, life: 0.45, size: 0.22 * s, g: 2, drag: 3 });
    this.burst(x, y, z, 14 * s, { color: [0x3a3a3a, 0x555555, 0x2a2a2a], speed: 3 * s, life: 1.2, size: 0.45 * s, g: -1.5, drag: 2, up: 0.4 });
    this.burst(x, y, z, 10 * s, { color: [0x5a4a3a, 0x3a3028], speed: 8, life: 0.9, size: 0.1, g: 18, up: 0.6 });
    this.flashLight(x, y + 0.5, z, 0xffa040, 12, radius * 4, 0.25);
    if (this.world && this.quality.decals) {
      const h = this.world.raycast(x, y + 0.5, z, 0, -1, 0, 1.5);
      if (h) this.decal([x, y + 0.5 - h.t, z], [0, 1, 0], true, s);
    }
  }

  spawnColumn(x, y, z, team) {
    const col = TEAM_COLORS_HEX[team] ?? 0xffffff;
    for (let i = 0; i < 18 * this.quality.particleMult; i++) {
      this.spawn({ x: x + (Math.random() - 0.5) * 0.9, y: y + Math.random() * 0.3, z: z + (Math.random() - 0.5) * 0.9, vy: 2 + Math.random() * 3, life: 0.8, size: 0.1, color: Math.random() < 0.5 ? col : 0xffffff, g: -1, drag: 1 });
    }
  }

  confetti(x, y, z, colors) {
    this.burst(x, y + 1, z, 50, { color: colors || [0xff3f6a, 0x3ff2ff, 0xffe03f, 0x58ff6a, 0xffffff], speed: 7, life: 2.2, size: 0.1, g: 5, drag: 2, up: 1 });
  }

  // Elimination: break the character into flying blocks + cosmetic effect.
  gib(meshes, vel, effect = 'pixels', team = 0) {
    const life = 3.2;
    for (const src of meshes) {
      if (!src.visible) continue;
      const m = new THREE.Mesh(src.geometry, src.material);
      src.getWorldPosition(m.position);
      src.getWorldQuaternion(m.quaternion);
      src.getWorldScale(m.scale);
      m.castShadow = true;
      this.scene.add(m);
      this.gibs.push({ m, vx: vel[0] * 0.5 + (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 4, vz: vel[2] * 0.5 + (Math.random() - 0.5) * 5, ax: (Math.random() - 0.5) * 10, az: (Math.random() - 0.5) * 10, life, max: life });
      if (this.gibs.length > 160) { const g = this.gibs.shift(); this.scene.remove(g.m); }
    }
    const c = meshes[0] ? meshes[0].getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    const palettes = {
      pixels: [0xc8402f, 0x8a2a1f, TEAM_COLORS_HEX[team], 0xffffff],
      confetti: [0xff3f6a, 0x3ff2ff, 0xffe03f, 0x58ff6a],
      sparks: [0xffe070, 0xffa030, 0xffffff],
      hearts: [0xff4f8a, 0xff8ab0, 0xffffff],
      gold: [0xffd040, 0xffe890, 0xc89a28],
    };
    this.burst(c.x, c.y, c.z, effect === 'pixels' ? 18 : 30, { color: palettes[effect] || palettes.pixels, speed: effect === 'sparks' ? 8 : 5, life: effect === 'confetti' ? 1.6 : 0.9, size: 0.09, g: effect === 'hearts' ? -2 : 9, up: 0.5 });
  }

  // Cube-chain beam between two points (healing, repair). Rebuilt each frame by caller.
  beginBeams() { this.beamCount = 0; }
  // reach < 1 stops the chain early (e.g. a beam that ends at the local player's own chest)
  beam(a, b, color, t, curve = 0.6, wobble = 0, reach = 1) {
    const n = Math.min(40, Math.max(6, Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 3)));
    tmpC.setHex(color);
    for (let i = 0; i <= Math.floor(n * reach) && this.beamCount < 600; i++) {
      const u = i / n;
      const sag = Math.sin(u * Math.PI) * curve;
      const flow = (u * 6 - t * 4) % 1;
      tmpP.set(a.x + (b.x - a.x) * u + Math.sin(u * 20 + t * 15) * wobble, a.y + (b.y - a.y) * u + sag + Math.cos(u * 17 + t * 13) * wobble, a.z + (b.z - a.z) * u);
      const sz = 0.05 + (Math.abs(flow) < 0.25 ? 0.05 : 0);
      tmpE.set(t * 3 + i, t * 2, 0);
      tmpQ.setFromEuler(tmpE);
      tmpS.set(sz, sz, sz);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.beamMesh.setMatrixAt(this.beamCount, tmpM);
      this.beamMesh.setColorAt(this.beamCount, tmpC);
      this.beamCount++;
    }
  }
  endBeams() {
    this.beamMesh.count = this.beamCount;
    this.beamMesh.instanceMatrix.needsUpdate = true;
    if (this.beamMesh.instanceColor) this.beamMesh.instanceColor.needsUpdate = true;
  }

  flame(pos, dir, inheritVel) {
    const n = Math.max(1, Math.round(3 * this.quality.particleMult));
    for (let i = 0; i < n; i++) {
      const sp = 11 + Math.random() * 4;
      this.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + (Math.random() - 0.5) * 2.5 + (inheritVel ? inheritVel[0] : 0),
        vy: dir.y * sp + (Math.random() - 0.5) * 2.5 + 0.8,
        vz: dir.z * sp + (Math.random() - 0.5) * 2.5 + (inheritVel ? inheritVel[2] : 0),
        life: 0.4 + Math.random() * 0.2, size: 0.12, end: 0.5, color: [0xffe070, 0xff9a30, 0xff5a20, 0xffc040][(Math.random() * 4) | 0], g: -3, drag: 2.5,
      });
    }
  }

  update(dt) {
    this.time += dt;
    // particles
    let n = 0;
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    }
    for (const p of ps) {
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const k = p.life / p.max;
      const size = p.end ? p.size * (1 + (1 - k) * p.end * 4) * Math.min(1, k * 4) : p.size * Math.min(1, k * 3);
      tmpP.set(p.x, p.y, p.z);
      tmpE.set(p.rot, p.rot * 0.7, 0);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(Math.max(0.001, size));
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.pmesh.setMatrixAt(n, tmpM);
      tmpC.setHex(p.color);
      this.pmesh.setColorAt(n, tmpC);
      n++;
      if (n >= this.max) break;
    }
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;
    // tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / t.userData.max) * 0.9;
      if (t.userData.life <= 0) { this.scene.remove(t); this.tracers.splice(i, 1); this.tracerPool.push(t); }
    }
    // lights
    for (const l of this.lights) {
      if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = Math.max(0, l.userData.t / l.userData.max) * l.userData.i; }
      else l.intensity = 0;
    }
    // gibs
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life -= dt;
      g.vy -= 20 * dt;
      g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt;
      g.m.rotation.x += g.ax * dt; g.m.rotation.z += g.az * dt;
      if (this.world) {
        const fl = this.world.floorBelow(g.m.position.x, g.m.position.z, g.m.position.y + 0.3, 0.05);
        if (g.m.position.y < fl + 0.08) { g.m.position.y = fl + 0.08; g.vy = Math.abs(g.vy) * 0.3; g.vx *= 0.6; g.vz *= 0.6; g.ax *= 0.5; g.az *= 0.5; }
      }
      if (g.life < 0.5) g.m.scale.multiplyScalar(Math.max(0.01, 1 - dt * 3));
      if (g.life <= 0) { this.scene.remove(g.m); this.gibs.splice(i, 1); }
    }
  }

  clear() {
    this.parts.length = 0;
    for (const t of this.tracers) this.scene.remove(t);
    this.tracers.length = 0;
    for (const d of this.decals) this.scene.remove(d);
    this.decals.length = 0;
    for (const g of this.gibs) this.scene.remove(g.m);
    this.gibs.length = 0;
  }
}
