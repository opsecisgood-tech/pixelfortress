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
/**
 * Anti z-fighting: when two axis-aligned boxes have faces in the same plane, facing the same way and
 * overlapping, both fight for the same depth and flicker. Boxes are ranked by face area (largest
 * first); each overlapping face of a smaller box is pushed outward one `step` beyond the face below it,
 * so the smaller surface always sits on top. The first `fixed` boxes never move (already-built
 * geometry that others must clear). Returns per box [-x, +x, -y, +y, -z, +z] outward offsets.
 */
export function coplanarOffsets(boxes, fixed = 0, step = 0.006, eps = 0.003, passes = 2) {
  // a face pushed out in one pass can newly overlap a neighbour's face by a sliver: run a second pass
  // on the adjusted boxes and add the offsets up
  let total = boxes.map(() => [0, 0, 0, 0, 0, 0]);
  let cur = boxes;
  for (let pass = 0; pass < passes; pass++) {
    const off = coplanarPass(cur, fixed, step, eps);
    total = total.map((t, i) => t.map((v, k) => v + off[i][k]));
    cur = boxes.map((b, i) => {
      const min = [...b.min], max = [...b.max];
      for (let ax = 0; ax < 3; ax++) { min[ax] -= total[i][ax * 2]; max[ax] += total[i][ax * 2 + 1]; }
      return { min, max };
    });
  }
  return total;
}

function coplanarPass(boxes, fixed, step, eps) {
  const off = boxes.map(() => [0, 0, 0, 0, 0, 0]);
  const cell = 8, grid = new Map();
  const cellKey = (x, z) => x * 73856093 ^ z * 19349663;
  boxes.forEach((b, i) => {
    for (let x = Math.floor(b.min[0] / cell); x <= Math.floor(b.max[0] / cell); x++) {
      for (let z = Math.floor(b.min[2] / cell); z <= Math.floor(b.max[2] / cell); z++) {
        const k = cellKey(x, z);
        let l = grid.get(k); if (!l) { l = []; grid.set(k, l); } l.push(i);
      }
    }
  });
  const area = (b, ax) => { const [u, w] = [0, 1, 2].filter((k) => k !== ax); return (b.max[u] - b.min[u]) * (b.max[w] - b.min[w]); };
  for (let ax = 0; ax < 3; ax++) {
    for (const side of [0, 1]) {
      const key = side ? 'max' : 'min', fi = ax * 2 + side;
      const order = boxes.map((_, i) => i).sort((a, b) => ((a < fixed ? 0 : 1) - (b < fixed ? 0 : 1)) || area(boxes[b], ax) - area(boxes[a], ax) || a - b);
      const rank = new Int32Array(boxes.length);
      order.forEach((i, r) => { rank[i] = r; });
      for (const i of order) {
        if (i < fixed) continue;
        const A = boxes[i];
        const seen = new Set();
        let lift = 0;
        for (let x = Math.floor(A.min[0] / cell); x <= Math.floor(A.max[0] / cell); x++) {
          for (let z = Math.floor(A.min[2] / cell); z <= Math.floor(A.max[2] / cell); z++) {
            for (const j of grid.get(cellKey(x, z)) || []) {
              if (j === i || seen.has(j) || rank[j] > rank[i]) continue;
              seen.add(j);
              const B = boxes[j];
              const bFace = B[key][ax] + (side ? off[j][fi] : -off[j][fi]);
              if (Math.abs(A[key][ax] + (side ? lift : -lift) - bFace) > eps && Math.abs(A[key][ax] - B[key][ax]) > eps) continue;
              let overlap = true;
              for (let k = 0; k < 3; k++) if (k !== ax && Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k]) <= 0.001) overlap = false;
              if (overlap) lift = Math.max(lift, off[j][fi] + step);
            }
          }
        }
        off[i][fi] = lift;
      }
    }
  }
  return off;
}

