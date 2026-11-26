// Pixel-sprite → voxel extrusion. Weapons (and character details) are drawn as small pixel-art
// sprites with a drawing DSL, then extruded into chunky voxels like a 3D pixel item: 1-px dark outline,
// highlight on top edges, shade on bottom edges, per-region depth (thick receivers, thin sights).
import * as THREE from 'three';
import { mulberry32 } from '../../shared/math.js';

export class PixelSprite {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.key = new Array(w * h).fill(null);
    this.depth = new Uint8Array(w * h);
  }
  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.key[this.idx(x, y)] : null; }
  getDepth(x, y) { return this.inside(x, y) ? this.depth[this.idx(x, y)] : 0; }
  // depth: odd voxel count (1,3,5,7). If omitted on an already filled pixel, keep its depth.
  px(x, y, key, depth) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return this;
    const i = this.idx(x, y);
    if (key === null) { this.key[i] = null; this.depth[i] = 0; return this; }
    this.key[i] = key;
    if (depth !== undefined) this.depth[i] = depth;
    else if (!this.depth[i]) this.depth[i] = 3;
    return this;
  }
  rect(x, y, w, h, key, depth) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, key, depth);
    return this;
  }
  clear(x, y, w, h) { return this.rect(x, y, w, h, null); }
  // mirror the sprite top-to-bottom (used to put a melee weapon's edge on its leading side)
  flipY() {
    const { w, h } = this;
    for (let y = 0; y < h >> 1; y++) for (let x = 0; x < w; x++) {
      const a = this.idx(x, y), b = this.idx(x, h - 1 - y);
      [this.key[a], this.key[b]] = [this.key[b], this.key[a]];
      [this.depth[a], this.depth[b]] = [this.depth[b], this.depth[a]];
    }
    return this;
  }
  line(x0, y0, x1, y1, key, depth) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (let guard = 0; guard < 400; guard++) {
      this.px(x, y, key, depth);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
    return this;
  }
  // Scanline polygon fill (pixel centres).
  poly(pts, key, depth) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.px(x, y, key, depth);
      }
    }
    return this;
  }
}

function shadeHex(hex, f) {
  const r = Math.min(255, ((hex >> 16) & 255) * f), g = Math.min(255, ((hex >> 8) & 255) * f), b = Math.min(255, (hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}

const OUTLINE = 0x17181b;

/**
 * Build voxel geometry from a sprite.
 * pal: key -> hex colour. glowKeys: Set of keys rendered unlit.
 * map(i, j, layer) -> [x, y, z] in metres for the voxel centre; size: voxel edge length.
 * Returns { solid: BufferGeometry, glow: BufferGeometry|null }
 */
export function voxelizeSprite(sprite, pal, opts) {
  const { size, glowKeys = new Set(), outline = true, seed = 1 } = opts;
  // pad by one pixel so outlines never fall off the canvas
  const W = sprite.w + 2, H = sprite.h + 2;
  const src = new PixelSprite(W, H);
  for (let y = 0; y < sprite.h; y++) for (let x = 0; x < sprite.w; x++) {
    const k = sprite.get(x, y);
    if (k) src.px(x + 1, y + 1, k, sprite.getDepth(x, y));
  }
  const map = (x, y, l) => opts.map(x - 1, y - 1, l);
  // 1) outline pass: empty pixels next to filled ones become outline with neighbour depth.
  const key = src.key.slice();
  const depth = Uint8Array.from(src.depth);
  if (outline) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (src.get(x, y)) continue;
        let d = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = src.get(x + dx, y + dy);
          if (k && !glowKeys.has(k)) d = Math.max(d, src.getDepth(x + dx, y + dy));
          else if (k) d = Math.max(d, 1);
        }
        if (d) { key[y * W + x] = '__ol'; depth[y * W + x] = d; }
      }
    }
  }
  // 2) colours per pixel with automatic highlight / shade
  const rnd = mulberry32(seed);
  const patGlow = new Set();
  const colAt = (x, y) => {
    const k = key[y * W + x];
    if (k === '__ol') return OUTLINE;
    let c = pal[k] ?? 0xff00ff;
    if (k === 'hl') return 0xf6f6f2;
    if (opts.pattern) { const pc = opts.pattern(x - 1, y - 1, k, c); if (pc != null) { c = pc & 0xffffff; if (pc > 0xffffff) patGlow.add(y * W + x); } }
    const up = y > 0 ? key[(y - 1) * W + x] : null;
    const dn = y < H - 1 ? key[(y + 1) * W + x] : null;
    let f = 1 + (rnd() - 0.5) * 0.07;
    if (up !== k) f *= 1.24;
    else if (y > 1 && key[(y - 2) * W + x] !== k) f *= 1.1;
    if (dn !== k) f *= 0.74;
    return shadeHex(c, f);
  };
  // 3) occupancy grid in 3D (x, y, layer) for face culling
  const maxD = 9, L0 = (maxD - 1) / 2;
  const occ = new Map();
  const ok = (x, y, l) => occ.has((y * (W + 2) + x + 1) * 16 + l + L0 + 1);
  const put = (x, y, l, v) => occ.set((y * (W + 2) + x + 1) * 16 + l + L0 + 1, v);
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = key[y * W + x];
    if (!k) continue;
    const d = Math.min(maxD, depth[y * W + x] | 1);
    const c = colAt(x, y);
    const glow = glowKeys.has(k) || patGlow.has(y * W + x);
    for (let l = -(d - 1) / 2; l <= (d - 1) / 2; l++) { put(x, y, l, 1); cells.push([x, y, l, c, glow]); }
  }
  const builders = { solid: newBuilder(), glow: newBuilder() };
  const half = size / 2;
  const tmpC = new THREE.Color();
  // faces: [dx, dy(sprite rows), dl, normalSign axis]
  const FACES = [
    { n: [0, -1, 0], d: [0, 1, 0], shade: 0.78 },   // sprite down (row+1) -> world -Y
    { n: [0, 1, 0], d: [0, -1, 0], shade: 1.0 },
    { n: [1, 0, 0], d: [0, 0, 1], shade: 1.0, side: true },   // layer +
    { n: [-1, 0, 0], d: [0, 0, -1], shade: 0.96, side: true },
    { n: [0, 0, 1], d: [-1, 0, 0], shade: 0.86 },
    { n: [0, 0, -1], d: [1, 0, 0], shade: 0.86 },
  ];
  for (const [x, y, l, c, glow] of cells) {
    const centre = map(x, y, l);
    const b = glow ? builders.glow : builders.solid;
    for (const f of FACES) {
      if (ok(x + f.d[0], y + f.d[1], l + f.d[2])) continue;
      tmpC.setHex(shadeHex(c, glow ? 1 : f.shade));
      // world normal: transform sprite-space axis through map by finite difference
      const nb = map(x + f.d[0], y + f.d[1], l + f.d[2]);
      const nx = (nb[0] - centre[0]) / size, ny = (nb[1] - centre[1]) / size, nz = (nb[2] - centre[2]) / size;
      addQuad(b, centre, [nx, ny, nz], half, tmpC);
    }
  }
  return { solid: finish(builders.solid), glow: finish(builders.glow) };
}

