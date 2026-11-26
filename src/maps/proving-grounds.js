// MAP 05 — PROVING GROUNDS: compact walled training yard built for 1v1 and 2v2 duels.
// Covered spawn bays at each end, sandbag and pillar cover, a container lane on each flank and a raised
// centre platform (with the only medium health pack) that both sides fight over.
import { MapBuilder } from './builder.js';

export function buildProvingGrounds() {
  const b = new MapBuilder({
    id: 'proving_grounds',
    name: 'Proving Grounds',
    theme: 'Walled training yard at dusk',
    description: 'A tight duel arena. Hold the raised centre for the health pack, or work the flanks behind the containers.',
    bounds: { minX: -26, maxX: 26, minZ: -16, maxZ: 16 },
    killY: -10,
    modes: ['duel1', 'duel2'],
    duel: true,
    env: {
      sky: [0x37467a, 0xf0a06c], fog: { color: 0xc8906c, near: 40, far: 130 },
      sun: { dir: [-0.6, 0.55, 0.35], color: 0xffcf96, intensity: 1.25 },
      ambient: { sky: 0x8a96c4, ground: 0x7a5a44, intensity: 0.85 },
      weather: 'none', ambience: 'fortress',
    },
    preview: ['#8a8a90', '#e2b12a', '#37467a'],
  });

  // Ground: concrete yard with a paved centre lane.
  b.floor(-26, -16, 26, 16, 0, 'concrete', 1);
  b.floor(-20, -2.5, 20, 2.5, 0.03, 'pavers', 0.1);

  // Raised centre platform (symmetric on its own) with the medium health pack on top.
  b.aabb(-3, 0, -3, 3, 1.5, 3, 'diamondplate');
  b.pickup('health', 'medium', 0, 1.55, 0);
  b.light(0, 6.5, 0, 0xfff2c8, 1.1, 18);

  b.sym((s) => {
    // perimeter walls with a capping course
    s.aabb(-28, 0, -18, 28, 7, -16, 'citywall');
    s.aabb(-28, 0, -16, -26, 7, 16, 'citywall');
    s.aabb(-28, 7, -18, 28, 7.4, -16, 'concrete');
    s.aabb(-28, 7, -16, -26, 7.4, 16, 'concrete');

    // ---------------- spawn bay (RED at -X) ----------------
    s.aabb(-26, 0, -6.5, -21, 4, -6, 'concrete');
    s.aabb(-26, 0, 6, -21, 4, 6.5, 'concrete');
    s.aabb(-26, 4, -6.5, -21, 4.4, 6.5, 'roof');
    s.aabb(-21.2, 3.4, -6.5, -20.8, 4, 6.5, 'team');
    s.spawnRoom(0, -26, 0, -6, -21, 4, 6);
    for (const z of [-3.6, -1.2, 1.2, 3.6]) s.spawn(0, -24, 0.05, z, -Math.PI / 2);
    // cover just outside the bay
    s.box(-18.5, 0, -2.8, 1, 1.15, 3, 'sandbag');
    s.box(-18.5, 0, 2.8, 1, 1.15, 3, 'sandbag');
    s.prop('banner', -25.7, 5.6, -3.2, { team: 0, rot: -Math.PI / 2 });
    s.prop('banner', -25.7, 5.6, 3.2, { team: 0, rot: -Math.PI / 2 });
    s.prop('lamp', -20.4, 0, -7.2, { color: 0xffd9a0 });
    s.light(-23.5, 3.6, 0, 0xffe2a0, 0.8, 10);
    s.pickup('ammo', 'small', -22.5, 0.05, -4.8);

    // ---------------- mid-field cover ----------------
    s.box(-11, 0, -5.5, 1.6, 4, 1.6, 'concrete');
    s.box(-11, 0, 5.5, 1.6, 4, 1.6, 'concrete');
    s.box(-7, 0, -9, 3.2, 1.1, 1, 'sandbag');
    s.box(-14.5, 0, 9, 1, 1.1, 3.4, 'sandbag');
    // stairs up to the centre platform (west and south faces here; symmetry adds east and north)
    s.stairs(-5, 0, 0, '+x', 3, 1.5, 'metalstair');
    s.stairs(0, 0, -5, '+z', 3, 1.5, 'metalstair');

    // ---------------- flank lanes ----------------
    s.container(-13, 0, -13, true, 'red');
    s.crate(-19, 0, -12.5, 1.4);
    s.crate(-19, 1.4, -12.5, 1.1);
    s.crate(-6.5, 0, 13.4, 1.3);
    // low wall across the flank between the lanes, with a gap to vault through
    s.aabb(-4, 0, -11.25, -0.8, 2.2, -10.75, 'concrete');
    s.aabb(0.8, 0, -11.25, 4, 2.2, -10.75, 'concrete');
    s.pickup('health', 'small', -8, 0.05, -13.5);
    s.pickup('ammo', 'small', -16.5, 0.05, 12.5);
    s.light(-12, 6, -9, 0xffe2a0, 0.7, 14);
  });

  return b.build();
}
