// Builds the renderable world for a map: merged, chunked box geometry with world-space pixel UVs and
// baked vertex-colour ambient occlusion; batched props; lights; sky dome; clouds; weather particles.
import * as THREE from 'three';
import { getWorldMaterial, materialRecipe } from './textures.js';
import { buildProp, animateProp } from './props.js';
import { mergeStatic, bx, colorMat, coplanarOffsets } from './blocks.js';
import { mulberry32 } from '../../shared/math.js';
import { variantFor, makeCeilingTest, buildMapDetails } from './MapDetail.js';

const CHUNK = 24;

export class MapRenderer {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.dynamicProps = [];
    this.weather = null;
    this.time = 0;
  }

  build(map) {
    this.map = map;
    this.root.clear();
    this.dynamicProps = [];
    this.buildGeometry(map);
    this.buildProps(map);
    this.buildLights(map);
    this.buildSky(map);
    if (this.quality.weather) this.buildWeather(map);
    this.scene.add(this.root);
    return this;
  }

  buildGeometry(map) {
    const buckets = new Map();
    const ceil = makeCeilingTest(map);
    this.occ = ceil.occ;
    const bucketFor = (mat, b) => {
      const cx = Math.floor((b.min[0] + b.max[0]) / 2 / CHUNK);
      const cz = Math.floor((b.min[2] + b.max[2]) / 2 / CHUNK);
      const key = `${mat}|${cx}|${cz}`;
      let bucket = buckets.get(key);
      if (!bucket) { bucket = { mat, pos: [], nor: [], uv: [], col: [], idx: [], n: 0 }; buckets.set(key, bucket); }
      return bucket;
    };
    const shown = map.boxes.filter((b) => b.vis !== false && b.mat);
    const nudged = separateCoplanar(shown);
    this.visualBoxes = nudged;
    for (let i = 0; i < shown.length; i++) {
      const b = shown[i], nb = nudged[i];
      // texture variants per box, and a ceiling material for undersides seen from inside
      const mat = variantFor(b.mat, b);
      const ceilMat = ceil.ceilingFor(b);
      if (ceilMat) {
        appendBox(bucketFor(mat, b), nb, mat, 'nobottom');
        appendBox(bucketFor(ceilMat, b), nb, ceilMat, 'bottom');
      } else appendBox(bucketFor(mat, b), nb, mat, 'all');
    }
    for (const bucket of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bucket.col, 3));
      g.setIndex(bucket.n > 65535 ? new THREE.Uint32BufferAttribute(bucket.idx, 1) : new THREE.Uint16BufferAttribute(bucket.idx, 1));
      g.computeBoundingSphere();
      const mat = getWorldMaterial(bucket.mat);
      const mesh = new THREE.Mesh(g, mat);
      const rec = materialRecipe(bucket.mat);
      mesh.castShadow = !rec.alpha && this.quality.shadows;
      mesh.receiveShadow = this.quality.shadows;
      if (rec.alpha && mat.transparent) mesh.renderOrder = 2;
      this.root.add(mesh);
    }
  }

  buildProps(map) {
    const staticRoot = new THREE.Group();
    const detail = this.quality.propDetail;
    for (const d of map.deco) {
      if (detail < 1 && ['tumbleweed', 'fern', 'lilypad', 'mushroom', 'icicles', 'vine'].includes(d.type) && Math.abs(d.pos[0] * 7 + d.pos[2]) % 2 < 1) continue;
      staticRoot.add(buildProp(d));
    }
    staticRoot.add(buildMapDetails(map, { ...this.quality, propDetail: Math.max(0.4, detail) }, this.occ));
    // props and dressing are separated from each other and from the (already built) map boxes
    const merged = mergeStatic(staticRoot, this.visualBoxes || []);
    merged.traverse((o) => {
      if (o.userData && o.userData.anim) this.dynamicProps.push(o);
      if (o.isMesh) { o.castShadow = o.castShadow && this.quality.shadows; o.receiveShadow = this.quality.shadows; }
    });
    this.root.add(merged);
  }

  buildLights(map) {
    const env = map.env;
    const hemi = new THREE.HemisphereLight(env.ambient.sky, env.ambient.ground, env.ambient.intensity * 1.6);
    this.root.add(hemi);
    const sun = new THREE.DirectionalLight(env.sun.color, env.sun.intensity * 1.7);
    const d = env.sun.dir;
    sun.position.set(d[0] * 80, d[1] * 80, d[2] * 80);
    sun.target.position.set(0, 0, 0);
    if (this.quality.shadows) {
      sun.castShadow = true;
      const s = this.quality.shadowSize;
      sun.shadow.mapSize.set(s, s);
      const b = map.bounds;
      const ext = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62;
      sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
      sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
    }
    this.root.add(sun, sun.target);
    this.sun = sun;
    const lights = [...map.lights].sort((a, b) => b.intensity - a.intensity).slice(0, this.quality.maxLights);
    for (const l of lights) {
      const pl = new THREE.PointLight(l.color, l.intensity * 14, l.dist, 1.6);
      pl.position.set(...l.pos);
      this.root.add(pl);
    }
  }

  buildSky(map) {
    const env = map.env;
    const scene = this.scene;
    scene.fog = new THREE.Fog(env.fog.color, env.fog.near * this.quality.fogMult, env.fog.far * this.quality.fogMult);
    scene.background = new THREE.Color(env.sky[1]);
    // gradient dome
    const g = new THREE.SphereGeometry(400, 24, 12);
    const top = new THREE.Color(env.sky[0]), bot = new THREE.Color(env.sky[1]);
    const cols = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, Math.min(1, p.getY(i) / 400 * 1.6 + 0.1));
      const c = bot.clone().lerp(top, t);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const dome = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -10;
    this.root.add(dome);
    this.dome = dome;
    // sun / moon disc
    const night = env.night;
    const disc = new THREE.Mesh(new THREE.BoxGeometry(18, 18, 1), new THREE.MeshBasicMaterial({ color: night ? 0xe8ecff : 0xfff3c0, fog: false }));
    const d = env.sun.dir;
    disc.position.set(d[0] * 330, d[1] * 330, d[2] * 330);
    disc.lookAt(0, 0, 0);
    this.root.add(disc);
    // blocky clouds / stars
    const rnd = mulberry32(map.id.length * 77);
    this.clouds = new THREE.Group();
    if (night) {
      const pts = [];
      for (let i = 0; i < 500; i++) {
        const th = rnd() * Math.PI * 2, ph = rnd() * 1.2 + 0.15;
        pts.push(Math.cos(th) * Math.cos(ph) * 350, Math.sin(ph) * 350, Math.sin(th) * Math.cos(ph) * 350);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.clouds.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false })));
    } else if (env.clouds !== false) {
      const cm = new THREE.MeshLambertMaterial({ color: env.cloudColor || 0xffffff, transparent: true, opacity: 0.88, fog: false });
      for (let i = 0; i < 22; i++) {
        const c = new THREE.Group();
        const n = 2 + (rnd() * 3 | 0);
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(12 + rnd() * 18, 3 + rnd() * 3, 8 + rnd() * 10), cm);
          m.position.set(k * 9 - n * 4, rnd() * 2, rnd() * 6);
          c.add(m);
        }
        c.position.set((rnd() - 0.5) * 500, 70 + rnd() * 40, (rnd() - 0.5) * 500);
        this.clouds.add(c);
      }
    }
    this.root.add(this.clouds);
  }

  buildWeather(map) {
    const kind = map.env.weather;
    if (!kind || kind === 'none') return;
    const n = Math.round((kind === 'snow' ? 1400 : kind === 'rain' ? 1500 : 500) * this.quality.particleMult);
    const pos = new Float32Array(n * 3);
    const rnd = mulberry32(5);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 70; pos[i * 3 + 1] = rnd() * 30; pos[i * 3 + 2] = (rnd() - 0.5) * 70; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = kind === 'snow' ? 0xffffff : kind === 'dust' ? 0xe8c890 : kind === 'fireflies' ? 0xd8ff6a : kind === 'rain' ? 0x9fc8ff : 0xffffff;
    const size = kind === 'snow' ? 0.14 : kind === 'dust' ? 0.06 : kind === 'fireflies' ? 0.12 : 0.05;
    const m = new THREE.PointsMaterial({ color, size, transparent: true, opacity: kind === 'dust' ? 0.5 : 0.9, depthWrite: false, fog: true });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.weather = { kind, pts, n, speed: kind === 'snow' ? 1.6 : kind === 'rain' ? 22 : kind === 'dust' ? 0.4 : 0.2 };
    this.root.add(pts);
  }

  update(dt, camPos) {
    this.time += dt;
    for (const o of this.dynamicProps) animateProp(o, this.time, dt);
    if (this.clouds) this.clouds.rotation.y += dt * 0.004;
    if (this.dome && camPos) this.dome.position.set(camPos.x, 0, camPos.z);
    const w = this.weather;
    if (w && camPos) {
      const a = w.pts.geometry.attributes.position;
      const arr = a.array;
      for (let i = 0; i < w.n; i++) {
        let y = arr[i * 3 + 1] - w.speed * dt;
        if (w.kind === 'dust' || w.kind === 'fireflies') {
          arr[i * 3] += Math.sin(this.time * 0.7 + i) * dt * (w.kind === 'dust' ? 2.5 : 0.6);
          y = arr[i * 3 + 1] + Math.sin(this.time + i * 1.7) * dt * 0.3 - (w.kind === 'dust' ? 0.1 * dt : 0);
        } else if (w.kind === 'snow') arr[i * 3] += Math.sin(this.time + i) * dt * 0.4;
        if (y < 0) y += 30;
        if (y > 30) y -= 30;
        arr[i * 3 + 1] = y;
      }
      a.needsUpdate = true;
      w.pts.position.set(Math.floor(camPos.x / 70) * 70 * 0 + camPos.x, 0, camPos.z);
    }
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
    this.scene.remove(this.root);
  }
}