function newBuilder() { return { pos: [], nor: [], col: [], idx: [], n: 0 }; }
function addQuad(b, c, n, h, col) {
  // pick two tangent axes
  const ax = Math.abs(n[0]) > 0.5 ? 0 : Math.abs(n[1]) > 0.5 ? 1 : 2;
  const s = Math.sign(n[ax]);
  const u = ax === 0 ? [0, 1, 0] : [1, 0, 0];
  const v = ax === 2 ? [0, 1, 0] : [0, 0, 1];
  const fc = [c[0] + n[0] * h, c[1] + n[1] * h, c[2] + n[2] * h];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [a, bb] of corners) {
    b.pos.push(fc[0] + (u[0] * a + v[0] * bb) * h, fc[1] + (u[1] * a + v[1] * bb) * h, fc[2] + (u[2] * a + v[2] * bb) * h);
    b.nor.push(n[0], n[1], n[2]);
    b.col.push(col.r, col.g, col.b);
  }
  // winding so the face points along n: cross(u, v) is +axis for these choices
  const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const flip = (cr[ax] * s) < 0;
  const o = b.n;
  if (!flip) b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  else b.idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  b.n += 4;
}
function finish(b) {
  if (!b.n) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setIndex(b.n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Generic voxel geometry from explicit cells [{x,y,z,c}] on a unit grid (character hair, tufts).
 * origin/size convert grid -> metres. Faces between occupied cells are culled.
 */
export function voxelCells(cells, size, origin = [0, 0, 0]) {
  const set = new Set(cells.map((c) => `${c.x},${c.y},${c.z}`));
  const b = newBuilder();
  const col = new THREE.Color();
  const dirs = [[1, 0, 0, 0.92], [-1, 0, 0, 0.92], [0, 1, 0, 1.08], [0, -1, 0, 0.7], [0, 0, 1, 0.85], [0, 0, -1, 0.95]];
  for (const c of cells) {
    const ctr = [origin[0] + (c.x + 0.5) * size, origin[1] + (c.y + 0.5) * size, origin[2] + (c.z + 0.5) * size];
    for (const [dx, dy, dz, sh] of dirs) {
      if (set.has(`${c.x + dx},${c.y + dy},${c.z + dz}`)) continue;
      col.setHex(shadeHex(c.c, sh));
      addQuad(b, ctr, [dx, dy, dz], size / 2, col);
    }
  }
  return finish(b);
}

export const VOXEL_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
export const VOXEL_GLOW_MATERIAL = new THREE.MeshBasicMaterial({ vertexColors: true });
