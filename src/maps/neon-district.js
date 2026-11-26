// MAP 05 — NEON DISTRICT: a dense pixel city at night.
// Main boulevard down the middle, shops and arcades with interiors, rooftops linked by a sky bridge
// for Scouts and Marksmen, back alleys for flanks and a subway passage under the boulevard.
import { MapBuilder } from './builder.js';
import { standardBase, slabWithHoles, tunnelX } from './kit.js';

export function buildNeonDistrict() {
  const b = new MapBuilder({
    id: 'neon_district',
    name: 'Neon District',
    theme: 'Futuristic city at night',
    description: 'Rain-slick streets under a thousand signs. Fight down the boulevard, across the rooftops and through the subway beneath it.',
    bounds: { minX: -58, maxX: 58, minZ: -38, maxZ: 38 },
    killY: -20,
    modes: ['tdm', 'ctf'],
    env: {
      sky: [0x0b0820, 0x2a1840], fog: { color: 0x1a1230, near: 25, far: 120 },
      sun: { dir: [-0.3, 0.8, 0.5], color: 0x8aa0ff, intensity: 0.55 },
      ambient: { sky: 0x5a4a9a, ground: 0x2a2030, intensity: 0.95 },
      weather: 'rain', ambience: 'city', night: true,
    },
    preview: ['#ff3fa8', '#3ff2ff', '#2a1840'],
  });

  let holes = [];
  b.sym((s) => {
    // skyline wall: tall buildings form the boundary
    s.aabb(-58, 0, -40, 58, 20, -38, 'window');
    s.aabb(-60, 0, -38, -58, 20, 38, 'window');
    for (let x = -50; x < 54; x += 14) s.box(x, 20, -39, 10, 4 + (Math.abs(x) % 5), 2, 'citywall');

    // ---------------- TEAM BLOCK (base) ----------------
    standardBase(s, {
      X0: -56, X1: -38, hw: 15, H: 10,
      wall: 'citybrick', inner: 'citywall', floor: 'checker', upper: 'metalfloor', roof: 'darkmetal', trim: 'team', stair: 'metalstair', label: 'HQ',
    });
    s.prop('neonSign', -37.7, 6.5, -9, { label: 'RED·HQ', fg: '#ff5a6a', rot: -Math.PI / 2, w: 3 });

    // ---------------- BOULEVARD ----------------
    s.floor(-38, -10, 38, -7, 0.2, 'sidewalk', 0.3);
    for (const x of [-30, -14, 2, 18]) { s.prop('streetlight', x, 0.2, -8.2, { color: 0xffb0e0 }); s.light(x, 5.5, -7, 0xff8ad8, 0.7, 13); }
    s.prop('car', -24, 0, -4.2, { rot: Math.PI / 2, color: 0x3ff2ff, col: [2, 1.6, 4.2] });
    s.prop('car', -8, 0, 4.4, { rot: -Math.PI / 2, color: 0xff3fa8, col: [2, 1.6, 4.2] });
    s.prop('hydrant', -18, 0.2, -8.6, { col: [0.5, 0.9, 0.5] });
    s.prop('trashbin', -11, 0.2, -9.2, { col: [1, 1.1, 0.8] });
    s.box(-31, 0, 3, 3, 1.1, 0.8, 'hazard');

    // ---------------- BLOCK A: corner store (south-west), roof bridge anchor ----------------
    const AH = 6;
    s.room({ x0: -33, z0: -30, x1: -15, z1: -11, y: 0, h: AH, t: 0.5, wall: 'citywall', floor: 'carpet', roof: 'darkmetal',
      doors: { zmax: [{ at: -28, w: 2.6, h: 3 }, { at: -19, w: 3.4, h: 3 }], xmax: [{ at: -20, w: 2.4, h: 3 }], xmin: [{ at: -24, w: 2.4, h: 3 }] } });
    s.box(-24, 0, -18, 6, 1.1, 1.2, 'shelf');
    s.box(-28, 0, -24, 1.2, 2.2, 5, 'shelf');
    s.box(-19, 0, -26, 3, 1.1, 1.6, 'steel');
    s.prop('console', -17, 0, -14, { rot: Math.PI, col: [1.4, 1.2, 0.8], color: 0xff3fa8 });
    s.light(-24, 5, -20, 0xff8ad8, 0.8, 12);
    s.soundZone(-33, 0, -30, -15, AH, -11, 'interior');
    s.prop('neonSign', -24, 4.4, -10.7, { label: 'PIXL MART', fg: '#3ff2ff', w: 4 });
    // fire-escape stairs up to the roof
    s.stairs(-13.8, 0, -35.5, '+z', 2, AH + 0.5, 'grate');
    s.aabb(-15, AH, -28, -12.8, AH + 0.5, -25.5, 'grate');
    s.prop('acunit', -30, AH + 0.5, -27, { col: [1.2, 0.9, 0.7] });
    s.prop('vent', -20, AH + 0.5, -24, { col: [1.4, 0.9, 1.4] });
    s.prop('billboard', -27, AH + 0.5, -29, { label: 'GLITCH', fg: '#ff3fa8', h: 2.5 });
    s.pickup('ammo', 'medium', -22, 0.05, -15);
    s.pickup('health', 'small', -18, AH + 0.55, -20);

    // ---------------- BLOCK B: arcade (north-west) ----------------
    const BH = 6;
    s.room({ x0: -31, z0: 11, x1: -17, z1: 29, y: 0, h: BH, t: 0.5, wall: 'citybrick', floor: 'tile', roof: 'darkmetal',
      doors: { zmin: [{ at: -26, w: 3, h: 3 }], xmax: [{ at: 22, w: 2.4, h: 3 }], zmax: [{ at: -20, w: 2.4, h: 3 }] } });
    for (let i = 0; i < 4; i++) s.box(-29.5 + i * 2.6, 0, 26.5, 1.4, 2, 1, i % 2 ? 'neon_pink' : 'neon_cyan', { emissive: true });
    s.box(-22, 0, 17, 1.2, 1.1, 6, 'steel');
    s.prop('holo', -27, 0, 18, { color: 0xff3fa8, col: [1.2, 0.3, 1.2] });
    s.light(-24, 5, 20, 0x3ff2ff, 0.9, 12);
    s.soundZone(-31, 0, 11, -17, BH, 29, 'interior');
    s.prop('neonSign', -24, 4.4, 10.7, { label: 'ARCADE', fg: '#ff3fa8', w: 4, rot: Math.PI });
    s.pickup('health', 'medium', -20, 0.05, 25);

    // ---------------- SKY BRIDGE over the boulevard ----------------
    s.aabb(-25.5, AH, -11, -22.5, AH + 0.5, 11, 'grate');
    s.aabb(-25.6, AH + 0.5, -11, -25.5, AH + 1.5, 11, 'railing', { shot: false, trans: true });
    s.aabb(-22.5, AH + 0.5, -11, -22.4, AH + 1.5, 11, 'railing', { shot: false, trans: true });
    s.box(-24, 0.2, -8.5, 0.6, AH - 0.2, 0.6, 'steel');
    s.prop('neonSign', -24, AH - 0.6, 0, { label: 'SKYWAY', fg: '#ffe03f', w: 3, rot: Math.PI / 2 });

    // ---------------- BACK ALLEYS ----------------
    s.box(-10, 0, -34, 2.4, 1.4, 1.4, 'container_green');
    s.prop('trashbin', -36, 0, -34, { col: [1, 1.1, 0.8] });
    s.crate(-6, 0, -33, 1.2); s.crate(-30, 0, 33, 1.1);
    s.box(-12, 0, -22, 1, 3, 6, 'citybrick');
    s.box(-8, 0, 20, 4, 3, 1, 'citybrick');
    s.prop('neonSign', -12.4, 2.2, -22, { label: 'NOODLES', fg: '#58ff6a', rot: -Math.PI / 2, w: 3 });
    s.light(-10, 3, -30, 0x58ff6a, 0.6, 10);
    s.pickup('ammo', 'small', -8, 0.05, -28);

    // ---------------- SUBWAY under the boulevard ----------------
    holes = tunnelX(s, -32, 32, 0, 4, { floor: 'tile', wall: 'citywall', stair: 'metalstair', rim: 'metal', light: 0xff8ad8 }, [
      { x: -27, dir: '-x' }, { x: 27, dir: '+x' }, { x: -4, dir: '-x' },
    ]);
    s.pickup('health', 'small', -15, -3.95, 0);
  });

  // central plaza
  b.prop('holo', 0, 0, 12, { color: 0x3ff2ff, col: [1.2, 0.3, 1.2] });
  b.prop('billboard', 0, 0, -20, { label: 'NEON', fg: '#3ff2ff', h: 4, col: [4, 1, 0.4] });
  b.pickup('health', 'large', 0, 0.05, -14);
  b.pickup('health', 'large', 0, 0.05, 14);
  slabWithHoles(b, -58, -38, 58, 38, 0, 1, 'asphalt', holes);
  return b.build();
}
