// MAP 04 — SANDSTONE FORTRESS: two fortified keeps facing each other across an open courtyard.
// Built for Capture the Flag: multi-entrance flag rooms, defensive towers, shaded colonnades along the
// flanks, a raised market plaza in the middle and an underground shortcut beneath the courtyard.
import { MapBuilder } from './builder.js';
import { standardBase, slabWithHoles, tunnelX } from './kit.js';

export function buildSandstoneFortress() {
  const b = new MapBuilder({
    id: 'sandstone_fortress',
    name: 'Sandstone Fortress',
    theme: 'Desert fortress',
    description: 'Twin keeps of baked sandstone. Storm the towers, slip through the colonnades or take the tunnel under the market square.',
    bounds: { minX: -64, maxX: 64, minZ: -40, maxZ: 40 },
    killY: -20,
    modes: ['ctf', 'tdm'],
    env: {
      sky: [0x5aa0e0, 0xf6d9a0], fog: { color: 0xf0d4a0, near: 60, far: 210 },
      sun: { dir: [0.55, 0.8, 0.25], color: 0xffe8c0, intensity: 1.45 },
      ambient: { sky: 0xb8d4f0, ground: 0xc09060, intensity: 0.75 },
      weather: 'dust', ambience: 'fortress',
    },
    preview: ['#d2a86b', '#c8402f', '#5aa0e0'],
  });

  let holes = [];
  b.sym((s) => {
    // outer fortification walls
    s.aabb(-64, 0, -42, 64, 12, -40, 'sandbrick');
    s.aabb(-66, 0, -40, -64, 12, 40, 'sandbrick');
    for (let x = -62; x < 62; x += 3) s.box(x, 12, -41, 1.4, 1, 2, 'sandbrick');

    // ---------------- KEEP ----------------
    standardBase(s, {
      X0: -62, X1: -44, hw: 16, H: 10,
      wall: 'sandstone', inner: 'sandbrick', floor: 'sandtile', upper: 'plank', roof: 'sandstone', trim: 'team', stair: 'plank', label: 'KEEP',
    });
    // keep battlements
    for (let z = -15.5; z <= 15.5; z += 2.2) s.box(-44.3, 10.5, z, 0.8, 0.9, 1.1, 'sandstone');
    // defensive towers at both front corners, reached from the upper balconies
    for (const sg of [-1, 1]) {
      const zc = sg * 13;
      s.box(-36.25, 0, zc, 4.5, 6, 5, 'sandstone');
      for (const [dx, dz] of [[-1.8, -2.1], [1.8, -2.1], [-1.8, 2.1], [1.8, 2.1], [0, -2.1], [0, 2.1], [1.8, 0]]) s.box(-36.25 + dx, 6, zc + dz, 0.8, 0.9, 0.8, 'sandstone');
      s.aabb(-40.5, 0, zc - 1.5, -38.5, 4.5, zc + 1.5, 'sandstone');
      s.stairs(-40.5, 4.5, zc, '+x', 3, 1.5, 'plank');
      s.prop('torch', -36.25, 6, zc + sg * 1.9, {});
      s.prop('banner', -33.9, 5.6, zc, { team: 0, rot: -Math.PI / 2 });
      s.pickup('ammo', 'small', -36.25, 6.05, zc);
    }
    s.light(-36, 7.2, 13, 0xffa040, 0.8, 10);
    s.light(-36, 7.2, -13, 0xffa040, 0.8, 10);

    // ---------------- COURTYARD ----------------
    s.floor(-34, -19, 0, 26, 0.03, 'sandtile', 0.1);
    // low cover walls
    s.box(-28, 0, -8, 1, 1.2, 5, 'sandbrick');
    s.box(-24, 0, 9, 4, 1.2, 1, 'sandbrick');
    s.box(-18, 0, -17, 5, 1.2, 1, 'sandbrick');
    s.box(-14, 0, 2, 1, 1.2, 3.5, 'sandbrick');
    // market stalls
    s.prop('awning', -20, 0, -4, { color: 0xc8402f, rot: Math.PI / 2 });
    s.crate(-20.6, 0, -4.6, 1.1); s.crate(-19.6, 0, -3.5, 0.9);
    s.prop('awning', -12, 0, 18, { color: 0x3a72c4 });
    s.box(-12, 0, 18.5, 2.6, 1, 1, 'plank');
    s.prop('cart', -26, 0, 18, { rot: 0.3, col: [2.2, 1.6, 1.4] });
    s.prop('urn', -22, 0, -12, { col: [0.8, 1.0, 0.8] });
    s.prop('urn', -21.2, 0, -12.6, { col: [0.8, 1.0, 0.8] });
    for (const [x, z, sc] of [[-30, 2, 1], [-16, -22, 1.1], [-8, 22, 0.9], [-31, -20, 1]]) s.prop('palm', x, 0, z, { scale: sc, col: [0.5, 5, 0.5] });
    s.pickup('health', 'medium', -24, 0.05, 0);
    s.pickup('ammo', 'medium', -16, 0.05, 12);

    // ---------------- COLONNADES along the flanks ----------------
    const CZ0 = -38.5, CZ1 = -30;
    s.wallX(-34, 34, CZ1, 0, 4.5, 0.6, 'sandstone', [
      { at: -26, w: 3.6, h: 3.2 }, { at: -16, w: 3.6, h: 3.2 }, { at: -6, w: 3.6, h: 3.2 }, { at: 4, w: 3.6, h: 3.2 }, { at: 14, w: 3.6, h: 3.2 }, { at: 24, w: 3.6, h: 3.2 },
    ]);
    s.aabb(-34, 4.5, CZ0 - 1.5, 34, 5, CZ1 + 0.3, 'sandstone');
    for (let x = -34; x <= 34; x += 6.8) s.box(x, 0, -34.6, 0.8, 4.5, 0.8, 'sandbrick');
    s.stairs(-40, 0, -33.5, '+x', 3, 5, 'sandstone');
    s.wallX(-34, 34, CZ1 + 0.3, 5, 1, 0.3, 'sandbrick', [{ at: -20, w: 2, h: 1 }, { at: 0, w: 2, h: 1 }, { at: 20, w: 2, h: 1 }]);
    for (const x of [-26, -6, 14]) s.prop('torch', x, 0, -31, {});
    s.light(-16, 3.5, -34, 0xffa040, 0.6, 10);
    s.soundZone(-34, 0, CZ0, 34, 4.5, CZ1, 'interior');
    s.pickup('health', 'small', -16, 0.05, -35);
    s.pickup('health', 'small', 0, 5.05, -34);

    // ---------------- TUNNEL beneath the courtyard ----------------
    holes = tunnelX(s, -30, 30, -22, 4, { floor: 'sandtile', wall: 'sandbrick', stair: 'sandstone', rim: 'sandbrick', light: 0xffa040 }, [
      { x: -25.5, dir: '-x' }, { x: 25.5, dir: '+x' },
    ]);
    s.pickup('ammo', 'medium', 0, -3.95, -22);
  });

  // central raised plaza with the well
  b.aabb(-6, 0, -6, 6, 1.2, 6, 'sandtile');
  b.stairs(-8.5, 0, 0, '+x', 4, 1.2, 'sandstone');
  b.stairs(8.5, 0, 0, '-x', 4, 1.2, 'sandstone');
  b.stairs(0, 0, -8.5, '+z', 4, 1.2, 'sandstone');
  b.stairs(0, 0, 8.5, '-z', 4, 1.2, 'sandstone');
  b.prop('well', 0, 1.2, 0, { col: [2.6, 3, 2.6] });
  b.pickup('health', 'large', 4.5, 1.25, 4.5);
  b.pickup('health', 'large', -4.5, 1.25, -4.5);
  slabWithHoles(b, -64, -40, 64, 40, 0, 1, 'sand', holes);
  return b.build();
}
