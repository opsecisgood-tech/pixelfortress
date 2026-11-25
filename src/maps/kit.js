// Reusable structural kits used by several maps (always called inside b.sym(), authored for RED at -X).

/**
 * Two-storey team headquarters.
 * Layout (top view, RED side, enemy toward +X):
 *   [ spawn room | flag room (double height, 4 entrances) ] with side halls north/south,
 *   upper U-shaped gallery overlooking the flag room, front balconies, side doors.
 * o: { X0, X1, hw, H, wall, inner, floor, upper, roof, trim, stair, rail }
 */
export function standardBase(b, o) {
  const X0 = o.X0, X1 = o.X1, hw = o.hw ?? 16, H = o.H ?? 10;
  const U = 4.5;               // upper floor walking height
  const sx = X0 + 8;           // spawn/flag dividing wall x
  const fz = 7;                // flag room half-width
  const t = 0.5;
  const wall = o.wall, inner = o.inner || o.wall, rail = o.rail || 'railing', stair = o.stair || o.floor;

  // Outer shell with entrances.
  b.room({
    x0: X0, z0: -hw, x1: X1, z1: hw, y: 0, h: H, t, wall,
    floor: o.floor, roof: o.roof, trim: o.trim,
    doors: {
      xmax: [
        { at: 0, w: 4, h: 3.6 },
        { at: -(hw - 6), w: 2.6, h: 3.4 },
        { at: hw - 6, w: 2.6, h: 3.4 },
        { at: -(hw - 2.5), y: U, w: 2, h: 2.4 },
        { at: hw - 2.5, y: U, w: 2, h: 2.4 },
        { at: -4.5, y: U + 1, w: 2.5, h: 1.4 },
        { at: 4.5, y: U + 1, w: 2.5, h: 1.4 },
      ],
      zmin: [{ at: X1 - 3, w: 2.4, h: 3.4 }],
      zmax: [{ at: X1 - 3, w: 2.4, h: 3.4 }],
    },
  });

  // Ground-floor interior walls (height = U - 0.5 to meet the slab).
  const gh = U - 0.5;
  b.wallZ(-hw + t, hw - t, sx, 0, gh, t, inner, [
    { at: 0, w: 2.4, h: 3.2 },
    { at: -(hw - 4.5), w: 2.4, h: 3.2 },
    { at: hw - 4.5, w: 2.4, h: 3.2 },
  ]);
  b.wallX(sx + t / 2, X1 - t, -fz, 0, gh, t, inner, [{ at: X1 - 5.5, w: 2.4, h: 3.2 }]);
  b.wallX(sx + t / 2, X1 - t, fz, 0, gh, t, inner, [{ at: X1 - 5.5, w: 2.4, h: 3.2 }]);

  // Upper floor slabs: over spawn, and over both side halls (with stair holes).
  const sl = (x0, z0, x1, z1) => b.aabb(x0, U - 0.5, z0, x1, U, z1, o.upper || o.floor);
  sl(X0 + t, -hw + t, sx + t / 2, hw - t);
  for (const sgn of [-1, 1]) {
    const zIn = sgn * fz, zMid = sgn * (hw - 2.5), zOut = sgn * (hw - t);
    // main strip
    sl(sx + t / 2, Math.min(zIn, zMid), X1 - t, Math.max(zIn, zMid));
    // strip along the wall, with stair hole x in [sx+0.5, sx+6]
    sl(sx + 6, Math.min(zMid, zOut), X1 - t, Math.max(zMid, zOut));
    // stairs from hall up toward front
    b.stairs(sx + 0.5, 0, sgn * (hw - 1.5), '+x', 2, U, stair);
    // railing along flag-room void
    b.aabb(sx + t / 2, U, zIn - 0.06, X1 - t, U + 1.1, zIn + 0.06, rail, { shot: false, trans: true });
    // front balcony outside
    b.aabb(X1, U - 0.4, sgn * (hw - 0.5), X1 + 3.5, U, sgn * (hw - 5), o.upper || o.floor);
    b.aabb(X1 + 3.4, U, sgn * (hw - 0.5), X1 + 3.5, U + 1.1, sgn * (hw - 5), rail, { shot: false, trans: true });
  }
  // railing at back of flag room (edge of spawn upper floor)
  b.aabb(sx - 0.06, U, -fz, sx + 0.06, U + 1.1, fz, rail, { shot: false, trans: true });

  // Flag pedestal + flag.
  const fx = sx + (X1 - sx) * 0.45;
  b.box(fx, 0, 0, 2.2, 0.3, 2.2, o.trim || 'team');
  b.flag(0, fx, 0.3, 0);
  b.prop('flagbase', fx, 0.3, 0, { team: 0 });

  // Spawn room: zone, spawn points, resupply cabinets.
  b.spawnRoom(0, X0, 0, -hw, sx, U - 0.5, hw);
  for (let i = 0; i < 10; i++) {
    const z = -hw + 3 + (i % 5) * ((2 * hw - 6) / 4);
    const x = X0 + 2.2 + Math.floor(i / 5) * 3.2;
    b.spawn(0, x, 0.05, z, -Math.PI / 2);
  }
  b.resupplyAt(0, X0 + 0.9, 0, -hw * 0.45, 0);
  b.resupplyAt(0, X0 + 0.9, 0, hw * 0.45, 0);
  b.prop('resupply', X0 + 0.9, 0, -hw * 0.45, { team: 0, rot: -Math.PI / 2 });
  b.prop('resupply', X0 + 0.9, 0, hw * 0.45, { team: 0, rot: -Math.PI / 2 });
  b.prop('spawnsign', sx - 0.3, 2.6, 0, { team: 0, rot: -Math.PI / 2 });

  // Interior lights
  b.light(sx - 4, gh - 0.4, 0, 0xfff1d0, 0.9, 12);
  b.light(fx, H - 1, 0, 0xfff1d0, 1.0, 16);
  b.soundZone(X0, 0, -hw, X1, H, hw, 'interior');

  // Team pickups inside the halls
  b.pickup('health', 'medium', X1 - 1.5, 0.05, -(fz + 2.2));
  b.pickup('ammo', 'medium', X1 - 1.5, 0.05, fz + 2.2);
  b.pickup('health', 'small', sx + 3, U + 0.05, -(fz + 1.5));
  b.pickup('ammo', 'small', sx + 3, U + 0.05, fz + 1.5);

  // Team identity outside: banners & lamps flanking the main door.
  b.prop('banner', X1 + 0.3, 5.5, -3.2, { team: 0, rot: -Math.PI / 2 });
  b.prop('banner', X1 + 0.3, 5.5, 3.2, { team: 0, rot: -Math.PI / 2 });
  b.prop('teamsign', X1 + 0.3, H - 2, 0, { team: 0, rot: -Math.PI / 2, label: o.label || 'HQ' });
  return { U, sx, fx };
}

