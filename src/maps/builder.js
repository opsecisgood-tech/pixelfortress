// Map construction DSL. Maps are authored as data through this builder, then consumed by:
//  - shared physics (collision boxes), server (spawns, objectives, pickups, nav), client renderer (meshes, props, lighting).
// Rotational symmetry: geometry added inside sym() is duplicated rotated 180° about the Y axis, with
// team-owned items swapped. This guarantees both teams get mechanically identical bases and routes.

export class MapBuilder {
  constructor(meta) {
    this.meta = meta;
    this.boxes = [];
    this.deco = [];
    this.spawns = [];
    this.spawnRooms = [];
    this.resupply = [];
    this.flags = [null, null];
    this.pickups = [];
    this.lights = [];
    this.soundZones = [];
    this.symMode = false;
  }

  _emit(fn) {
    fn(false);
    if (this.symMode) fn(true);
  }

  // Rotate point 180° around Y if mirrored.
  static rp(x, z, m) { return m ? [-x, -z] : [x, z]; }
  _team(t, m) { return m ? 1 - t : t; }
  _mat(mat, m) {
    if (!mat) return mat;
    if (mat === 'team') return m ? 'team_blue' : 'team_red';
    if (mat === 'teamdark') return m ? 'teamdark_blue' : 'teamdark_red';
    if (mat === 'enemy') return m ? 'team_red' : 'team_blue';
    return mat;
  }

  sym(fn) {
    this.symMode = true;
    fn(this);
    this.symMode = false;
    return this;
  }

  // Axis-aligned box from two corners.
  aabb(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    this._emit((m) => {
      let [ax, az] = MapBuilder.rp(x0, z0, m);
      let [bx, bz] = MapBuilder.rp(x1, z1, m);
      const conv = opts.conv ? (m ? [-opts.conv[0], -opts.conv[1]] : opts.conv) : undefined;
      this.boxes.push({
        min: [Math.min(ax, bx), Math.min(y0, y1), Math.min(az, bz)],
        max: [Math.max(ax, bx), Math.max(y0, y1), Math.max(az, bz)],
        mat: this._mat(mat, m),
        ...(opts.col === false ? { col: false } : {}),
        ...(opts.shot === false ? { shot: false } : {}),
        ...(opts.vis === false ? { vis: false } : {}),
        ...(conv ? { conv } : {}),
        ...(opts.emissive ? { emissive: true } : {}),
        ...(opts.trans ? { trans: true } : {}),
      });
    });
    return this;
  }

  // Box by centre-x, base-y, centre-z and size.
  box(x, y, z, w, h, d, mat, opts) {
    return this.aabb(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, mat, opts);
  }

  // Flat slab whose top is at y.
  floor(x0, z0, x1, z1, y, mat, thick = 0.5, opts) {
    return this.aabb(x0, y - thick, z0, x1, y, z1, mat, opts);
  }

  // Wall running along X at depth z, with openings [{at, w, h, y?}] (at = centre x).
  wallX(x0, x1, z, y, h, t, mat, openings = [], opts) {
    const segs = splitSpan(x0, x1, openings);
    for (const [a, b] of segs) this.aabb(a, y, z - t / 2, b, y + h, z + t / 2, mat, opts);
    for (const o of openings) {
      const oy = (o.y ?? 0);
      const top = y + oy + o.h;
      if (oy > 0) this.aabb(o.at - o.w / 2, y, z - t / 2, o.at + o.w / 2, y + oy, z + t / 2, mat, opts);
      if (top < y + h) this.aabb(o.at - o.w / 2, top, z - t / 2, o.at + o.w / 2, y + h, z + t / 2, mat, opts);
    }
    return this;
  }

  // Wall running along Z at x.
  wallZ(z0, z1, x, y, h, t, mat, openings = [], opts) {
    const segs = splitSpan(z0, z1, openings);
    for (const [a, b] of segs) this.aabb(x - t / 2, y, a, x + t / 2, y + h, b, mat, opts);
    for (const o of openings) {
      const oy = (o.y ?? 0);
      const top = y + oy + o.h;
      if (oy > 0) this.aabb(x - t / 2, y, o.at - o.w / 2, x + t / 2, y + oy, o.at + o.w / 2, mat, opts);
      if (top < y + h) this.aabb(x - t / 2, top, o.at - o.w / 2, x + t / 2, y + h, o.at + o.w / 2, mat, opts);
    }
    return this;
  }

