// Low-level helpers for building blocky meshes and merging static geometry.
import * as THREE from 'three';
import { makeCanvas } from './textures.js';
import { mulberry32 } from '../../shared/math.js';

let noiseTex = null;
export function getNoiseTexture() {
  if (noiseTex) return noiseTex;
  const c = makeCanvas(16, 16);
  const ctx = c.getContext('2d');
  const r = mulberry32(99);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 200 + (r() * 55) | 0;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 1, 1);
  }
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.magFilter = THREE.NearestFilter;
  noiseTex.minFilter = THREE.NearestFilter;
  noiseTex.colorSpace = THREE.SRGBColorSpace;
  return noiseTex;
}

const colorMats = new Map();
export function colorMat(color, opts = {}) {
  const key = `${color}|${opts.emissive || 0}|${opts.basic ? 1 : 0}|${opts.opacity ?? 1}|${opts.flat ? 1 : 0}`;
  if (colorMats.has(key)) return colorMats.get(key);
  let m;
  if (opts.basic) m = new THREE.MeshBasicMaterial({ color, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, depthWrite: (opts.opacity ?? 1) >= 1 });
  else m = new THREE.MeshLambertMaterial({ color, map: opts.flat ? null : getNoiseTexture(), emissive: opts.emissive || 0, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 });
  colorMats.set(key, m);
  return m;
}

const boxGeoCache = new Map();
export function boxGeo(w, h, d) {
  const key = `${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`;
  let g = boxGeoCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxGeoCache.set(key, g); }
  return g;
}

// Add a box (centre x, BASE y, centre z) to a parent.
export function bx(parent, x, y, z, w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d), opts.material || colorMat(color, opts));
  m.position.set(x, y + h / 2, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.name) m.name = opts.name;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Centre-anchored box.
export function cbx(parent, x, y, z, w, h, d, color, opts = {}) {
  const m = bx(parent, x, y - h / 2, z, w, h, d, color, opts);
  return m;
}

export function cyl(parent, x, y, z, r, h, color, seg = 8, opts = {}) {
  const g = new THREE.CylinderGeometry(opts.r2 ?? r, r, h, seg);
  const m = new THREE.Mesh(g, opts.material || colorMat(color, opts));
  m.position.set(x, y + h / 2, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/**
 * Merge all meshes under `root` into one mesh per material (static geometry batching).
 * Returns a Group with merged meshes. Meshes flagged userData.dynamic are kept as-is.
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.dynamic || hasDynamicParent(o)) { keep.push(o); return; }
    const mat = o.material;
    let b = buckets.get(mat);
    if (!b) { b = { pos: [], nor: [], uv: [], idx: [], count: 0, shadow: o.castShadow }; buckets.set(mat, b); }
    const g = o.geometry;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const m = o.matrixWorld;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      b.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      b.nor.push(v.x, v.y, v.z);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i)); else b.uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) b.idx.push(g.index.getX(i) + b.count);
    else for (let i = 0; i < p.count; i++) b.idx.push(i + b.count);
    b.count += p.count;
  });
  const out = new THREE.Group();
  for (const [mat, b] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = b.shadow;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const k of keep) {
    // re-parent dynamic objects with their world transform
    const top = topDynamic(k);
    if (top && !top.userData._moved) {
      top.userData._moved = true;
      top.updateMatrixWorld(true);
      top.matrixWorld.decompose(top.position, top.quaternion, top.scale);
      out.add(top);
    }
  }
  return out;
}

function hasDynamicParent(o) {
  let p = o.parent;
  while (p) { if (p.userData && p.userData.dynamic) return true; p = p.parent; }
  return false;
}
function topDynamic(o) {
  let cur = o, found = o.userData.dynamic ? o : null;
  while (cur.parent) { cur = cur.parent; if (cur.userData && cur.userData.dynamic) found = cur; }
  return found;
}
