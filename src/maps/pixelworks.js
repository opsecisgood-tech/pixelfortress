// MAP 03 — PIXELWORKS: automated manufacturing plant.
// Central production hall with moving conveyor belts and an elevated control room, upper catwalks and
// gantry bridges for long sightlines, cramped service corridors below for close-range flanks.
import { MapBuilder } from './builder.js';
import { standardBase } from './kit.js';

export function buildPixelworks() {
  const b = new MapBuilder({
    id: 'pixelworks',
    name: 'Pixelworks',
    theme: 'Automated manufacturing plant',
    description: 'A factory that never stops. Ride the conveyors, seize the glass control room, run the gantries or brawl through the service corridors.',
    bounds: { minX: -56, maxX: 56, minZ: -36, maxZ: 36 },
    killY: -15,
    modes: ['tdm', 'ctf'],
    env: {
      sky: [0x6f8796, 0xb8b0a0], fog: { color: 0x9a968a, near: 40, far: 140 },
      sun: { dir: [-0.3, 0.9, 0.3], color: 0xfff2dc, intensity: 0.9 },
      ambient: { sky: 0xd8d4c8, ground: 0x6a6458, intensity: 0.85 },
      weather: 'dust', ambience: 'factory', clouds: false,
    },
    preview: ['#8a8f7a', '#e2b12a', '#6c6e70'],
  });

  b.floor(-56, -36, 56, 36, 0, 'factoryfloor', 1);

  b.sym((s) => {
    // perimeter walls of the plant
    s.aabb(-56, 0, -38, 56, 14, -36, 'factorywall');
    s.aabb(-58, 0, -36, -56, 14, 36, 'factorywall');
    s.prop('fan', -55.7, 7, -20, { rot: -Math.PI / 2 });
    s.prop('fan', -30, 8, -35.7, { rot: 0 });
    s.prop('warningLight', -24.3, 6, -4, {});

    // ---------------- TEAM BASE ----------------
    standardBase(s, {
      X0: -54, X1: -36, hw: 15, H: 10,
      wall: 'brick', inner: 'factorywall', floor: 'factoryfloor', upper: 'grate', roof: 'darkmetal', trim: 'team', stair: 'metalstair', label: 'WORKS',
    });

    // ---------------- LOADING YARD (between base and hall) ----------------
    s.prop('silo', -30, 0, -14, { r: 2, h: 8, col: [4, 9, 4] });
    s.prop('cablereel', -27, 0, 6, { col: [1.8, 1.1, 1.8] });
    s.prop('forklift', -31, 0, 3, { rot: 1.2, col: [1.4, 1.8, 2.4] });
    s.crate(-28, 0, -4, 1.3); s.crate(-28, 1.3, -4, 1.0); s.crate(-26.6, 0, -4.2, 1.1);
    s.box(-32, 0, 12, 1, 1.2, 4, 'hazard');
    s.prop('pipe', -30, 0, 22, { len: 8 });
    s.prop('barrel', -33, 0, -24, { col: [0.9, 1.2, 0.9] });
    s.prop('barrel', -32, 0, -25, { col: [0.9, 1.2, 0.9] });
    s.pickup('ammo', 'medium', -29, 0.05, 9);
    s.pickup('health', 'small', -33, 0.05, -10);
    // gantry bridges from the base balconies to the hall's upper doors
    for (const z of [10.25, -10.25]) {
      s.aabb(-32.5, 4.1, z - 1.25, -24, 4.5, z + 1.25, 'grate');
      s.aabb(-32.5, 4.5, z - 1.35, -24, 5.5, z - 1.25, 'railing', { shot: false, trans: true });
      s.aabb(-32.5, 4.5, z + 1.25, -24, 5.5, z + 1.35, 'railing', { shot: false, trans: true });
      s.box(-28.5, 0, z, 0.5, 4.1, 0.5, 'crane');
    }
    // the base balconies are at z 10..14.5; extend them to meet the bridges
    s.aabb(-36, 4.1, -14.5, -32.5, 4.5, -9, 'grate');
    s.aabb(-36, 4.1, 9, -32.5, 4.5, 14.5, 'grate');

    // ---------------- PRODUCTION HALL ----------------
    const H = 12, U = 4.5;
    s.wallZ(-18, 18, -24, 0, H, 0.5, 'factorywall', [
      { at: 0, w: 5, h: 4.5 },
      { at: -10.25, y: U, w: 2.5, h: 2.6 },
      { at: 10.25, y: U, w: 2.5, h: 2.6 },
    ]);
    s.wallX(-23.75, 23.75, -17.75, 0, H, 0.5, 'factorywall', [
      { at: -14, w: 3, h: 3.4 },
      { at: 6, w: 3, h: 3.4 },
      { at: -4, y: 6.5, w: 6, h: 2 },
    ]);
    s.aabb(-24, H, -18, -4, H + 0.5, 18, 'darkmetal');
    s.aabb(-4, H, -18, 0, H + 0.5, -8, 'darkmetal');
    // catwalks: along the end wall and the long wall
    s.aabb(-23.75, U - 0.4, -17.5, -21, U, 17.5, 'grate');
    s.aabb(-21, U - 0.4, -17.5, 23.75, U, -15, 'grate');
    s.aabb(-21, U, -15.1, -19.2, U + 1.1, -15, 'railing', { shot: false, trans: true });
    s.aabb(-16.8, U, -15.1, -1.2, U + 1.1, -15, 'railing', { shot: false, trans: true });
    s.aabb(1.2, U, -15.1, 21, U + 1.1, -15, 'railing', { shot: false, trans: true });
    s.aabb(-21.1, U, -15, -21, U + 1.1, 15, 'railing', { shot: false, trans: true });
    s.stairs(-18, 0, -9, '-z', 2, U, 'metalstair');
    // conveyor belts carry players along their length
    s.aabb(-8.2, 0, -16, -5.8, 1.0, 16, 'conveyor', { conv: [0, 2.6] });
    s.aabb(-8.4, 1.0, -16, -8.2, 1.4, 16, 'hazard', { col: false, shot: false });
    s.crate(-7, 1.0, -9, 1.0, 'crate');
    s.crate(-7, 1.0, 5, 1.0, 'crate');
    s.prop('robotArm', -10.2, 0, 6, { col: [1.2, 1.4, 1.2] });
    s.prop('robotArm', -4, 0, -12, { col: [1.2, 1.4, 1.2] });
    s.prop('press', -13, 0, -9, { rot: Math.PI / 2, col: [1.0, 4.6, 2.6] });
    s.box(-15, 0, 9, 4, 2.2, 1.6, 'steel');
    s.box(-19.5, 0, 2, 1.6, 1.4, 3, 'metal');
    s.prop('gear', -23.7, 8.5, 6, { rot: Math.PI / 2, r: 2.2, speed: 0.5 });
    // elevated glass control room on pillars, bridged to the catwalks
    s.box(-3.6, 0, -3.6, 0.6, U - 0.4, 0.6, 'steel');
    s.box(-3.6, 0, 3.6, 0.6, U - 0.4, 0.6, 'steel');
    s.aabb(-4, U - 0.4, -4, 0, U, 4, 'metalfloor');
    s.aabb(-4, U, -4, -3.8, U + 1, 4, 'darkmetal');
    s.aabb(-4, U + 1, -4, -3.8, U + 2.6, 4, 'glass', { trans: true });
    s.aabb(-4, U + 2.6, -4, 0, U + 3, 4, 'darkmetal');
    s.aabb(-1.2, U - 0.4, -15, 1.2, U, -4, 'grate');
    s.stairs(-2.9, 0, 9.5, '-z', 1.8, U, 'metalstair');
    s.prop('console', -2, U, -3, { rot: Math.PI, col: [1.4, 1.2, 0.8] });
    s.light(-2, U + 2.4, 0, 0x7fd8ff, 0.9, 10);
    s.light(-12, 9, -8, 0xffe8c0, 1.0, 20);
    s.prop('hangingLamp', -12, H, -8, {});
    s.prop('hangingLamp', -12, H, 8, {});
    s.soundZone(-24, 0, -18, 24, H, 18, 'interior');
    s.pickup('health', 'medium', -22.4, U + 0.05, 0);
    s.pickup('ammo', 'small', -15, 0.05, 11);

    // ---------------- SERVICE CORRIDORS (close quarters) ----------------
    const CY = 4;
    s.wallX(-24, 24, -30, 0, CY, 0.5, 'brick', [{ at: -18, w: 2.4, h: 3 }, { at: 16, w: 2.4, h: 3 }]);
    s.wallZ(-30, -18, -24, 0, CY, 0.5, 'brick', [{ at: -24, w: 2.6, h: 3.2 }]);
    s.wallZ(-30, -18, 24, 0, CY, 0.5, 'brick', [{ at: -21, w: 2.6, h: 3.2 }]);
    s.wallZ(-30, -18, -9, 0, CY, 0.4, 'factorywall', [{ at: -27, w: 2.2, h: 3 }]);
    s.wallZ(-30, -18, 11, 0, CY, 0.4, 'factorywall', [{ at: -21, w: 2.2, h: 3 }]);
    s.aabb(-24, CY, -30, 24, CY + 0.4, -18, 'darkmetal');
    s.prop('pipe', -16, 2.6, -29, { len: 12 });
    s.prop('pipe', 4, 2.6, -19, { len: 10 });
    s.box(-15, 0, -23, 3, 1.2, 1, 'shelf');
    s.crate(-20, 0, -27.5, 1.2); s.crate(-4, 0, -21, 1.2); s.crate(-3, 0, -27, 1.4); s.crate(5, 0, -24.5, 1.1);
    s.box(17, 0, -26, 1.4, 2, 3.5, 'shelf');
    s.light(-16, 3.4, -24, 0xffc070, 0.7, 9);
    s.light(2, 3.4, -24, 0xffc070, 0.7, 9);
    s.soundZone(-24, 0, -30, 24, CY, -18, 'interior');
    s.pickup('ammo', 'medium', -6, 0.05, -24);
    s.pickup('health', 'small', 18, 0.05, -22);
    // narrow outdoor alley along the perimeter
    s.prop('pipe', -10, 0, -34, { len: 14 });
    s.box(4, 0, -33.5, 2, 1.1, 1.4, 'metal');
    s.prop('barrel', -22, 0, -33.5, { col: [0.9, 1.2, 0.9] });
  });

  b.pickup('health', 'large', 0, 4.55, 0);
  b.aabb(-4, 12, -8, 4, 12.1, 8, 'glass', { trans: true });
  return b.build();
}