  /**
   * Rectangular building shell.
   * o: { x0, z0, x1, z1, y, h, t, wall, floor, roof, trim, doors: { xmin:[], xmax:[], zmin:[], zmax:[] } }
   */
  room(o) {
    const t = o.t ?? 0.5;
    const y = o.y ?? 0;
    const d = o.doors || {};
    this.wallZ(o.z0, o.z1, o.x0 + t / 2, y, o.h, t, o.wall, d.xmin || []);
    this.wallZ(o.z0, o.z1, o.x1 - t / 2, y, o.h, t, o.wall, d.xmax || []);
    this.wallX(o.x0 + t, o.x1 - t, o.z0 + t / 2, y, o.h, t, o.wall, d.zmin || []);
    this.wallX(o.x0 + t, o.x1 - t, o.z1 - t / 2, y, o.h, t, o.wall, d.zmax || []);
    if (o.floor) this.floor(o.x0, o.z0, o.x1, o.z1, y + 0.02, o.floor, 0.1);
    if (o.roof) {
      if (o.roofHoles) {
        // roof with skylight openings along x
        this.aabb(o.x0, y + o.h, o.z0, o.x1, y + o.h + 0.5, o.z0 + (o.z1 - o.z0) * 0.3, o.roof);
        this.aabb(o.x0, y + o.h, o.z1 - (o.z1 - o.z0) * 0.3, o.x1, y + o.h + 0.5, o.z1, o.roof);
      } else this.aabb(o.x0, y + o.h, o.z0, o.x1, y + o.h + 0.5, o.z1, o.roof);
    }
    if (o.trim) {
      this.aabb(o.x0 - 0.05, y + o.h - 0.6, o.z0 - 0.05, o.x1 + 0.05, y + o.h, o.z1 + 0.05, o.trim, { col: false, shot: false });
    }
    return this;
  }

  /**
   * Staircase. dir: '+x' | '-x' | '+z' | '-z' (direction of ascent). (x,z) is the bottom-front centre.
   */
  stairs(x, y, z, dir, width, rise, mat, run = 0.5) {
    const n = Math.max(1, Math.ceil(rise / 0.42));
    const sh = rise / n;
    for (let i = 0; i < n; i++) {
      const top = y + sh * (i + 1);
      const a = run * i, bb = run * (i + 1);
      if (dir === '+x') this.aabb(x + a, y, z - width / 2, x + bb, top, z + width / 2, mat);
      else if (dir === '-x') this.aabb(x - bb, y, z - width / 2, x - a, top, z + width / 2, mat);
      else if (dir === '+z') this.aabb(x - width / 2, y, z + a, x + width / 2, top, z + bb, mat);
      else this.aabb(x - width / 2, y, z - bb, x + width / 2, top, z - a, mat);
    }
    return this;
  }

  // Shipping container (6 x 2.6 x 2.4). alongX = long axis on X.
  container(x, y, z, alongX, color = 'red') {
    const w = alongX ? 6 : 2.4, d = alongX ? 2.4 : 6;
    this.box(x, y, z, w, 2.6, d, `container_${color}`);
    return this;
  }

  crate(x, y, z, s = 1.2, mat = 'crate') {
    return this.box(x, y, z, s, s, s, mat);
  }

