// Soft glowing particles (round, additive, size-attenuated points) and the Admin Gun's beam of light.
// Unlike the blocky cube particles in Effects.js these are smooth light sprites, used for energy effects.
import * as THREE from 'three';

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export class GlowParticles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.n = 0;
    this.p = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float scale;
        void main() {
          vColor = color; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * scale / -mv.z, 1.0, 256.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.scene = scene;
    this.tmpC = new THREE.Color();
  }

  // o: { x, y, z, vx, vy, vz, life, size, end (size at death, fraction), color (hex or [start, end]), g, drag, alpha }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    const c0 = Array.isArray(o.color) ? o.color[0] : o.color ?? 0xffffff;
    const c1 = Array.isArray(o.color) ? o.color[1] : c0;
    this.p.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.6, max: o.life || 0.6, size: o.size || 0.2, end: o.end ?? 0.2, c0: new THREE.Color(c0), c1: new THREE.Color(c1), g: o.g ?? 0, drag: o.drag ?? 1, a: o.alpha ?? 1 });
  }

  // a cone/sphere of particles
  burst(x, y, z, n, o) {
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = (o.speed || 3) * (0.3 + Math.random() * 0.9);
      this.spawn({ ...o, x, y, z, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp + (o.up || 0), vz: Math.sin(ph) * Math.sin(th) * sp, life: (o.life || 0.6) * (0.6 + Math.random() * 0.8), size: (o.size || 0.2) * (0.6 + Math.random() * 0.8) });
    }
  }

  update(dt) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy = q.vy * k - q.g * dt; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      P[w++] = q;
    }
    P.length = w;
    const n = Math.min(w, this.max);
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const t = 1 - q.life / q.max;
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.y; this.pos[i * 3 + 2] = q.z;
      this.tmpC.copy(q.c0).lerp(q.c1, t);
      this.col[i * 3] = this.tmpC.r; this.col[i * 3 + 1] = this.tmpC.g; this.col[i * 3 + 2] = this.tmpC.b;
      this.size[i] = q.size * (1 + (q.end - 1) * t);
      this.alpha[i] = q.a * Math.min(1, q.life / Math.min(0.2, q.max * 0.5)) * Math.min(1, t * 8 + 0.3);
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
  }

  setPixelScale(h) { this.mat.uniforms.scale.value = h * 0.75; }
  clear() { this.p.length = 0; this.points.geometry.setDrawRange(0, 0); }
  dispose() { this.scene.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}

