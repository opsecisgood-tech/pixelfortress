// Visual-only map dressing, generated deterministically from the map's boxes on every client:
//  - surface variety: each box picks one of several texture variants (grime, patches, cracks), ceilings
//    seen from inside get their own ceiling material, and walls get baseboards;
//  - detail: ceiling lamps, wall pipes/vents/posters/fuse boxes/sconces, floor stains and markings,
//    and themed ground scatter outdoors (pebbles, tufts, snow lumps, litter, scrap, pottery).
// Nothing here collides or changes gameplay: decoration sits flat on surfaces or is low enough to ignore.
import * as THREE from 'three';
import { colorMat, boxGeo } from './blocks.js';
import { makeCanvas } from './textures.js';
import { mulberry32 } from '../../shared/math.js';

const THEMES = {
  dusty_depot: { ceil: 'ceilbeam', trim: 0x4a3a2c, pipe: 0x7a6a58, lamp: 0xffe2a0, scatter: 'desert', posters: [['#c8402f', '#efe6cf', 'CARGO'], ['#e2b12a', '#222', 'DANGER'], ['#3a72c4', '#efe6cf', 'DEPOT 7']], decal: 0x3a3028 },
  frostfall: { ceil: 'ceiltile', trim: 0x3a4a5a, pipe: 0x8a9aa8, lamp: 0xd8f0ff, scatter: 'snow', posters: [['#3d8fd6', '#fff', 'LAB B'], ['#e8f0f6', '#c8402f', 'COLD'], ['#e2b12a', '#222', 'NO ENTRY']], decal: 0x5a6a7a },
  pixelworks: { ceil: 'ceilmetal', trim: 0x2e3032, pipe: 0x5e7a68, lamp: 0xfff2c8, scatter: 'factory', posters: [['#e2b12a', '#222', 'HAZARD'], ['#c8402f', '#efe6cf', 'LINE 3'], ['#3a72c4', '#efe6cf', 'WORKS']], decal: 0x2a2620 },
  sandstone_fortress: { ceil: 'ceilbeam', trim: 0x7a5a38, pipe: 0x8a6a48, lamp: 0xffc070, scatter: 'sand', posters: [['#b8562b', '#efe6cf', 'KEEP'], ['#d2a86b', '#5a3a20', 'BAZAAR'], ['#3f7f43', '#efe6cf', 'OASIS']], decal: 0x8a6a40 },
};
const DEFAULT_THEME = THEMES.dusty_depot;
export const themeFor = (id) => THEMES[id] || DEFAULT_THEME;

// Materials that get automatic variants (others: transparent, emissive, team, face-mapped, ground).
const NO_VARIANT = /^(team|neon_|glass|water|railing|fence|grate|window|hazard|crane|crate|shelf|container_|leaves|ice)/;
export function variantFor(mat, b) {
  if (NO_VARIANT.test(mat)) return mat;
  const h = (Math.floor(b.min[0] * 3.1) * 73856093) ^ (Math.floor(b.min[2] * 2.7) * 19349663) ^ (Math.floor(b.min[1] * 5) * 83492791);
  const v = ((h >>> 0) % 3);
  return v === 0 ? mat : `${mat}#${v}`;
}

// ------------------------------------------------------------------ occupancy grid for placement tests
class Occupancy {
  constructor(boxes) {
    this.cell = 4;
    this.grid = new Map();
    // every visible solid-looking box (incl. no-collision trims) so decoration never ends up inside one
    this.boxes = boxes.filter((b) => b.vis !== false && b.mat && b.mat !== 'water' && !b.trans);
    for (const b of this.boxes) {
      for (let x = Math.floor(b.min[0] / this.cell); x <= Math.floor(b.max[0] / this.cell); x++) {
        for (let z = Math.floor(b.min[2] / this.cell); z <= Math.floor(b.max[2] / this.cell); z++) {
          const k = x * 100003 + z;
          let l = this.grid.get(k); if (!l) { l = []; this.grid.set(k, l); } l.push(b);
        }
      }
    }
  }
  at(x, y, z, pad = 0) {
    const l = this.grid.get(Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell));
    if (!l) return false;
    for (const b of l) {
      if (x > b.min[0] - pad && x < b.max[0] + pad && y > b.min[1] - pad && y < b.max[1] + pad && z > b.min[2] - pad && z < b.max[2] + pad) return true;
    }
    return false;
  }
  // Is a point enclosed (walls in at least 3 horizontal directions within `reach`)?
  enclosed(x, y, z, reach = 24) {
    let hits = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let d = 0.25; d <= reach; d += 0.2) if (this.at(x + dx * d, y, z + dz * d)) { hits++; break; }
    }
    return hits >= 3;
  }
  openSky(x, y, z) {
    for (let h = 1.2; h < 22; h += 0.3) if (this.at(x, y + h, z)) return false;
    return true;
  }
}

