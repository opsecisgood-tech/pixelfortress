// MAP 01 — DUSTY DEPOT: desert cargo & rail transfer facility.
// Central warehouse with catwalks, container yards with gantry cranes, raised loading docks and shacks.
import { MapBuilder } from './builder.js';
import { standardBase, cliffBorder } from './kit.js';

export function buildDustyDepot() {
  const b = new MapBuilder({
    id: 'dusty_depot',
    name: 'Dusty Depot',
    theme: 'Desert cargo & industrial transport facility',
    description: 'A sun-baked rail depot. Fight over the central warehouse catwalks, flank through the container yards or hold the loading docks.',
    bounds: { minX: -62, maxX: 62, minZ: -40, maxZ: 40 },
    killY: -15,
    modes: ['tdm', 'ctf'],
    env: {
      sky: [0x7fb7e6, 0xf3d9a4], fog: { color: 0xe8cf9c, near: 60, far: 190 },
      sun: { dir: [-0.5, 0.85, 0.35], color: 0xfff0d0, intensity: 1.35 },
      ambient: { sky: 0xbfd8f0, ground: 0xb08a5a, intensity: 0.75 },
      weather: 'dust', ambience: 'desert', grade: 'warm',
    },
    preview: ['#e3b46b', '#9b6a3c', '#7fb7e6'],
  });

  // Ground: sand everywhere, roads crossing it.
  b.floor(-62, -40, 62, 40, 0, 'sand', 1);
  b.floor(-40, -3, 40, 3, 0.03, 'road', 0.1);
  b.floor(-62, 25, 62, 28.5, 0.03, 'road', 0.1);

  b.sym((s) => {
    cliffBorder(s, -62, 62, -40, 40, 'rock', 13, 7, [-17, 17]);

    // ---------------- TEAM HQ ----------------
    standardBase(s, {
      X0: -60, X1: -41, hw: 16, H: 10,
      wall: 'concrete', inner: 'plaster', floor: 'woodfloor', upper: 'diamondplate', roof: 'roof', trim: 'team',
      stair: 'metalstair', label: 'DEPOT',
    });
    // sandbag walls and barriers in front of HQ
    s.box(-36.5, 0, -8, 1, 1.1, 4, 'sandbag');
    s.box(-37, 0, 7.5, 1, 1.1, 3, 'sandbag');
    s.box(-38.5, 0, 0, 0.8, 1.0, 2.2, 'concrete');
    s.prop('lamp', -39.5, 0, -4.5, { color: 0xffd9a0 });
    s.light(-39.5, 4, -4.5, 0xffd9a0, 0.6, 10);

    // ---------------- CENTRAL WAREHOUSE ----------------
    const H = 9;
    // end wall (toward RED) with big cargo door & catwalk windows
    s.wallZ(-11, 11, -15, 0, H, 0.5, 'corrugated', [
      { at: 0, w: 5, h: 4.6 },
      { at: -7.5, y: 4.9, w: 3, h: 1.8 },
      { at: 7.5, y: 4.9, w: 3, h: 1.8 },
    ]);
    // long wall (zmin) with side door, catwalk exit and window
    s.wallX(-14.75, 14.75, -10.75, 0, H, 0.5, 'corrugated', [
      { at: -6, w: 3.2, h: 3.6 },
      { at: -12, y: 4.3, w: 1.8, h: 2.4 },
      { at: 5, y: 5, w: 3, h: 1.8 },
    ]);
    // roof halves with glass skylight strip in the centre
    s.aabb(-15, H, -11, -3, H + 0.5, 11, 'roof');
    s.floor(-15, -11, 0, 11, 0.06, 'pavers', 0.1);
    // catwalk along zmin wall
    s.aabb(-14.5, 4, -10.5, 14.5, 4.3, -8.3, 'grate');
    s.aabb(-14.5, 4.3, -8.4, -13.1, 5.3, -8.3, 'railing', { shot: false, trans: true });
    s.aabb(-10.9, 4.3, -8.4, 14.5, 5.3, -8.3, 'railing', { shot: false, trans: true });
    // stairs from floor up to catwalk
    s.stairs(-12, 0, -2.6, '-z', 1.8, 4.3, 'metalstair');
    // exterior landing & stairs from catwalk door
    s.aabb(-13.5, 4, -14.5, -10.5, 4.3, -11, 'grate');
    s.stairs(-19, 0, -13, '+x', 2.4, 4.3, 'metalstair');
    // interior cover: crate stacks and shelving
    s.crate(-9, 0, -4.5, 1.4);
    s.crate(-9, 1.4, -4.5, 1.0);
    s.crate(-7.4, 0, -4.8, 1.0);
    s.box(-5, 0, 6.5, 4.5, 2.2, 1.2, 'shelf');
    s.crate(-11.5, 0, 6, 1.2);
    s.crate(-3, 0, -7.2, 1.2);
    s.prop('forklift', -6.5, 0, 2.2, { rot: 0.4, col: [1.4, 1.8, 2.4] });
    s.prop('hangingLamp', -7.5, H - 0.2, 0, {});
    s.light(-7.5, 7, 0, 0xffe2b0, 1.1, 18);
    s.soundZone(-15, 0, -11, 15, H, 11, 'interior');
    s.pickup('health', 'medium', -12, 4.35, -9.4);
    s.pickup('ammo', 'small', -9, 0.05, 3);

    // ---------------- CONTAINER YARD ----------------
    s.container(-22, 0, -20, true, 'blue');
    s.container(-20, 2.6, -20, true, 'yellow');
    s.crate(-24, 2.6, -20, 1.3);
    s.container(-30, 0, -23, false, 'red');
    s.container(-24.5, 0, -6.5, false, 'green');
    s.container(-33.5, 0, 9, true, 'orange');
    s.container(-33.5, 0, 17, true, 'blue');
    s.container(-35.5, 2.6, 17, true, 'red');
    s.crate(-31.6, 2.6, 17, 1.3);
    s.container(-23, 0, 15, false, 'yellow');
    s.container(-27, 0, 31, true, 'green');
    s.container(-36.5, 0, -15, false, 'green');
    // crates as steps up onto the stacked containers
    s.crate(-25.5, 0, -17.8, 1.3);
    s.crate(-24.3, 0, -17.8, 1.3);
    s.crate(-25, 1.3, -17.8, 1.3);
    s.crate(-30, 0, 19.6, 1.2);
    s.crate(-30.3, 1.2, 19.4, 1.4);
    s.crate(-31.6, 0, 19.6, 1.2);
    // gantry crane: two legs + beam (beam is decorative, legs collide)
    s.box(-35, 0, -27, 1.2, 14, 1.2, 'crane');
    s.box(-35, 0, 22.5, 1.2, 14, 1.2, 'crane');
    s.aabb(-35.8, 13, -27.6, -34.2, 14.5, 23.1, 'crane', { col: false, shot: false });
    s.prop('craneCab', -35, 11.5, -6, {});
    s.prop('craneHook', -35, 6.5, 3, {});
    s.pickup('ammo', 'medium', -28, 0.05, -1);
    s.pickup('health', 'small', -20, 5.25, -20);
    s.pickup('health', 'medium', -35.5, 5.25, 17);

    // ---------------- LOADING DOCK (zmin edge) ----------------
    s.aabb(-40, 0, -37.5, -14, 1.6, -30.5, 'concrete');
    s.aabb(-40, 1.6, -30.6, -14, 1.75, -30.4, 'hazard', { col: false, shot: false });
    s.stairs(-12, 0, -34, '-x', 3, 1.6, 'concrete');
    s.stairs(-24, 0, -28.5, '-z', 3, 1.6, 'concrete');
    // dock roof canopy on posts
    for (const x of [-38, -30, -22]) s.box(x, 1.6, -37, 0.4, 4.2, 0.4, 'metal');
    s.aabb(-40, 5.8, -38, -20, 6.1, -33, 'roof');
    s.crate(-33, 1.6, -35.5, 1.4);
    s.crate(-27, 1.6, -36, 1.2);
    s.crate(-27, 2.8, -36, 1.0);
    s.prop('barrel', -36, 1.6, -36.5, { col: [0.9, 1.2, 0.9] });
    s.prop('barrel', -35, 1.6, -36.8, { col: [0.9, 1.2, 0.9] });
    s.prop('pallet', -18, 1.6, -35, {});
    s.pickup('health', 'large', -31, 1.65, -33);

    // ---------------- STORAGE SHACK (zmax edge) ----------------
    s.room({ x0: -22, z0: 31, x1: -14, z1: 37.5, y: 0, h: 3.4, t: 0.4, wall: 'woodplank', roof: 'roof',
      doors: { xmin: [{ at: 34, w: 2, h: 2.6 }], zmin: [{ at: -18, w: 2.2, h: 2.6 }] } });
    s.stairs(-13, 0, 31.2, '+z', 1.6, 3.9, 'woodplank');
    s.pickup('ammo', 'small', -18, 0.05, 35);

    // railway with flatcar between yard and warehouse
    s.floor(-62, -27.5, 62, -26.5, 0.12, 'rail', 0.12);
    s.box(-8, 0.12, -27, 10, 1.3, 2.6, 'flatcar');
    s.container(-6, 1.42, -27, true, 'red');

    // desert decoration
    s.prop('cactus', -46, 0, -30, { scale: 1.2 });
    s.prop('cactus', -52, 0, 26, {});
    s.prop('cactus', -10, 0, 33, { scale: 0.8 });
    s.prop('rockpile', -48, 0, 34, {});
    s.prop('tumbleweed', -26, 0, 3, {});
    s.prop('watertower', -54, 0, -32, { col: [3, 9, 3] });
    s.prop('sign', -40.5, 0, -22, { label: 'DOCK B', rot: Math.PI / 2 });
    s.prop('sign', -16, 0, 21, { label: 'YARD 7', rot: -Math.PI / 2 });
    s.prop('pipe', -16, 0, -19, { len: 6, rot: 0 });
    s.prop('streetlight', -15.5, 0, 24, { color: 0xffd28a });
    s.light(-15.5, 6, 24, 0xffd28a, 0.5, 12);
  });

  // Centre (symmetric, defined once): central container + skylight
  b.container(0, 0, 0, false, 'red');
  b.crate(-1.9, 0, 2.2, 1.3);
  b.crate(1.9, 0, -2.2, 1.3);
  b.aabb(-3, 9, -11, 3, 9.15, 11, 'glass', { trans: true });
  b.pickup('health', 'large', 0, 2.65, 0);

  return b.build();
}