// Irregular rock/cliff border to keep boundaries visible and natural.
export function cliffBorder(b, minX, maxX, minZ, maxZ, mat, h = 12, seed = 1, skipZ = [0, 0]) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; };
  // perimeter walls (in sym: author zmin side + xmin side)
  b.aabb(minX, 0, minZ - 2, maxX, h, minZ, mat);
  b.aabb(minX - 2, 0, minZ, minX, h, maxZ, mat);
  // outcrops along zmin edge (only half the length; symmetry fills the rest)
  for (let x = minX + 2; x < maxX - 2; x += 6 + rnd() * 6) {
    const w = 3 + rnd() * 4, d = 1 + rnd() * 1.4, hh = h * (0.4 + rnd() * 0.7);
    b.aabb(x, 0, minZ, Math.min(x + w, maxX - 1), hh, minZ + d, mat);
  }
  // outcrops along xmin edge, skipping the base footprint
  for (let z = minZ + 2; z < maxZ - 2; z += 6 + rnd() * 6) {
    const d = 3 + rnd() * 4;
    if (z + d > skipZ[0] && z < skipZ[1]) continue;
    const w = 1 + rnd() * 1.5, hh = h * (0.4 + rnd() * 0.7);
    b.aabb(minX, 0, z, minX + w, hh, z + d, mat);
  }
}