// Ceiling material for a box's underside (null = keep the box's own material).
export function makeCeilingTest(map) {
  const occ = new Occupancy(map.boxes);
  const theme = themeFor(map.id);
  return {
    occ,
    ceilingFor(b) {
      const dy = b.max[1] - b.min[1], area = (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]);
      if (dy > 1.6 || area < 12 || b.min[1] < 2.5) return null;
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, y = b.min[1] - 1.4;
      if (occ.at(cx, y, cz)) return null;
      return occ.enclosed(cx, y, cz) ? theme.ceil : null;
    },
  };
}

// ------------------------------------------------------------------ poster textures
const posterCache = new Map();
function posterMat(spec, i) {
  const key = `${spec.join('|')}|${i}`;
  if (posterCache.has(key)) return posterCache.get(key);
  const [bg, fg, text] = spec;
  const c = makeCanvas(32, 48), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 32, 48);
  x.fillStyle = fg;
  const r = mulberry32(i * 31 + text.length);
  // simple pixel graphic: stripes, a disc or an arrow, then a word
  const kind = i % 3;
  if (kind === 0) for (let k = -48; k < 48; k += 8) for (let t = 0; t < 32; t++) x.fillRect(t, k + t, 1, 3);
  else if (kind === 1) { x.beginPath(); x.arc(16, 18, 9, 0, Math.PI * 2); x.fill(); x.fillStyle = bg; x.fillRect(12, 14, 8, 8); x.fillStyle = fg; }
  else { x.fillRect(13, 8, 6, 16); x.beginPath(); x.moveTo(8, 22); x.lineTo(24, 22); x.lineTo(16, 30); x.fill(); }
  x.fillStyle = bg; x.fillRect(0, 34, 32, 14);
  x.fillStyle = fg; x.font = 'bold 8px Verdana, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 16, 41, 30);
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, 32, 1); x.fillRect(0, 47, 32, 1); x.fillRect(0, 0, 1, 48); x.fillRect(31, 0, 1, 48);
  if (r() < 0.5) { x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(26, 0, 6, 6); }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshLambertMaterial({ map: tex });
  posterCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ builder