// Append the 6 faces of a box with world-space UVs and baked AO vertex colours.
// Anti z-fighting for map geometry (see coplanarOffsets in blocks.js): overlapping same-plane faces of
// smaller boxes are pushed outward a centimetre per layer. Only the visual box moves; collision uses
// the map data unchanged.
function separateCoplanar(boxes) {
  const off = coplanarOffsets(boxes, 0, 0.01);
  return boxes.map((b, i) => {
    const o = off[i], min = [...b.min], max = [...b.max];
    for (let ax = 0; ax < 3; ax++) { min[ax] -= o[ax * 2]; max[ax] += o[ax * 2 + 1]; }
    return { min, max, mat: b.mat };
  });
}

function appendBox(bk, b, matName = b.mat, which = 'all') {
  const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max;
  const rec = materialRecipe(matName);
  const tile = rec.tile;
  const faceMode = tile === 'face';
  const ts = faceMode ? 1 : 1 / tile;
  const ao = (y, isVertical) => {
    if (!isVertical) return 1;
    const h = Math.min(1, Math.max(0, (y - y0) / 2.2));
    return y0 < 0.6 ? 0.66 + 0.34 * h : 0.84 + 0.16 * h;
  };
  const faces = [
    // normal, 4 corners (counter-clockwise from outside)
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, vs] of faces) {
    if (n[1] === -1 && y0 <= 0.05) continue; // ground-level bottoms never visible
    if (which === 'bottom' && n[1] !== -1) continue;
    if (which === 'nobottom' && n[1] === -1) continue;
    const vertical = n[1] === 0;
    const base = bk.n;
    for (let i = 0; i < 4; i++) {
      const v = vs[i];
      bk.pos.push(v[0], v[1], v[2]);
      bk.nor.push(n[0], n[1], n[2]);
      let u, w;
      if (faceMode) {
        u = i === 0 || i === 3 ? 0 : 1; w = i < 2 ? 0 : 1;
      } else if (n[0] !== 0) { u = -v[2] * ts * n[0]; w = v[1] * ts; }
      else if (n[1] !== 0) { u = v[0] * ts; w = v[2] * ts; }
      else { u = v[0] * ts * n[2]; w = v[1] * ts; }
      bk.uv.push(u, w);
      const c = n[1] === -1 ? 0.55 : ao(v[1], vertical);
      bk.col.push(c, c, c);
    }
    bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    bk.n += 4;
  }
}

export { bx, colorMat };
