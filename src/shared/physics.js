// Collision world built from axis-aligned boxes (the game's blocky geometry makes AABBs exact).
// Spatial hash on the XZ plane for fast queries and ray casts. Shared by server and client prediction.
import { rayAabb } from './math.js';

const CELL = 4;

export class World {
  constructor(boxes, bounds) {
    this.boxes = [];
    this.stamp = 1;
    this.bounds = bounds || { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    this.cells = new Map();
    for (const b of boxes) this.addBox(b);
    this._normal = [0, 0, 0];
    this.holes = []; // round holes burnt through geometry (Admin Gun): { a:[x,y,z], b:[x,y,z], r }
  }

  setHoles(list) {
    this.holes = (list || []).map((h) => ({
      ...h,
      min: [Math.min(h.a[0], h.b[0]) - h.r, Math.min(h.a[1], h.b[1]) - h.r, Math.min(h.a[2], h.b[2]) - h.r],
      max: [Math.max(h.a[0], h.b[0]) + h.r, Math.max(h.a[1], h.b[1]) + h.r, Math.max(h.a[2], h.b[2]) + h.r],
    }));
  }
  // squared distance from the hole's axis, or Infinity outside the cylinder's two end faces
  static holeD2(h, x, y, z) {
    const ax = h.a[0], ay = h.a[1], az = h.a[2];
    const bx = h.b[0] - ax, by = h.b[1] - ay, bz = h.b[2] - az;
    const l2 = bx * bx + by * by + bz * bz || 1;
    const t = ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / l2;
    if (t < -0.05 || t > 1.05) return Infinity;
    const dx = x - (ax + bx * t), dy = y - (ay + by * t), dz = z - (az + bz * t);
    return dx * dx + dy * dy + dz * dz;
  }
  // Is this point inside a hole (within its radius of the hole's axis segment)?
  inHole(x, y, z, pad = 0) {
    for (const h of this.holes) if (World.holeD2(h, x, y, z) < (h.r - pad) * (h.r - pad)) return true;
    return false;
  }
  // A box doesn't block a region if the part of the box inside that region lies wholly inside one hole
  // (the hole cylinder is convex, so checking the 8 corners of the overlap is enough). This makes holes
  // real gaps: players fall through holes in floors and fit through big enough holes in walls.
  holeCovers(b, x0, y0, z0, x1, y1, z1) {
    if (!this.holes.length) return false;
    const ix0 = Math.max(b.minX, x0), iy0 = Math.max(b.minY, y0), iz0 = Math.max(b.minZ, z0);
    const ix1 = Math.min(b.maxX, x1), iy1 = Math.min(b.maxY, y1), iz1 = Math.min(b.maxZ, z1);
    if (ix0 > ix1 || iy0 > iy1 || iz0 > iz1) return false;
    for (const h of this.holes) {
      if (h.box !== undefined && h.box !== b.id) continue; // a hole only opens the object it was burnt into
      if (ix0 < h.min[0] || ix1 > h.max[0] || iy0 < h.min[1] || iy1 > h.max[1] || iz0 < h.min[2] || iz1 > h.max[2]) continue;
      const r2 = h.r * h.r;
      let all = true;
      for (let c = 0; c < 8 && all; c++) if (World.holeD2(h, c & 1 ? ix1 : ix0, c & 2 ? iy1 : iy0, c & 4 ? iz1 : iz0) >= r2) all = false;
      if (all) return true;
    }
    return false;
  }
  // Does box b block a body occupying this region?
  solid(b, x0, y0, z0, x1, y1, z1) { return b.col && !this.holeCovers(b, x0, y0, z0, x1, y1, z1); }

  addBox(src) {
    const b = {
      minX: src.min[0], minY: src.min[1], minZ: src.min[2],
      maxX: src.max[0], maxY: src.max[1], maxZ: src.max[2],
      col: src.col !== false,
      shot: src.shot !== false,
      mat: src.mat,
      conv: src.conv || null,
      hazard: src.hazard || null,
      id: this.boxes.length,
      _s: 0,
    };
    this.boxes.push(b);
    const cx0 = Math.floor(b.minX / CELL), cx1 = Math.floor(b.maxX / CELL);
    const cz0 = Math.floor(b.minZ / CELL), cz1 = Math.floor(b.maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let list = this.cells.get(k);
        if (!list) { list = []; this.cells.set(k, list); }
        list.push(b);
      }
    }
    return b;
  }

  _cell(cx, cz) {
    return this.cells.get(cx * 73856093 ^ cz * 19349663);
  }

