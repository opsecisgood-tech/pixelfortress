// MAP 06 — OVERGROWN OUTPOST: abandoned military research facility reclaimed by the jungle.
// Ruined central lab with breached walls and a broken upper walkway, a stream channel with bridges,
// hidden bunker routes behind the foliage, and an old watchtower overlooking the ruins.
import { MapBuilder } from './builder.js';
import { standardBase, cliffBorder, slabWithHoles } from './kit.js';

export function buildOvergrownOutpost() {
  const b = new MapBuilder({
    id: 'overgrown_outpost',
    name: 'Overgrown Outpost',
    theme: 'Abandoned facility reclaimed by nature',
    description: 'Moss, vines and broken concrete. Leap the gap in the ruined walkway, wade the stream or creep through the buried bunkers.',
    bounds: { minX: -60, maxX: 60, minZ: -40, maxZ: 40 },
    killY: -15,
    modes: ['tdm', 'ctf'],
    env: {
      sky: [0x88b8d8, 0xd8e8c8], fog: { color: 0xb8d0b0, near: 35, far: 150 },
      sun: { dir: [-0.45, 0.75, -0.4], color: 0xfff4d8, intensity: 1.2 },
      ambient: { sky: 0xc8e0d0, ground: 0x4a6a3a, intensity: 0.85 },
      weather: 'fireflies', ambience: 'jungle',
    },
    preview: ['#5c8f3a', '#9a9a8c', '#2f7f86'],
  });

  const holes = [];
  b.sym((s) => {
    cliffBorder(s, -60, 60, -40, 40, 'rockgrey', 14, 23, [-17, 17]);
    standardBase(s, {
      X0: -58, X1: -40, hw: 16, H: 10,
      wall: 'mossconcrete', inner: 'woodwall', floor: 'stonefloor', upper: 'rustmetal', roof: 'moss', trim: 'team', stair: 'rustmetal', label: 'OUTPOST',
    });
    s.box(-36, 0, -7, 1, 1.1, 4, 'sandbag');
    s.box(-36.5, 0, 6, 1, 1.1, 3, 'sandbag');
    s.prop('vine', -40.2, 9, -5, { rot: -Math.PI / 2, len: 4 });
    s.prop('vine', -40.2, 9, 12, { rot: -Math.PI / 2, len: 3 });

    // ---------------- STREAM CHANNEL with bridges ----------------
    s.aabb(-27, -1.6, -40, -21, -1.1, 40, 'dirt');
    s.aabb(-27, -1.1, -40, -21, -0.35, 40, 'water', { col: false, shot: false, trans: true });
    for (const z of [-24, 0, 22]) {
      s.aabb(-27.5, -0.2, z - 1.5, -20.5, 0.15, z + 1.5, 'plank');
      s.aabb(-27.5, 0.15, z - 1.6, -20.5, 1.0, z - 1.5, 'railing', { shot: false, trans: true });
      s.aabb(-27.5, 0.15, z + 1.5, -20.5, 1.0, z + 1.6, 'railing', { shot: false, trans: true });
    }
    s.stairs(-26.5, -1.1, 12, '-x', 3, 1.1, 'mossconcrete');
    s.stairs(-21.5, -1.1, -12, '+x', 3, 1.1, 'mossconcrete');
    for (const [x, z] of [[-24, -33], [-23, -16], [-25, 30], [-24, 8]]) s.prop('lilypad', x, -0.34, z, {});
    holes.push([-27, -40, -21, 40], [21, -40, 27, 40]);
    s.pickup('health', 'medium', -24, -1.05, -6);

    // ---------------- RUINED LAB (centre) ----------------
    const H = 8, U = 4.5;
    s.wallZ(-12, 12, -16, 0, H, 0.6, 'mossconcrete', [
      { at: 0, w: 4, h: 3.6 }, { at: -7.5, w: 2.4, h: 6.8 }, { at: 8, y: U + 0.6, w: 3, h: 1.6 },
    ]);
    s.wallX(-15.7, 15.7, -11.7, 0, H, 0.6, 'mossconcrete', [
      { at: -11, w: 3, h: 3.4 }, { at: -2, w: 5, h: 8 }, { at: 9, w: 2.6, h: 3.2 }, { at: 4, y: U + 0.7, w: 2.4, h: 1.5 },
    ]);
    // partial roof with collapse holes
    s.aabb(-16, H, -12, -9, H + 0.5, 12, 'moss');
    s.aabb(-9, H, 4, -3, H + 0.5, 12, 'moss');
    // broken upper walkway along the long wall (gap in the middle: jump it or go around)
    s.aabb(-15.4, U - 0.4, -11.4, -2, U, -8.6, 'rustmetal');
    s.aabb(-15.4, U - 0.4, -8.6, -12.6, U, 8.6, 'rustmetal');
    s.aabb(2, U - 0.4, -11.4, 15.4, U, -8.6, 'rustmetal');
    s.aabb(2, U, -8.7, 12.6, U + 1, -8.6, 'railing', { shot: false, trans: true });
    s.stairs(-7, 0, 4, '-x', 2, U, 'mossconcrete');
    s.aabb(-12.6, U, -8.7, -2, U + 1, -8.6, 'railing', { shot: false, trans: true });
    // debris piles and broken machines
    s.box(-6, 0, -4, 3, 1.0, 2.5, 'mossconcrete');
    s.box(-5.5, 1.0, -4.3, 1.5, 0.8, 1.5, 'rustmetal');
    s.prop('brokenmachine', -8, 0, 9, { rot: 0.3, col: [2.4, 2, 1.6] });
    s.prop('vine', -10, H, -6, { len: 4 });
    s.prop('vine', -4, H, 8, { len: 3 });
    s.prop('fern', -13, 0, -2, {});
    s.prop('mushroom', -3, 0, 10, { scale: 1.4 });
    s.crate(-11, 0, -9.5, 1.2, 'crate');
    s.light(-8, 6, 0, 0xd8ffb0, 0.6, 14);
    s.soundZone(-16, 0, -12, 16, H, 12, 'interior');
    s.pickup('ammo', 'medium', -14, U + 0.05, 6);
    s.pickup('health', 'small', -7, 1.05, -3.5);

    // ---------------- WATCHTOWER ----------------
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) s.box(-10 + dx, 0, -28 + dz, 0.4, 5, 0.4, 'bark');
    s.aabb(-12, 5, -30, -8, 5.4, -26, 'plank');
    s.aabb(-12, 5.4, -30.1, -8, 6.4, -30, 'railing', { shot: false, trans: true });
    s.aabb(-12.1, 5.4, -30, -12, 6.4, -26, 'railing', { shot: false, trans: true });
    s.stairs(-6.6, 0, -18.5, '-z', 1.4, 5.4, 'plank');
    s.aabb(-8, 5, -27, -5.9, 5.4, -24.5, 'plank');
    s.pickup('health', 'small', -10, 5.45, -28);

    // ---------------- BURIED BUNKER (hidden flank) ----------------
    s.room({ x0: -18, z0: 26, x1: -4, z1: 34, y: 0, h: 3.2, t: 0.5, wall: 'mossconcrete', floor: 'concrete', roof: 'moss',
      doors: { xmin: [{ at: 30, w: 2.2, h: 2.6 }], xmax: [{ at: 30, w: 2.2, h: 2.6 }], zmin: [{ at: -11, w: 2.2, h: 2.6 }] } });
    s.box(-11, 3.7, 30, 14, 1, 8, 'grass');
    s.prop('brokenmachine', -15, 0, 32, { col: [2.4, 2, 1.6] });
    s.light(-11, 2.6, 30, 0xffd890, 0.6, 9);
    s.soundZone(-18, 0, 26, -4, 3.2, 34, 'interior');
    s.pickup('ammo', 'medium', -8, 0.05, 31);

    // ---------------- JUNGLE ----------------
    for (const [x, z, sc] of [[-34, -30, 1.2], [-48, 30, 1.1], [-30, 18, 0.9], [-16, -34, 1.3], [-52, -32, 1], [-6, 22, 0.8], [-36, -16, 0.9], [-18, 18, 1]]) s.prop('tree', x, 0, z, { scale: sc, col: [0.7 * sc, 3.2 * sc, 0.7 * sc] });
    for (const [x, z, sc] of [[-30, 26, 1.4], [-33, 8, 1.2], [-14, 22, 1.5], [-2, 24, 1.2], [-20, -20, 1.2], [-38, 24, 1], [-31, -8, 1]]) s.prop('bush', x, 0, z, { scale: sc });
    for (const [x, z] of [[-29, -19], [-17, 14], [-35, 1]]) s.prop('fern', x, 0, z, {});
    s.prop('log', -32, 0, -24, { len: 4, col: [4, 0.8, 0.8] });
    s.prop('stump', -19, 0, 10, { col: [1, 0.6, 1] });
    s.prop('mushroom', -33, 0, -25, { color: 0xe8b830 });
    s.box(-34, 0, 14, 2.4, 1.6, 2.4, 'rustmetal');
    s.box(-17, 0, -26, 4, 1.4, 1, 'mossconcrete');
    s.pickup('health', 'medium', -33, 0.05, 20);
    s.pickup('ammo', 'small', -18, 0.05, -14);
  });

  b.pickup('health', 'large', 0, 0.05, 0);
  slabWithHoles(b, -60, -40, 60, 40, 0, 1, 'grass', holes);
  return b.build();
}