// World AABBs of static, axis-aligned box meshes under root, with their coplanarOffsets.
function axisAlignedOffsets(root, fixedBoxes) {
  const items = [];
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'BoxGeometry' || o.userData.noGrow || o.userData.dynamic || hasDynamicParent(o)) return;
    o.matrixWorld.decompose(pos, q, sc);
    // axis-aligned when the rotation is a multiple of 90 degrees about Y only (the common case for props)
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const r90 = (a) => Math.abs(a / (Math.PI / 2) - Math.round(a / (Math.PI / 2))) < 1e-4;
    if (!r90(e.x) || !r90(e.y) || !r90(e.z)) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const x of [g.boundingBox.min.x, g.boundingBox.max.x]) for (const y of [g.boundingBox.min.y, g.boundingBox.max.y]) for (const z of [g.boundingBox.min.z, g.boundingBox.max.z]) {
      v.set(x, y, z).applyMatrix4(o.matrixWorld);
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v.getComponent(k)); max[k] = Math.max(max[k], v.getComponent(k)); }
    }
    items.push({ o, box: { min, max } });
  });
  const boxes = [...fixedBoxes.map((b) => ({ min: b.min, max: b.max })), ...items.map((it) => it.box)];
  const off = coplanarOffsets(boxes, fixedBoxes.length, 0.006);
  const out = new Map();
  items.forEach((it, i) => out.set(it.o, { box: it.box, off: off[fixedBoxes.length + i] }));
  return out;
}

export function mergeStatic(root, fixedBoxes = []) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  // Anti z-fighting: axis-aligned box parts get per-face offsets from coplanarOffsets (also clearing the
  // map's own boxes); rotated box parts just grow by a few millimetres (cycling amounts).
  let gi = 0;
  const ctr = new THREE.Vector3(), ws = new THREE.Vector3();
  const faceOff = axisAlignedOffsets(root, fixedBoxes);
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
    const fo = faceOff.get(o);
    const grow = !fo && g.type === 'BoxGeometry' && !o.userData.noGrow;
    let gx = 0, gy = 0, gz = 0;
    if (grow) {
      if (!g.boundingBox) g.computeBoundingBox();
      g.boundingBox.getCenter(ctr);
      o.getWorldScale(ws);
      const amt = 0.002 * ((gi++ % 7) + 1);
      gx = amt / (Math.abs(ws.x) || 1); gy = amt / (Math.abs(ws.y) || 1); gz = amt / (Math.abs(ws.z) || 1);
    }
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (grow) { v.x += Math.sign(v.x - ctr.x) * gx; v.y += Math.sign(v.y - ctr.y) * gy; v.z += Math.sign(v.z - ctr.z) * gz; }
      v.applyMatrix4(m);
      if (fo) {
        // push each face of the world-space box out by its own offset
        for (let ax = 0; ax < 3; ax++) {
          const c = v.getComponent(ax);
          if (Math.abs(c - fo.box.min[ax]) < 1e-4) v.setComponent(ax, c - fo.off[ax * 2]);
          else if (Math.abs(c - fo.box.max[ax]) < 1e-4) v.setComponent(ax, c + fo.off[ax * 2 + 1]);
        }
      }
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
  // moving parts (presses, gears, fans) aren't merged: grow their boxes through the mesh scale instead
  for (const k of keep) k.traverse((o) => {
    if (!o.isMesh || o.geometry.type !== 'BoxGeometry' || o.userData.grown) return;
    o.userData.grown = true;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const sz = g.boundingBox.max.clone().sub(g.boundingBox.min);
    const amt = 0.002 * ((gi++ % 7) + 1);
    o.scale.x *= 1 + (2 * amt) / Math.max(1e-3, sz.x); o.scale.y *= 1 + (2 * amt) / Math.max(1e-3, sz.y); o.scale.z *= 1 + (2 * amt) / Math.max(1e-3, sz.z);
  });
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