// Ground slab (top at y) with rectangular holes [x0,z0,x1,z1]. Call OUTSIDE sym() with all holes listed.
export function slabWithHoles(b, x0, z0, x1, z1, y, thick, mat, holes) {
  const xs = [x0, x1];
  for (const h of holes) xs.push(Math.max(x0, Math.min(x1, h[0])), Math.max(x0, Math.min(x1, h[2])));
  const ux = [...new Set(xs)].sort((a, c) => a - c);
  for (let i = 0; i < ux.length - 1; i++) {
    const a = ux[i], c = ux[i + 1];
    if (c - a < 0.01) continue;
    const mid = (a + c) / 2;
    const hs = holes.filter((h) => mid > h[0] && mid < h[2]).map((h) => [h[1], h[3]]).sort((p, q) => p[0] - q[0]);
    let cz = z0;
    for (const [hz0, hz1] of hs) {
      if (hz0 > cz) b.aabb(a, y - thick, cz, c, y, hz0, mat);
      cz = Math.max(cz, hz1);
    }
    if (cz < z1) b.aabb(a, y - thick, cz, c, y, z1, mat);
  }
}

/**
 * Underground tunnel along X at depth (floor at y = -depth). Author inside sym().
 * entries: [{ x, dir: '+x' | '-x' }] stairwells (3 wide, 5.5 long) rising to the surface in direction dir.
 * Returns the hole rectangles that must be cut from the ground slab (for both symmetric copies).
 */
export function tunnelX(b, xa, xb, z, depth, mats, entries) {
  const w = 4, ceil = -1;
  const fy = -depth;
  b.aabb(xa, fy - 0.5, z - w / 2 - 0.5, xb, fy, z + w / 2 + 0.5, mats.floor);
  b.aabb(xa, fy, z - w / 2 - 0.5, xb, ceil, z - w / 2, mats.wall);
  b.aabb(xa, fy, z + w / 2, xb, ceil, z + w / 2 + 0.5, mats.wall);
  b.aabb(xa - 0.5, fy, z - w / 2, xa, ceil, z + w / 2, mats.wall);
  b.aabb(xb, fy, z - w / 2, xb + 0.5, ceil, z + w / 2, mats.wall);
  const holes = [];
  const run = Math.ceil(depth / 0.42) * 0.5;
  for (const e of entries) {
    // stairs ascend from tunnel floor toward the surface
    if (e.dir === '-x') {
      b.stairs(e.x, fy, z, '-x', 3, depth, mats.stair);
      holes.push([e.x - run - 0.6, z - 1.5, e.x + 0.2, z + 1.5]);
      b.aabb(e.x - 0.2, 0, z - 1.7, e.x + 0.2, 1, z + 1.7, mats.rim);
    } else {
      b.stairs(e.x, fy, z, '+x', 3, depth, mats.stair);
      holes.push([e.x - 0.2, z - 1.5, e.x + run + 0.6, z + 1.5]);
      b.aabb(e.x - 0.2, 0, z - 1.7, e.x + 0.2, 1, z + 1.7, mats.rim);
    }
    b.light(e.x, fy + 2.6, z, mats.light || 0x9fd8ff, 0.8, 9);
  }
  for (let x = xa + 4; x < xb; x += 10) b.light(x, fy + 2.7, z, mats.light || 0x9fd8ff, 0.6, 8);
  b.soundZone(xa, fy, z - w / 2, xb, ceil, z + w / 2, 'interior');
  // mirror holes too (sym copy)
  return [...holes, ...holes.map((h) => [-h[2], -h[3], -h[0], -h[1]])];
}