  // Invoke cb for each box overlapping the AABB. cb returning true stops iteration.
  query(minX, minY, minZ, maxX, maxY, maxZ, cb) {
    const s = ++this.stamp;
    const cx0 = Math.floor(minX / CELL), cx1 = Math.floor(maxX / CELL);
    const cz0 = Math.floor(minZ / CELL), cz1 = Math.floor(maxZ / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this._cell(cx, cz);
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._s === s) continue;
          b._s = s;
          if (b.maxX <= minX || b.minX >= maxX || b.maxY <= minY || b.minY >= maxY || b.maxZ <= minZ || b.minZ >= maxZ) continue;
          if (cb(b)) return true;
        }
      }
    }
    return false;
  }

  // True if a solid (player-blocking) box overlaps.
  overlapsSolid(minX, minY, minZ, maxX, maxY, maxZ) {
    return this.query(minX, minY, minZ, maxX, maxY, maxZ, (b) => b.col && !this.holeCovers(b, minX, minY, minZ, maxX, maxY, maxZ));
  }

  // Ray cast against shot-blocking boxes. Returns { t, normal:[x,y,z], box } or null. Shots (not
  // player-collision rays) fly through holes burnt into the geometry.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, forPlayers = false) {
    if (forPlayers || !this.holes.length) return this._raycast(ox, oy, oz, dx, dy, dz, maxDist, false);
    let off = 0;
    for (let i = 0; i < 12; i++) {
      const h = this._raycast(ox + dx * off, oy + dy * off, oz + dz * off, dx, dy, dz, maxDist - off, false);
      if (!h) return null;
      const t = off + h.t;
      if (!this.inHole(ox + dx * t, oy + dy * t, oz + dz * t, 0.02)) return { ...h, t };
      off = t + 0.05; // passes through the hole: keep going
      if (off >= maxDist) return null;
    }
    return null;
  }

  _raycast(ox, oy, oz, dx, dy, dz, maxDist, forPlayers = false) {
    // 2D DDA across XZ cells.
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const hd = Math.hypot(dx, dz);
    const tDeltaX = Math.abs(dx) > 1e-9 ? Math.abs(CELL / dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? Math.abs(CELL / dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((stepX > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((stepZ > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
    const s = ++this.stamp;
    let best = maxDist, bestBox = null;
    const n = this._normal, bestN = [0, 0, 0];
    let tCell = 0;
    let guard = 0;
    // Pure vertical rays only visit one cell.
    const vertical = hd < 1e-6;
    while (guard++ < 512) {
      const list = this._cell(cx, cz);
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._s === s) continue;
          b._s = s;
          if (forPlayers ? !b.col : !b.shot) continue;
          const t = rayAabb(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best, n);
          if (t >= 0 && t < best) {
            best = t; bestBox = b; bestN[0] = n[0]; bestN[1] = n[1]; bestN[2] = n[2];
          }
        }
      }
      if (vertical) break;
      const tNext = Math.min(tMaxX, tMaxZ);
      if (bestBox && best <= tNext) break;
      if (tNext > maxDist) break;
      tCell = tNext;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDeltaX; } else { cz += stepZ; tMaxZ += tDeltaZ; }
    }
    if (!bestBox) return null;
    return { t: best, normal: bestN, box: bestBox };
  }

  // Line of sight between two points (shot-blocking geometry).
  los(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    return !this.raycast(a[0], a[1], a[2], dx / d, dy / d, dz / d, d - 0.05);
  }

  // Highest solid surface at (x,z) below yStart. Returns y or -Infinity.
  floorBelow(x, z, yStart, r = 0.05) {
    let best = -Infinity;
    this.query(x - r, -1000, z - r, x + r, yStart, z + r, (b) => {
      if (b.col && b.maxY <= yStart + 1e-3 && b.maxY > best && !this.holeCovers(b, x - r, b.maxY - 0.05, z - r, x + r, b.maxY, z + r)) best = b.maxY;
    });
    return best;
  }

  // The box directly beneath an AABB footprint (used for conveyor + footstep material).
  groundBox(x, y, z, r) {
    let found = null, top = -Infinity;
    this.query(x - r, y - 0.08, z - r, x + r, y + 0.02, z + r, (b) => {
      if (b.col && b.maxY <= y + 0.03 && b.maxY > top && !this.holeCovers(b, x - r, y - 0.08, z - r, x + r, y + 0.02, z + r)) { top = b.maxY; found = b; }
    });
    return found;
  }
}