// The Admin Gun's beam: camera-facing ribbons along the (possibly curved) path, so it reads as a solid
// bar of light from any angle, including straight down the barrel. A hard white-hot core inside a
// yellow body (yellow at the gun, white toward the end), plus a wide additive glow, sparks shed along its
// length, and a quick flare before it thins and fades.
const ribbonVS = `
  attribute vec3 aTan; attribute float aSide; attribute float aU;
  uniform float width;
  varying float vSide; varying float vU;
  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 toCam = normalize(cameraPosition - wp);
    vec3 s = cross(aTan, toCam);
    float sl = length(s);
    s = sl > 1e-4 ? s / sl : normalize(cross(aTan, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
    // keep a minimum on-screen width when looking straight along the beam, taper right at the muzzle
    float taper = 0.35 + 0.65 * smoothstep(0.0, 0.03, aU);
    float w = width * taper * (1.0 + 0.6 * (1.0 - sl));
    wp += s * aSide * w;
    vSide = aSide; vU = aU;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const ribbonFS = `
  uniform vec3 c0; uniform vec3 c1; uniform float fade; uniform float time; uniform float glowOnly;
  varying float vSide; varying float vU;
  void main() {
    float d = abs(vSide);
    vec3 col = mix(c0, c1, smoothstep(0.0, 1.0, vU));
    float flicker = 0.9 + 0.1 * sin(vU * 140.0 - time * 50.0);
    if (glowOnly > 0.5) {
      float g = pow(1.0 - d, 2.2);
      gl_FragColor = vec4(col * g * fade * flicker, 1.0);
    } else {
      float core = 1.0 - smoothstep(0.16, 0.3, d);
      float body = 1.0 - smoothstep(0.55, 0.85, d);
      vec3 c = mix(col, vec3(1.0), core);
      gl_FragColor = vec4(c, body * fade);
    }
    #include <colorspace_fragment>
  }`;

function ribbonGeometry(curve, segs) {
  const n = segs + 1;
  const pos = new Float32Array(n * 2 * 3), tan = new Float32Array(n * 2 * 3), side = new Float32Array(n * 2), u = new Float32Array(n * 2);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const t = i / segs;
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      pos.set([p.x, p.y, p.z], j * 3); tan.set([tg.x, tg.y, tg.z], j * 3);
      side[j] = k ? 1 : -1; u[j] = t;
    }
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  g.setIndex(idx);
  return g;
}

export class BeamFX {
  constructor(scene, glow) {
    this.scene = scene;
    this.glow = glow;
    this.beams = [];
  }

  fire(points, life = 0.9) {
    const v = [];
    for (let i = 0; i < points.length; i += 3) v.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
    if (v.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
    const len = curve.getLength();
    const segs = Math.max(8, Math.min(400, Math.round(len * 4)));
    const geo = ribbonGeometry(curve, segs);
    const group = new THREE.Group();
    const layers = [
      { width: 0.85, glowOnly: 1, c0: 0xffa008, c1: 0xfff0a0, blend: THREE.AdditiveBlending, a: 0.9 },
      { width: 0.22, glowOnly: 0, c0: 0xffcc1a, c1: 0xffffff, blend: THREE.NormalBlending, a: 1 },
    ];
    const mats = [];
    for (const L of layers) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { c0: { value: new THREE.Color(L.c0) }, c1: { value: new THREE.Color(L.c1) }, fade: { value: L.a }, time: { value: 0 }, width: { value: L.width }, glowOnly: { value: L.glowOnly } },
        vertexShader: ribbonVS, fragmentShader: ribbonFS, transparent: true, depthWrite: false, blending: L.blend, side: THREE.DoubleSide, toneMapped: false,
      });
      mats.push({ mat, a: L.a, w: L.width });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.renderOrder = L.glowOnly ? 6 : 7;
      group.add(m);
    }
    // a plain solid core tube (no custom shader) under the ribbons, so the beam is always drawn even on
    // devices or drivers where the ribbon shader would struggle
    const baseGeo = new THREE.TubeGeometry(curve, Math.max(8, Math.min(160, Math.round(len * 1.5))), 0.07, 6, false);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.frustumCulled = false;
    base.renderOrder = 6;
    group.add(base);
    this.scene.add(group);
    // particle emitters along the whole beam: embers and bright sparks shed off the light
    const n = Math.min(450, Math.round(len * 6));
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const r = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(tan).normalize();
      const sp = 0.6 + Math.random() * 2.4;
      this.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: r.x * sp + tan.x * 0.6, vy: r.y * sp + 0.3, vz: r.z * sp + tan.z * 0.6, life: 0.5 + Math.random() * 0.9, size: 0.12 + Math.random() * 0.22, end: 0.1, color: [t < 0.5 ? 0xffd040 : 0xfff6c8, 0xff9a20], drag: 2.2, g: -0.4 });
    }
    this.beams.push({ group, geo, mats, base, t: 0, life, curve, len, emitT: 0 });
    return curve;
  }

  update(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.t += Math.min(dt, 0.12); // a hitch on a slow device can't swallow the whole beam in one frame
      const k = b.t / b.life;
      // a quick flare, then the beam thins and fades
      const flare = k < 0.1 ? 1.35 - k * 3.5 : 1;
      const thin = Math.max(0.15, 1 - k * k);
      b.base.material.opacity = Math.min(1, (1 - k) * 1.6);
      b.base.scale.setScalar(1);
      for (const m of b.mats) {
        m.mat.uniforms.fade.value = m.a * Math.min(1, (1 - k) * 1.6);
        m.mat.uniforms.width.value = m.w * thin * flare;
        m.mat.uniforms.time.value += dt;
      }
      b.emitT += dt;
      while (b.emitT > 0.012 && k < 0.7) {
        b.emitT -= 0.012;
        const t = Math.random();
        const p = b.curve.getPointAt(t);
        this.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 0.4 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.15, end: 0.05, color: [0xffffff, 0xffb030], drag: 2 });
      }
      if (k >= 1) this.remove(i);
    }
  }

  remove(i) {
    const b = this.beams[i];
    this.scene.remove(b.group);
    b.geo.dispose();
    for (const m of b.mats) m.mat.dispose();
    b.base.geometry.dispose(); b.base.material.dispose();
    this.beams.splice(i, 1);
  }
  clear() { while (this.beams.length) this.remove(this.beams.length - 1); }
}