  // Chain-link fence: blocks movement, not bullets.
  fence(x0, z0, x1, z1, h = 2.6, y = 0) {
    const t = 0.1;
    if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) this.aabb(x0, y, z0 - t, x1, y + h, z0 + t, 'fence', { shot: false, trans: true });
    else this.aabb(x0 - t, y, z0, x0 + t, y + h, z1, 'fence', { shot: false, trans: true });
    return this;
  }

  // Decorative (render-only) prop. col: optional [w,h,d] collision approximation (invisible but matches prop).
  prop(type, x, y, z, o = {}) {
    this._emit((m) => {
      const [px, pz] = MapBuilder.rp(x, z, m);
      const rot = (o.rot || 0) + (m ? Math.PI : 0);
      const team = o.team !== undefined ? this._team(o.team, m) : undefined;
      this.deco.push({ type, pos: [px, y, pz], rot, ...o, ...(team !== undefined ? { team } : {}), ...(o.rot !== undefined || m ? { rot } : {}) });
      if (o.col) {
        const [w, h, d] = o.col;
        const rw = Math.abs(Math.sin(rot)) > 0.7 ? d : w;
        const rd = Math.abs(Math.sin(rot)) > 0.7 ? w : d;
        this.boxes.push({ min: [px - rw / 2, y, pz - rd / 2], max: [px + rw / 2, y + h, pz + rd / 2], mat: o.colMat || 'metal', vis: false });
      }
    });
    return this;
  }

  light(x, y, z, color, intensity = 1, dist = 14) {
    this._emit((m) => {
      const [px, pz] = MapBuilder.rp(x, z, m);
      this.lights.push({ pos: [px, y, pz], color, intensity, dist });
    });
    return this;
  }

  spawn(team, x, y, z, yaw) {
    this._emit((m) => {
      const [px, pz] = MapBuilder.rp(x, z, m);
      this.spawns.push({ team: this._team(team, m), pos: [px, y, pz], yaw: yaw + (m ? Math.PI : 0) });
    });
    return this;
  }

  spawnRoom(team, x0, y0, z0, x1, y1, z1) {
    this._emit((m) => {
      const [ax, az] = MapBuilder.rp(x0, z0, m);
      const [bx, bz] = MapBuilder.rp(x1, z1, m);
      this.spawnRooms.push({ team: this._team(team, m), min: [Math.min(ax, bx), y0, Math.min(az, bz)], max: [Math.max(ax, bx), y1, Math.max(az, bz)] });
    });
    return this;
  }

  resupplyAt(team, x, y, z, rot = 0) {
    this._emit((m) => {
      const [px, pz] = MapBuilder.rp(x, z, m);
      this.resupply.push({ team: this._team(team, m), pos: [px, y, pz], rot: rot + (m ? Math.PI : 0) });
    });
    return this;
  }

  flag(team, x, y, z) {
    this._emit((m) => {
      const [px, pz] = MapBuilder.rp(x, z, m);
      this.flags[this._team(team, m)] = [px, y, pz];
    });
    return this;
  }

  pickup(kind, size, x, y, z) {
    this._emit((m) => {
      const [px, pz] = MapBuilder.rp(x, z, m);
      this.pickups.push({ kind, size, pos: [px, y, pz] });
    });
    return this;
  }

  soundZone(x0, y0, z0, x1, y1, z1, kind) {
    this._emit((m) => {
      const [ax, az] = MapBuilder.rp(x0, z0, m);
      const [bx, bz] = MapBuilder.rp(x1, z1, m);
      this.soundZones.push({ kind, min: [Math.min(ax, bx), y0, Math.min(az, bz)], max: [Math.max(ax, bx), y1, Math.max(az, bz)] });
    });
    return this;
  }

  build() {
    const m = this.meta;
    return {
      ...m,
      boxes: this.boxes,
      deco: this.deco,
      spawns: this.spawns,
      spawnRooms: this.spawnRooms,
      resupply: this.resupply,
      flags: this.flags,
      pickups: this.pickups,
      lights: this.lights,
      soundZones: this.soundZones,
    };
  }
}

function splitSpan(a0, a1, openings) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const holes = openings.map((o) => [o.at - o.w / 2, o.at + o.w / 2]).sort((p, q) => p[0] - q[0]);
  const segs = [];
  let cur = lo;
  for (const [h0, h1] of holes) {
    if (h0 > cur) segs.push([cur, Math.min(h0, hi)]);
    cur = Math.max(cur, h1);
  }
  if (cur < hi) segs.push([cur, hi]);
  return segs.filter(([p, q]) => q - p > 0.01);
}
