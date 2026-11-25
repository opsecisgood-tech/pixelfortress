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
  }

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
    return this.query(minX, minY, minZ, maxX, maxY, maxZ, (b) => b.col);
  }

  // Ray cast against shot-blocking boxes. Returns { t, normal:[x,y,z], box } or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, forPlayers = false) {
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
      if (b.col && b.maxY <= yStart + 1e-3 && b.maxY > best) best = b.maxY;
    });
    return best;
  }

  // The box directly beneath an AABB footprint (used for conveyor + footstep material).
  groundBox(x, y, z, r) {
    let found = null, top = -Infinity;
    this.query(x - r, y - 0.08, z - r, x + r, y + 0.02, z + r, (b) => {
      if (b.col && b.maxY <= y + 0.03 && b.maxY > top) { top = b.maxY; found = b; }
    });
    return found;
  }
}
