// MAP 02 — FROSTFALL: snow-bound research installation built into a mountain pass.
// Two-storey central laboratory with an atrium, underground service tunnels for flanking,
// open snowfields with rock outcrops for long-range positions.
import { MapBuilder } from './builder.js';
import { standardBase, cliffBorder, slabWithHoles, tunnelX } from './kit.js';

export function buildFrostfall() {
  const b = new MapBuilder({
    id: 'frostfall',
    name: 'Frostfall',
    theme: 'Frozen research installation',
    description: 'A research outpost buried in snow. Hold the two-level laboratory, sneak through the service tunnels, or snipe from the frozen ridges.',
    bounds: { minX: -60, maxX: 60, minZ: -42, maxZ: 42 },
    killY: -20,
    modes: ['tdm', 'ctf'],
    env: {
      sky: [0x8fb4d8, 0xe4eef6], fog: { color: 0xd8e6f0, near: 30, far: 150 },
      sun: { dir: [0.4, 0.6, -0.5], color: 0xe8f2ff, intensity: 1.1 },
      ambient: { sky: 0xd0e4ff, ground: 0x8899aa, intensity: 0.9 },
      weather: 'snow', ambience: 'snow', cloudColor: 0xf0f4f8,
    },
    preview: ['#e8f0f6', '#7b8796', '#3d8fd6'],
  });

  let holes = [];
  b.sym((s) => {
    cliffBorder(s, -60, 60, -42, 42, 'snowrock', 16, 11, [-17, 17]);
    standardBase(s, {
      X0: -58, X1: -40, hw: 16, H: 10,
      wall: 'insulated', inner: 'labwall', floor: 'labfloor', upper: 'metalfloor', roof: 'steel', trim: 'team', stair: 'metalstair', label: 'OUTPOST',
    });
    // snow drifts and barricades in front of HQ
    s.box(-35, 0, -6, 1, 1.2, 4, 'snowrock');
    s.box(-36, 0, 8, 3, 1.0, 1, 'metal');
    s.prop('floodlight', -38.5, 0, -12, { rot: -Math.PI / 2 });
    s.light(-38, 4, -12, 0xdff0ff, 0.6, 14);

    // ---------------- CENTRAL LABORATORY ----------------
    const H = 9.5, U = 4.5;
    s.wallZ(-12, 12, -16, 0, H, 0.5, 'labwall', [
      { at: 0, w: 4.5, h: 3.8 },
      { at: -8, y: U + 0.4, w: 3, h: 2 },
      { at: 8, y: U + 0.4, w: 3, h: 2 },
    ]);
    s.wallX(-15.75, 15.75, -11.75, 0, H, 0.5, 'labwall', [
      { at: -10, w: 3, h: 3.4 },
      { at: 4, w: 3, h: 3.4 },
      { at: -3, y: U + 0.5, w: 4, h: 1.8 },
    ]);
    s.aabb(-16, H, -12, 0, H + 0.5, 12, 'steel');
    s.floor(-16, -12, 0, 12, 0.05, 'labfloor', 0.1);
    // mezzanine ring (upper level) around the atrium
    s.aabb(-15.5, U - 0.4, -11.5, -9, U, 11.5, 'metalfloor');       // end gallery
    s.aabb(-9, U - 0.4, -11.5, 9, U, -7.5, 'metalfloor');            // side gallery (sym gives other side)
    s.aabb(-9, U, -7.6, 9, U + 1.1, -7.5, 'railing', { shot: false, trans: true });
    s.aabb(-9.1, U, -7.5, -9, U + 1.1, -1.2, 'railing', { shot: false, trans: true });
    s.aabb(-9.1, U, 1.2, -9, U + 1.1, 7.5, 'railing', { shot: false, trans: true });
    s.stairs(-3.5, 0, 0, '-x', 2, U, 'metalstair');
    // atrium: specimen tanks, consoles
    s.prop('labtank', -4, 0, 4.5, { col: [1.4, 2.8, 1.4] });
    s.prop('console', -6, 0, -4, { rot: Math.PI / 2, col: [1.4, 1.2, 0.8] });
    s.prop('console', -12, 0, -4, { rot: -Math.PI / 2, col: [1.4, 1.2, 0.8] });
    s.box(-11, 0, 4, 3.5, 1.1, 1.2, 'steel');
    s.crate(-7.5, 0, 9, 1.2, 'metal');
    s.prop('hangingLamp', -6, H, -6, {});
    s.light(-6, 7, -6, 0xcfe8ff, 1.0, 16);
    s.light(-12, 3.5, 6, 0x9fd8ff, 0.7, 10);
    s.soundZone(-16, 0, -12, 16, H, 12, 'interior');
    s.pickup('health', 'medium', -12, U + 0.05, -9.5);
    s.pickup('ammo', 'small', -7, 0.05, 5);

    // ---------------- SNOWFIELD & RIDGES ----------------
    // ridge with a sniper ledge, reachable by rock steps
    s.box(-26, 0, -30, 10, 4, 6, 'snowrock');
    s.stairs(-36.5, 0, -30, '+x', 2.5, 4, 'snowrock');
    s.box(-24, 4, -31, 3, 1, 3, 'snowrock');
    s.box(-28, 0, 26, 8, 2.2, 5, 'snowrock');
    s.stairs(-35, 0, 26, '+x', 2, 2.2, 'snowrock');
    s.box(-20, 0, -16, 3, 1.6, 2, 'snowrock');
    s.box(-22, 0, 14, 4, 1.4, 2.2, 'ice');
    s.box(-30, 0, 4, 2.4, 2.4, 6, 'metal');
    s.box(-30, 2.4, 4, 2.4, 0.4, 6.4, 'snow');
    // research equipment yard
    s.prop('generator', -24, 0, 6, { col: [2.2, 1.9, 1.4] });
    s.prop('dish', -46, 0, -30, { col: [1.2, 2, 1.2] });
    s.prop('antenna', -45, 0, 29, { col: [0.6, 9, 0.6] });
    s.prop('crystal', -18, 0, -36, {});
    s.prop('crystal', -38, 0, 36, { color: 0xbff0ff });
    s.container(-19, 0, 32, true, 'blue');
    s.container(-19, 0, 29.4, true, 'yellow');
    s.box(-12, 0, -22, 6, 0.4, 3, 'ice', {});
    for (const [x, z, sc] of [[-50, -36, 1.2], [-36, -38, 1], [-48, 36, 1.3], [-10, 36, 0.9], [-34, 34, 1], [-30, -18, 0.8], [-8, -36, 1.1]]) s.prop('pine', x, 0, z, { scale: sc, col: [0.6, 3, 0.6] });
    for (const [x, z] of [[-26, -8], [-14, 18], [-34, -22]]) s.prop('snowpile', x, 0, z, {});
    s.prop('icicles', -16.2, 9.3, 4, { rot: Math.PI / 2, n: 7 });
    s.pickup('health', 'small', -24, 5.05, -31);
    s.pickup('ammo', 'medium', -27, 0.05, -12);
    s.pickup('health', 'medium', -22, 0.05, 20);

    // ---------------- SERVICE TUNNELS ----------------
    holes = tunnelX(s, -36, 36, -24, 4, { floor: 'labfloor', wall: 'insulated', stair: 'metalstair', rim: 'metal', light: 0x6ab8ff }, [
      { x: -31, dir: '-x' }, { x: 31, dir: '+x' }, { x: -2, dir: '-x' },
    ]);
    s.pickup('health', 'medium', -16, -3.95, -24);
  });

  // Ground with stairwell holes (both symmetric copies)
  slabWithHoles(b, -60, -42, 60, 42, 0, 1, 'snow', holes);
  b.aabb(-3, 9.5, -12, 3, 9.6, 12, 'glass', { trans: true });
  b.pickup('health', 'large', 0, 0.05, 0);
  return b.build();
}