export function buildMapDetails(map, quality, occ) {
  const theme = themeFor(map.id);
  const root = new THREE.Group();
  const detail = quality.propDetail ?? 1;
  const rnd = mulberry32(map.id.length * 9973 + map.boxes.length);
  let budget = Math.round(2600 * Math.max(0.35, detail));
  // Anti z-fighting: detail boxes are grown a few millimetres each when merged (see mergeStatic), and
  // thin floor decals are lifted onto separate layers ~6 mm apart instead (and not grown).
  let nB = 0;
  const B = (x, y, z, w, h, d, col, opts = {}) => {
    if (budget-- <= 0) return null;
    const decal = opts.flat && h <= 0.03;
    if (decal) y += (nB++ % 5) * 0.006;
    const m = new THREE.Mesh(boxGeo(w, h, d), opts.material || (opts.glow ? colorMat(col, { basic: true }) : colorMat(col, opts.flat ? { flat: true } : {})));
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    if (decal) m.userData.noGrow = true;
    m.castShadow = !!opts.shadow;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const free = (x, y, z) => !occ.at(x, y, z);

  for (const b of map.boxes) {
    if (b.vis === false || !b.mat || b.trans) continue;
    const dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
    const isWall = b.col !== false && dy >= 2.4 && Math.min(dx, dz) <= 1.2 && Math.max(dx, dz) >= 2.5;
    const isSlab = dy <= 1.6 && dx * dz >= 6;

    // ---- walls: baseboards, pipes, vents, posters, fuse boxes, sconces (both faces)
    if (isWall) {
      const alongX = dx >= dz;
      const len = alongX ? dx : dz;
      for (const side of [-1, 1]) {
        const faceC = alongX ? (side < 0 ? b.min[2] : b.max[2]) : (side < 0 ? b.min[0] : b.max[0]);
        const P = (t, out) => (alongX ? [t, faceC + side * out] : [faceC + side * out, t]);
        const t0 = alongX ? b.min[0] : b.min[2];
        const mid = t0 + len / 2;
        const [mx, mz] = P(mid, 0.6);
        if (!free(mx, b.min[1] + 1.2, mz) || !free(...(() => { const q = P(mid, 1.6); return [q[0], b.min[1] + 1.2, q[1]]; })())) continue;
        const inside = occ.enclosed(mx, b.min[1] + 1.2, mz, 12);
        // baseboard / kick plate along the floor
        if (b.min[1] < 0.2 || inside) {
          const [cx, cz] = P(mid, 0.035);
          B(cx, b.min[1] + 0.18, cz, alongX ? len : 0.07, 0.36, alongX ? 0.07 : len, theme.trim);
        }
        // a long pipe run on some walls
        if (dy > 3.4 && rnd() < 0.3) {
          const py = b.min[1] + Math.min(dy - 0.5, 2.9 + rnd() * 0.6);
          const [cx, cz] = P(mid, 0.16);
          B(cx, py, cz, alongX ? len : 0.22, 0.22, alongX ? 0.22 : len, theme.pipe);
          for (let t = t0 + 1; t < t0 + len - 0.5; t += 2.5) { const [bxp, bzp] = P(t, 0.12); B(bxp, py, bzp, alongX ? 0.12 : 0.3, 0.32, alongX ? 0.3 : 0.12, 0x2e2e30); }
        }
        // spaced fixtures
        for (let t = t0 + 1.4; t < t0 + len - 1; t += 3.2 + rnd() * 1.6) {
          const roll = rnd();
          const ry = alongX ? 0 : Math.PI / 2;
          if (roll < 0.22) {
            // poster
            const [px, pz] = P(t, 0.02);
            const spec = theme.posters[Math.floor(rnd() * theme.posters.length)];
            const m = B(px, b.min[1] + 1.7, pz, alongX ? 0.9 : 0.02, 1.35, alongX ? 0.02 : 0.9, 0, { material: posterMat(spec, Math.floor(rnd() * 3)) });
            if (m) m.rotation.y = 0;
          } else if (roll < 0.36) {
            // vent grille
            const [px, pz] = P(t, 0.03);
            B(px, b.min[1] + Math.min(dy - 0.6, 2.4), pz, alongX ? 0.9 : 0.06, 0.5, alongX ? 0.06 : 0.9, 0x3a3e42);
            for (let k = -1; k <= 1; k++) { const [vx, vz] = P(t, 0.065); B(vx, b.min[1] + Math.min(dy - 0.6, 2.4) + k * 0.13, vz, alongX ? 0.8 : 0.02, 0.05, alongX ? 0.02 : 0.8, 0x1c1e20); }
          } else if (roll < 0.48 && inside) {
            // fuse box with hazard stripe
            const [px, pz] = P(t, 0.1);
            B(px, b.min[1] + 1.4, pz, alongX ? 0.5 : 0.2, 0.7, alongX ? 0.2 : 0.5, 0x6a7076);
            const [sx, sz] = P(t, 0.205); B(sx, b.min[1] + 1.62, sz, alongX ? 0.5 : 0.02, 0.08, alongX ? 0.02 : 0.5, 0xe2b12a);
            const [kx, kz] = P(t, 0.21); B(kx, b.min[1] + 1.3, kz, alongX ? 0.1 : 0.02, 0.14, alongX ? 0.02 : 0.1, 0x222222);
          } else if (roll < 0.62 && inside && dy > 3) {
            // wall sconce
            const [px, pz] = P(t, 0.09);
            B(px, b.min[1] + 2.5, pz, alongX ? 0.36 : 0.18, 0.22, alongX ? 0.18 : 0.36, 0x2a2a2c);
            const [lx, lz] = P(t, 0.15); B(lx, b.min[1] + 2.42, lz, alongX ? 0.26 : 0.06, 0.12, alongX ? 0.06 : 0.26, theme.lamp, { glow: true });
          } else if (roll < 0.7) {
            // cable run down the wall
            const [px, pz] = P(t, 0.04);
            B(px, b.min[1] + dy / 2, pz, alongX ? 0.06 : 0.06, dy - 0.3, alongX ? 0.06 : 0.06, 0x1e1e20);
          }
          void ry;
        }
      }
    }

    // ---- ceilings: hanging lamp fixtures
    if (isSlab && b.min[1] >= 2.6) {
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
      if (free(cx, b.min[1] - 1.2, cz) && occ.enclosed(cx, b.min[1] - 1.2, cz)) {
        for (let x = b.min[0] + 2.5; x < b.max[0] - 1.5; x += 6) {
          for (let z = b.min[2] + 2.5; z < b.max[2] - 1.5; z += 6) {
            if (!free(x, b.min[1] - 0.6, z) || !free(x, b.min[1] - 2.2, z)) continue;
            B(x, b.min[1] - 0.06, z, 1.3, 0.12, 0.5, 0x2a2a2c);
            B(x, b.min[1] - 0.14, z, 1.1, 0.05, 0.34, theme.lamp, { glow: true });
          }
        }
      }
    }

    // ---- floors: stains, cracks, painted markings; ground scatter outdoors
    if (b.col !== false && (isSlab || (b.max[1] <= 0.05 && dx * dz >= 6))) {
      const y = b.max[1];
      const area = dx * dz;
      const n = Math.min(160, Math.round(area / 14 * detail));
      for (let i = 0; i < n; i++) {
        const x = b.min[0] + 0.6 + rnd() * (dx - 1.2), z = b.min[2] + 0.6 + rnd() * (dz - 1.2);
        if (!free(x, y + 0.05, z) || !free(x, y + 1, z)) continue;
        const outdoor = occ.openSky(x, y, z);
        if (outdoor) scatter(B, theme.scatter, x, y, z, rnd);
        else floorDecal(B, theme, x, y, z, rnd);
      }
    }
  }
  return root;
}

function floorDecal(B, theme, x, y, z, rnd) {
  const r = rnd();
  if (r < 0.4) {
    // stain blot
    const s = 0.5 + rnd() * 0.9;
    B(x, y + 0.006, z, s, 0.01, s * (0.6 + rnd() * 0.6), theme.decal, { flat: true, ry: rnd() * 3 });
    B(x + 0.2, y + 0.008, z - 0.1, s * 0.5, 0.01, s * 0.4, theme.decal, { flat: true, ry: rnd() * 3 });
  } else if (r < 0.65) {
    // crack: jagged line of thin slivers
    let cx = x, cz = z;
    const a = rnd() * Math.PI;
    for (let k = 0; k < 4; k++) {
      const ang = a + (rnd() - 0.5) * 0.9;
      B(cx, y + 0.007, cz, 0.45, 0.01, 0.04, 0x1e1c1a, { flat: true, ry: ang });
      cx += Math.cos(ang) * 0.4; cz -= Math.sin(ang) * 0.4;
    }
  } else if (r < 0.78) {
    // painted floor arrow / line segment
    B(x, y + 0.006, z, 1.4, 0.01, 0.14, 0xd8c35a, { flat: true, ry: rnd() < 0.5 ? 0 : Math.PI / 2 });
  } else if (r < 0.9) {
    // scattered papers / scrap
    for (let k = 0; k < 3; k++) B(x + (rnd() - 0.5) * 0.8, y + 0.01, z + (rnd() - 0.5) * 0.8, 0.22, 0.012, 0.3, 0xe8e2d0, { flat: true, ry: rnd() * 3 });
  } else {
    // bolt / debris bits
    for (let k = 0; k < 4; k++) B(x + (rnd() - 0.5) * 0.7, y + 0.04, z + (rnd() - 0.5) * 0.7, 0.08 + rnd() * 0.08, 0.08, 0.08 + rnd() * 0.08, 0x5a5650, { ry: rnd() * 3 });
  }
}

function scatter(B, kind, x, y, z, rnd) {
  const r = rnd();
  const tuft = (cols, hgt) => { for (let k = 0; k < 3; k++) B(x + (rnd() - 0.5) * 0.2, y + hgt / 2, z + (rnd() - 0.5) * 0.2, 0.05, hgt * (0.6 + rnd() * 0.5), 0.3, cols[k % cols.length], { ry: k * 1.05 + rnd() }); };
  const pebbles = (cols, n = 3) => { for (let k = 0; k < n; k++) { const s = 0.08 + rnd() * 0.18; B(x + (rnd() - 0.5) * 0.8, y + s * 0.35, z + (rnd() - 0.5) * 0.8, s, s * 0.7, s * (0.7 + rnd() * 0.5), cols[k % cols.length], { ry: rnd() * 3 }); } };
  switch (kind) {
    case 'desert': if (r < 0.45) pebbles([0xa88050, 0x8a6a42, 0xc49a62]); else if (r < 0.8) tuft([0xb8a060, 0x9a8448], 0.35); else B(x, y + 0.01, z, 1 + rnd(), 0.02, 0.5, 0xe6c07a, { flat: true, ry: rnd() * 3 }); break;
    case 'snow': if (r < 0.5) { const s = 0.4 + rnd() * 0.7; B(x, y + 0.06, z, s, 0.14, s * 0.8, 0xf4f8fb, { ry: rnd() * 3 }); B(x, y + 0.14, z, s * 0.6, 0.1, s * 0.5, 0xffffff, { ry: rnd() * 3 }); } else if (r < 0.75) pebbles([0x7b8796, 0x9aa6b4], 2); else tuft([0x8a9a7a, 0x6a7a5a], 0.25); break;
    case 'grass': if (r < 0.6) tuft([0x6aa848, 0x4f8a35, 0x7ab858], 0.45); else if (r < 0.8) { tuft([0x5a9a3a], 0.35); B(x, y + 0.42, z, 0.12, 0.1, 0.12, [0xf2d040, 0xe8606a, 0xf4f4f4, 0x8a7af0][Math.floor(rnd() * 4)]); } else pebbles([0x8a8a7a, 0x6a6a5a]); break;
    case 'city': if (r < 0.4) for (let k = 0; k < 2; k++) B(x + (rnd() - 0.5) * 0.6, y + 0.01, z + (rnd() - 0.5) * 0.6, 0.24, 0.012, 0.32, [0xe8e2d0, 0xff8ad8, 0x8ae8ff][k % 3], { flat: true, ry: rnd() * 3 }); else if (r < 0.6) B(x, y + 0.07, z, 0.1, 0.14, 0.1, [0xc8402f, 0x3a72c4, 0x58c46a][Math.floor(rnd() * 3)]); else if (r < 0.8) B(x, y + 0.005, z, 0.9 + rnd() * 0.8, 0.01, 0.6 + rnd() * 0.5, 0x202838, { flat: true, ry: rnd() * 3 }); else pebbles([0x4a4a52, 0x5a5a62]); break;
    case 'factory': if (r < 0.4) B(x, y + 0.006, z, 0.7 + rnd(), 0.01, 0.5 + rnd() * 0.6, 0x1e1c1a, { flat: true, ry: rnd() * 3 }); else if (r < 0.7) pebbles([0x6a6e72, 0x8a5a3a, 0x4a4e52]); else B(x, y + 0.02, z, 0.5, 0.04, 0.4, 0x7a7e82, { ry: rnd() * 3 }); break;
    case 'sand': if (r < 0.35) { B(x, y + 0.04, z, 0.18, 0.08, 0.12, 0xb8562b, { ry: rnd() * 3 }); B(x + 0.2, y + 0.03, z + 0.1, 0.12, 0.06, 0.1, 0xa84c24, { ry: rnd() * 3 }); } else if (r < 0.7) B(x, y + 0.02, z, 1.2 + rnd(), 0.04, 0.3, 0xe8c88a, { flat: true, ry: rnd() * 3 }); else pebbles([0xc49a62, 0xa88050]); break;
    default: pebbles([0x8a8a8a]);
  }
}
