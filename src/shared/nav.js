// Automatic navigation graph generation from map collision geometry, plus A* path finding.
// Used by server bots and by map validation tests (every spawn must reach every objective).
import { PLAYER_RADIUS, PLAYER_HEIGHT } from './constants.js';

const CELL = 1.0;

export class NavGraph {
  constructor(world, bounds) {
    this.world = world;
    this.bounds = bounds;
    this.nodes = [];          // { x, y, z, edges: [ { to, cost, kind } ] }
    this.columns = new Map(); // key -> [nodeIdx]
    this.build();
  }

  key(ix, iz) { return ix * 4096 + iz; }

  build() {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const w = this.world;
    const R = PLAYER_RADIUS * 0.85;
    this.ix0 = Math.floor(minX / CELL);
    this.iz0 = Math.floor(minZ / CELL);
    for (let ix = Math.floor(minX / CELL); ix <= Math.ceil(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.ceil(maxZ / CELL); iz++) {
        const x = (ix + 0.5) * CELL, z = (iz + 0.5) * CELL;
        const tops = [];
        w.query(x - 0.3, -50, z - 0.3, x + 0.3, 200, z + 0.3, (b) => {
          if (b.col) tops.push(b.maxY);
        });
        if (!tops.length) continue;
        tops.sort((a, c) => a - c);
        const list = [];
        let last = -Infinity;
        for (const ty of tops) {
          if (ty - last < 0.2) continue;
          // standing room?
          if (w.overlapsSolid(x - R, ty + 0.02, z - R, x + R, ty + PLAYER_HEIGHT, z + R)) continue;
          // must actually be a supporting top (point directly below supported)
          const fl = w.floorBelow(x, z, ty + 0.01, 0.25);
          if (Math.abs(fl - ty) > 0.01) continue;
          last = ty;
          const idx = this.nodes.length;
          this.nodes.push({ x, y: ty, z, ix, iz, edges: [] });
          list.push(idx);
        }
        if (list.length) this.columns.set(this.key(ix, iz), list);
      }
    }
    // Edges
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      for (const [dx, dz] of dirs) {
        const col = this.columns.get(this.key(n.ix + dx, n.iz + dz));
        if (!col) continue;
        const diag = dx !== 0 && dz !== 0;
        for (const j of col) {
          const m = this.nodes[j];
          const dy = m.y - n.y;
          let kind = null;
          if (Math.abs(dy) <= 1.05) kind = dy > 0.5 ? 'jump' : 'walk';
          else if (dy > 1.05 && dy <= 1.36) kind = 'jump';
          else if (dy < -1.05 && dy >= -7) kind = 'drop';
          if (!kind) continue;
          // clearance at the midpoint, at the higher of the two heights
          const mx = (n.x + m.x) / 2, mz = (n.z + m.z) / 2;
          const hy = Math.max(n.y, m.y) + 0.06;
          if (w.overlapsSolid(mx - R, hy, mz - R, mx + R, hy + PLAYER_HEIGHT - 0.1, mz + R)) continue;
          if (diag) {
            // avoid cutting corners through walls
            const a = this.columns.get(this.key(n.ix + dx, n.iz));
            const c = this.columns.get(this.key(n.ix, n.iz + dz));
            if (!a || !c) continue;
          }
          if (kind === 'jump') {
            // need headroom above the low node to jump
            if (w.overlapsSolid(n.x - 0.15, n.y + 0.5, n.z - 0.15, n.x + 0.15, n.y + PLAYER_HEIGHT + 1.2, n.z + 0.15)) continue;
          }
          const cost = Math.hypot(m.x - n.x, dy, m.z - n.z) * (kind === 'jump' ? 1.6 : kind === 'drop' ? 1.2 : 1);
          n.edges.push({ to: j, cost, kind });
        }
      }
    }
  }

  nearest(x, y, z, maxRadius = 4) {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    let best = -1, bestD = Infinity;
    for (let r = 0; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const col = this.columns.get(this.key(ix + dx, iz + dz));
          if (!col) continue;
          for (const i of col) {
            const n = this.nodes[i];
            const dyPenalty = n.y > y + 0.8 ? (n.y - y) * 4 : Math.abs(n.y - y) * 0.6;
            const d = Math.hypot(n.x - x, n.z - z) + dyPenalty;
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
      if (best >= 0 && r >= 1) break;
    }
    return best;
  }

  // A* from node a to node b. Returns array of node indices or null.
  path(a, b, maxIter = 20000) {
    if (a < 0 || b < 0) return null;
    if (a === b) return [a];
    const N = this.nodes;
    const g = new Map([[a, 0]]);
    const came = new Map();
    const open = new MinHeap();
    const h = (i) => Math.hypot(N[i].x - N[b].x, N[i].y - N[b].y, N[i].z - N[b].z);
    open.push(a, h(a));
    const closed = new Set();
    let iter = 0;
    while (open.size && iter++ < maxIter) {
      const cur = open.pop();
      if (cur === b) {
        const out = [cur];
        let c = cur;
        while (came.has(c)) { c = came.get(c); out.push(c); }
        return out.reverse();
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const gc = g.get(cur);
      for (const e of N[cur].edges) {
        if (closed.has(e.to)) continue;
        const ng = gc + e.cost;
        if (ng < (g.get(e.to) ?? Infinity)) {
          g.set(e.to, ng);
          came.set(e.to, cur);
          open.push(e.to, ng + h(e.to));
        }
      }
    }
    return null;
  }

  pathBetween(p0, p1) {
    return this.path(this.nearest(p0[0], p0[1], p0[2]), this.nearest(p1[0], p1[1], p1[2]));
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(item, pri) {
    const k = this.k, v = this.v;
    k.push(item); v.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
