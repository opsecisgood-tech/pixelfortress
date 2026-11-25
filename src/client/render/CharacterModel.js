// Blocky third-person characters for all eight classes. Each body part is a box whose six faces are
// painted procedurally into a small pixel atlas (face features, uniforms, team accents). Accessories,
// cosmetics and the held weapon are attached to a joint hierarchy driven by an animation state machine
// with smooth (damped) transitions: idle, walk, run, crouch, jump, fall, land, shoot, reload, melee,
// ability, hurt and elimination.
import * as THREE from 'three';
import { makeCanvas, hexToRgb, rgbStr } from './textures.js';
import { colorMat, boxGeo } from './blocks.js';
import { buildWeapon, WEAPON_MODELS } from './WeaponModels.js';
import { voxelCells, VOXEL_MATERIAL } from './voxel.js';
import { TEAM_COLORS_HEX, TEAM_DARK_HEX } from '../../shared/constants.js';
import { getClass } from '../../shared/config/classes.js';
import { mulberry32, damp } from '../../shared/math.js';

// ---------------------------------------------------------------- body proportions (pixels)
const PROPORTIONS = {
  scout: { head: [8, 8, 8], body: [7, 11, 4], arm: [3, 11, 3], leg: [3, 13, 3], height: 1.8 },
  spy: { head: [8, 8, 8], body: [7, 12, 4], arm: [3, 12, 3], leg: [3, 12, 3], height: 1.82 },
  marksman: { head: [8, 8, 8], body: [8, 12, 4], arm: [4, 12, 4], leg: [4, 12, 4], height: 1.84 },
  mechanic: { head: [8, 8, 8], body: [9, 11, 5], arm: [4, 11, 4], leg: [4, 12, 4], height: 1.8 },
  doctor: { head: [8, 8, 8], body: [8, 12, 4], arm: [4, 12, 4], leg: [4, 12, 4], height: 1.84 },
  juggernaut: { head: [8, 8, 8], body: [12, 13, 7], arm: [6, 13, 6], leg: [5, 12, 5], height: 2.05 },
  incinerator: { head: [8, 8, 8], body: [9, 12, 5], arm: [4, 12, 4], leg: [4, 12, 4], height: 1.86 },
  demolitionist: { head: [8, 8, 8], body: [9, 12, 5], arm: [4, 12, 4], leg: [4, 12, 4], height: 1.86 },
};

// ---------------------------------------------------------------- painting helpers
function P(ctx, x, y, w, h, c) { ctx.fillStyle = typeof c === 'number' ? hex(c) : c; ctx.fillRect(x, y, w, h); }
function hex(n) { const [r, g, b] = hexToRgb(n); return rgbStr(r, g, b); }
function noise(ctx, x, y, w, h, base, amt, rnd) {
  const [r, g, b] = hexToRgb(base);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const f = 1 + (rnd() - 0.5) * amt;
    ctx.fillStyle = rgbStr(r * f, g * f, b * f);
    ctx.fillRect(x + i, y + j, 1, 1);
  }
}

// Face layout in a part atlas: returns rects per face name.
function layout(w, h, d) {
  return {
    W: 2 * (w + d), H: h + d,
    top: [d, 0, w, d], bottom: [d + w, 0, w, d],
    right: [0, d, d, h], front: [d, d, w, h], left: [d + w, d, d, h], back: [2 * d + w, d, w, h],
  };
}

// Apply atlas UVs to a BoxGeometry (face order +x,-x,+y,-y,+z,-z; character faces -Z).
function atlasGeometry(w, h, d, s, L) {
  const g = new THREE.BoxGeometry(w * s, h * s, d * s);
  const uv = g.attributes.uv;
  // +x = character's right side, -x = left side
  const order = [L.right, L.left, L.top, L.bottom, L.back, L.front];
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = order[f];
    const u0 = rx / L.W, u1 = (rx + rw) / L.W;
    const v0 = 1 - (ry + rh) / L.H, v1 = 1 - ry / L.H;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      const du = uv.getX(i), dv = uv.getY(i);
      uv.setXY(i, u0 + du * (u1 - u0), v0 + dv * (v1 - v0));
    }
  }
  uv.needsUpdate = true;
  return g;
}

// Class skin styles: colours and per-face painters.
function styleFor(classId, team) {
  const tc = TEAM_COLORS_HEX[team], td = TEAM_DARK_HEX[team];
  const S = {
    scout: { skin: 0xe8b48a, hair: 0x6b4a2a, shirt: tc, pants: 0x4a5560, boots: 0x2b2b2b, sleeve: 0xd8d8d8, vest: 0x3d454c },
    spy: { skin: 0xd9a27c, hair: 0x2a2a2a, shirt: 0x2a2c33, pants: 0x24262c, boots: 0x111111, sleeve: 0x2a2c33, vest: td, mask: 0x1d1e24 },
    marksman: { skin: 0xc98d68, hair: 0x4a3420, shirt: 0x7a6a48, pants: 0x5a5040, boots: 0x3a2a1a, sleeve: 0x7a6a48, vest: 0x5a4a30 },
    mechanic: { skin: 0xe0a882, hair: 0x9a6a3a, shirt: tc, pants: 0x6a5a3a, boots: 0x3a2e22, sleeve: 0x7b6a3f, vest: 0x7b6a3f },
    doctor: { skin: 0xf0c4a0, hair: 0x9aa0a6, shirt: 0xe8ecef, pants: 0x4a5056, boots: 0x222222, sleeve: 0xe8ecef, vest: tc },
    juggernaut: { skin: 0xd09a74, hair: 0x3a2a1a, shirt: tc, pants: 0x4a4a42, boots: 0x2a2a2a, sleeve: 0xd09a74, vest: 0x5b5144 },
    incinerator: { skin: 0x3a3a3a, hair: 0x3a3a3a, shirt: tc, pants: 0x9a7a3a, boots: 0x2a2a2a, sleeve: 0xc9a14a, vest: 0xc9a14a, mask: 0x3c3c3c },
    demolitionist: { skin: 0x8d5a3c, hair: 0x1a1a1a, shirt: 0x545c3c, pants: 0x3f4430, boots: 0x2a2a2a, sleeve: 0x545c3c, vest: tc },
  }[classId];
  return { ...S, tc, td };
}

function paintPart(classId, team, part, dims, gloves) {
  const [w, h, d] = dims;
  const L = layout(w, h, d);
  const cv = makeCanvas(L.W, L.H);
  const c = cv.getContext('2d');
  const st = styleFor(classId, team);
  const rnd = mulberry32(classId.length * 31 + part.length * 7 + team);
  const faces = ['top', 'bottom', 'right', 'front', 'left', 'back'];
  const R = (f) => L[f];
  const fillAll = (col, amt = 0.08) => { for (const f of faces) { const [x, y, fw, fh] = R(f); noise(c, x, y, fw, fh, col, amt, rnd); } };
  const band = (y0, hh, col) => { for (const f of ['right', 'front', 'left', 'back']) { const [x, y, fw] = R(f); P(c, x, y + y0, fw, hh, col); } };
  const glove = gloves === 'black' ? 0x222222 : gloves === 'team' ? st.tc : gloves === 'gold' ? 0xd8a830 : null;

  if (part === 'head') {
    fillAll(st.skin, 0.06);
    // hair on top/back/sides
    const [tx, ty, tw, th] = R('top'); noise(c, tx, ty, tw, th, st.hair, 0.15, rnd);
    const [bx2, by, bw] = R('back'); noise(c, bx2, by, bw, 4, st.hair, 0.15, rnd);
    for (const f of ['right', 'left']) { const [x, y, fw] = R(f); noise(c, x, y, fw, 2, st.hair, 0.15, rnd); }
    const [fx, fy] = R('front');
    switch (classId) {
      case 'scout':
        P(c, fx, fy, 8, 2, st.hair);
        P(c, fx + 1, fy + 3, 2, 1, '#fff'); P(c, fx + 5, fy + 3, 2, 1, '#fff');
        P(c, fx + 2, fy + 3, 1, 1, '#3a6ad0'); P(c, fx + 5, fy + 3, 1, 1, '#3a6ad0');
        P(c, fx + 2, fy + 6, 4, 1, '#8a4a3a'); P(c, fx + 5, fy + 5, 1, 1, '#8a4a3a');
        break;
      case 'spy': {
        // full balaclava with team-coloured eye trim
        for (const f of faces) { const [x, y, fw, fh] = R(f); noise(c, x, y, fw, fh, st.mask, 0.1, rnd); }
        P(c, fx + 1, fy + 2, 6, 3, st.tc);
        P(c, fx + 2, fy + 3, 1, 1, '#fff'); P(c, fx + 5, fy + 3, 1, 1, '#fff');
        P(c, fx + 1, fy + 3, 1, 1, '#111'); P(c, fx + 6, fy + 3, 1, 1, '#111');
        P(c, fx + 3, fy + 6, 2, 1, hex(st.skin));
        break;
      }
      case 'marksman':
        P(c, fx, fy + 2, 8, 2, '#1a1a1a'); P(c, fx + 1, fy + 2, 2, 1, '#6a8aa0'); P(c, fx + 5, fy + 2, 2, 1, '#6a8aa0');
        noise(c, fx + 1, fy + 5, 6, 3, 0x7a5a40, 0.2, rnd);
        P(c, fx + 2, fy + 6, 4, 1, '#3a2018');
        break;
      case 'mechanic':
        P(c, fx, fy + 2, 8, 3, '#3a3a3a'); P(c, fx + 1, fy + 2, 3, 2, '#f0c040'); P(c, fx + 4, fy + 2, 3, 2, '#f0c040');
        P(c, fx + 2, fy + 2, 1, 1, '#fff6c0');
        P(c, fx + 2, fy + 6, 4, 1, '#6a3a2a'); noise(c, fx + 1, fy + 6, 6, 2, 0xb08060, 0.2, rnd);
        for (const f of ['right', 'left', 'back']) { const [x, y, fw] = R(f); P(c, x, y + 2, fw, 2, '#3a3a3a'); }
        break;
      case 'doctor':
        P(c, fx, fy, 8, 1, st.hair);
        P(c, fx + 1, fy + 3, 3, 2, '#d8e8f0'); P(c, fx + 4, fy + 3, 3, 2, '#d8e8f0'); P(c, fx + 1, fy + 3, 6, 1, '#555');
        P(c, fx + 2, fy + 4, 1, 1, '#2a4a6a'); P(c, fx + 5, fy + 4, 1, 1, '#2a4a6a');
        P(c, fx + 1, fy + 6, 6, 2, '#bfe0e8'); // surgical mask
        break;
      case 'juggernaut':
        P(c, fx + 1, fy + 2, 2, 1, '#3a2418'); P(c, fx + 5, fy + 2, 2, 1, '#3a2418'); P(c, fx + 3, fy + 2, 2, 1, '#b8805c'); // heavy brows, frown crease
        P(c, fx + 1, fy + 3, 2, 1, '#fff'); P(c, fx + 5, fy + 3, 2, 1, '#fff');
        P(c, fx + 2, fy + 3, 1, 1, '#222'); P(c, fx + 5, fy + 3, 1, 1, '#222');
        noise(c, fx, fy + 5, 8, 3, 0x3a2a1a, 0.25, rnd);
        P(c, fx + 2, fy + 6, 4, 1, '#5a2018');
        break;
      case 'incinerator':
        for (const f of faces) { const [x, y, fw, fh] = R(f); noise(c, x, y, fw, fh, 0xc9a14a, 0.1, rnd); }
        P(c, fx, fy + 1, 8, 7, '#3c3c3c');
        P(c, fx + 1, fy + 2, 2, 2, '#ff8a2a'); P(c, fx + 5, fy + 2, 2, 2, '#ff8a2a');
        P(c, fx + 1, fy + 2, 1, 1, '#ffd080'); P(c, fx + 5, fy + 2, 1, 1, '#ffd080');
        P(c, fx + 3, fy + 5, 2, 3, '#222'); P(c, fx + 2, fy + 6, 4, 1, '#555');
        break;
      case 'demolitionist':
        // separate brows, real eyes, moustache and short beard
        P(c, fx + 1, fy + 2, 2, 1, '#24160c'); P(c, fx + 5, fy + 2, 2, 1, '#24160c');
        P(c, fx + 1, fy + 3, 2, 1, '#f2efe6'); P(c, fx + 5, fy + 3, 2, 1, '#f2efe6');
        P(c, fx + 2, fy + 3, 1, 1, '#3b2312'); P(c, fx + 5, fy + 3, 1, 1, '#3b2312');
        P(c, fx + 3, fy + 4, 2, 1, hex(shadeNum(st.skin, 0.82)));
        P(c, fx + 2, fy + 5, 4, 1, '#24160c');
        P(c, fx + 1, fy + 5, 1, 3, '#2e1d10'); P(c, fx + 6, fy + 5, 1, 3, '#2e1d10'); P(c, fx + 2, fy + 7, 4, 1, '#2e1d10');
        P(c, fx + 3, fy + 6, 2, 1, '#6a2a1c');
        break;
      default:
    }
  } else if (part === 'body') {
    fillAll(st.shirt, 0.08);
    const [fx, fy, fw, fh] = R('front');
    const [kx, ky, kw] = R('back');
    switch (classId) {
      case 'scout':
        for (const f of ['front', 'back']) { const [x, y, ww, hh] = R(f); noise(c, x + 1, y + 1, ww - 2, hh - 4, st.vest, 0.1, rnd); }
        P(c, fx + 3, fy + 2, 1, 6, '#888'); band(fh - 3, 1, '#2a2a2a'); P(c, fx + 1, fy + 2, 1, 2, st.tc);
        break;
      case 'spy':
        P(c, fx + 2, fy, 3, 7, '#e8e8e8'); P(c, fx + 3, fy + 1, 1, 6, st.tc); // shirt & tie
        P(c, fx + 1, fy, 1, 9, '#1a1a1a'); P(c, fx + 5, fy, 1, 9, '#1a1a1a');
        band(fh - 3, 1, '#111'); P(c, fx + 5, fy + 3, 1, 1, st.tc);
        break;
      case 'marksman':
        noise(c, fx, fy, fw, fh, 0x8a7a55, 0.12, rnd); P(c, fx, fy + fh - 4, fw, 2, '#3a2a1a');
        P(c, fx + 1, fy + fh - 5, 2, 2, '#5a4a30'); P(c, fx + 5, fy + fh - 5, 2, 2, '#5a4a30');
        P(c, fx + 1, fy + 1, 1, 6, '#3a2a1a'); P(c, fx + 6, fy + 1, 1, 6, '#3a2a1a');
        P(c, fx + 3, fy + 2, 2, 2, st.tc);
        break;
      case 'mechanic':
        for (const f of ['front', 'back']) { const [x, y, ww, hh] = R(f); noise(c, x + 1, y + 2, ww - 2, hh - 2, st.vest, 0.12, rnd); }
        P(c, fx + 2, fy, 1, 3, st.vest); P(c, fx + fw - 3, fy, 1, 3, st.vest);
        band(fh - 4, 2, '#3a2e22'); P(c, fx + 1, fy + fh - 4, 2, 2, '#c0a040'); P(c, fx + 5, fy + fh - 4, 3, 2, '#808890');
        P(c, fx + 3, fy + 4, 3, 2, st.tc);
        break;
      case 'doctor':
        P(c, fx + 3, fy, 2, fh, '#d0d4d8'); P(c, fx + 1, fy + 2, 2, 2, st.tc); P(c, fx + 1.5, fy + 1.5, 1, 3, st.tc);
        P(c, fx + 1, fy + 2, 1, 1, '#fff');
        band(fh - 3, 1, '#4a5056');
        P(c, kx + 2, ky + 2, 4, 4, st.tc); P(c, kx + 3, ky + 2, 2, 4, '#fff'); P(c, kx + 2, ky + 3, 4, 2, '#fff');
        break;
      case 'juggernaut':
        for (const f of ['front', 'back']) { const [x, y, ww, hh] = R(f); noise(c, x + 1, y, ww - 2, hh - 3, st.vest, 0.1, rnd); }
        for (let i = 0; i < fw; i += 2) P(c, fx + i, fy + ((i / 2) % 6) + 1, 2, 1, '#c9a14a'); // ammo bandolier
        band(fh - 3, 2, '#2a2a2a'); P(c, fx + fw / 2 - 1, fy + fh - 3, 2, 2, '#c9a14a');
        P(c, fx + 2, fy + 4, 3, 3, st.tc);
        break;
      case 'incinerator':
        noise(c, fx, fy, fw, fh, 0xc9a14a, 0.1, rnd);
        P(c, fx + 3, fy, 3, fh, '#9a7a3a'); P(c, fx + 1, fy + 2, 2, 2, st.tc); band(fh - 3, 2, '#3a3a3a');
        P(c, fx, fy + 6, fw, 1, '#a8862e');
        break;
      case 'demolitionist':
        for (const f of ['front', 'back']) { const [x, y, ww, hh] = R(f); noise(c, x + 1, y + 1, ww - 2, hh - 4, 0x3f4430, 0.12, rnd); }
        for (let i = 0; i < 3; i++) { P(c, fx + 1 + i * 3, fy + 5, 2, 3, '#c8402f'); P(c, fx + 1 + i * 3, fy + 5, 2, 1, '#e8e8e8'); }
        band(fh - 3, 1, '#222'); P(c, fx + 1, fy + 1, fw - 2, 1, st.tc);
        break;
      default:
    }
  } else if (part === 'arm') {
    fillAll(st.sleeve, 0.08);
    const handCol = glove ?? (classId === 'incinerator' ? 0x3a3a3a : classId === 'spy' ? 0x1a1a1a : classId === 'mechanic' ? 0x6a4a2a : classId === 'doctor' ? 0xa8d8e8 : st.skin);
    for (const f of ['right', 'front', 'left', 'back']) { const [x, y, fw] = R(f); noise(c, x, y + h - 3, fw, 3, handCol, 0.08, rnd); }
    { const [x, y, fw, fh] = R('bottom'); noise(c, x, y, fw, fh, handCol, 0.08, rnd); }
    if (classId === 'scout' || classId === 'juggernaut' || classId === 'mechanic') band(classId === 'juggernaut' ? 0 : 0, classId === 'juggernaut' ? 4 : 5, classId === 'juggernaut' ? st.tc : st.shirt);
    if (classId === 'doctor' || classId === 'marksman' || classId === 'demolitionist' || classId === 'spy') band(2, 1, st.tc);
    if (classId === 'incinerator') { band(h - 5, 2, '#3a3a3a'); band(1, 1, st.tc); }
  } else if (part === 'leg') {
    fillAll(st.pants, 0.08);
    band(h - 3, 3, st.boots);
    { const [x, y, fw, fh] = R('bottom'); noise(c, x, y, fw, fh, st.boots, 0.08, rnd); }
    if (classId === 'scout') band(h - 4, 1, '#e8e8e8');
    if (classId === 'mechanic' || classId === 'demolitionist') band(3, 2, '#3a3a3a');
    if (classId === 'marksman') band(5, 2, '#5a4a30');
    band(0, 1, st.tc);
  }
  shadeAtlas(c, L, false);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, L };
}

// Hand-drawn style shading: lit top rows, shaded bottom rows, darker face borders.
function shadeAtlas(c, L, alphaOnly) {
  for (const f of ['top', 'bottom', 'right', 'front', 'left', 'back']) {
    const [x0, y0, w, h] = L[f];
    if (!w || !h) continue;
    const img = c.getImageData(x0, y0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (alphaOnly && d[i + 3] < 128) continue;
      let k;
      if (f === 'top') k = 1.12;
      else if (f === 'bottom') k = 0.68;
      else k = 1.1 - 0.26 * (h > 1 ? y / (h - 1) : 0);
      if (f !== 'top' && f !== 'bottom') {
        if (x === 0 || x === w - 1) k *= 0.88;
        if (y === 0) k *= 1.06;
        if (y === h - 1) k *= 0.85;
      }
      if (f === 'left') k *= 0.94;
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    c.putImageData(img, x0, y0);
  }
}

// Outer layer (like a second skin layer): sleeves, coats, vests, boot cuffs, hair fringe.
function paintOverlay(classId, team, part, dims) {
  const [w, h, d] = dims;
  const L = layout(w, h, d);
  const cv = makeCanvas(L.W, L.H);
  const c = cv.getContext('2d');
  const st = styleFor(classId, team);
  const rnd = mulberry32(classId.length * 53 + part.length * 11 + team * 3);
  const sides = ['right', 'front', 'left', 'back'];
  let painted = false;
  const rows = (y0, n, col, which = sides) => {
    painted = true;
    for (const f of which) { const [x, y, fw] = L[f]; noise(c, x, y + y0, fw, n, col, 0.1, rnd); }
  };
  const cap = (col, face = 'top') => { painted = true; const [x, y, fw, fh] = L[face]; noise(c, x, y, fw, fh, col, 0.1, rnd); };
  const sleeve = {
    scout: [4, st.sleeve], spy: [h - 3, 0x2a2c33], marksman: [6, 0x7a6a48], mechanic: [6, st.tc], doctor: [h - 3, 0xe8ecef],
    juggernaut: [4, st.tc], incinerator: [h - 4, 0xc9a14a], demolitionist: [7, 0x545c3c],
  }[classId];
  if (part === 'arm') {
    const [n, col] = sleeve;
    rows(0, n, col); cap(col);
    rows(n - 1, 1, shadeNum(col, 0.72));
    if (classId === 'spy') rows(n - 1, 1, st.tc);
    if (classId === 'incinerator') { rows(h - 4, 4, 0x2e2e2e); cap(0x2e2e2e, 'bottom'); rows(h - 4, 1, st.tc); }
  } else if (part === 'body') {
    rows(0, 1, shadeNum(st.shirt, 0.85));
    const [fx, fy, fw, fh] = L.front;
    const [bx, by, bw, bh] = L.back;
    if (classId === 'doctor' || classId === 'spy') {
      const col = classId === 'doctor' ? 0xe8ecef : 0x2a2c33;
      rows(0, h, col, ['right', 'left', 'back']); cap(col);
      noise(c, fx, fy, 2, fh, col, 0.1, rnd); noise(c, fx + fw - 2, fy, 2, fh, col, 0.1, rnd);
      P(c, fx + 2, fy, 1, 3, shadeNum(col, 0.7)); P(c, fx + fw - 3, fy, 1, 3, shadeNum(col, 0.7));
      if (classId === 'doctor') { P(c, bx + 2, by + 2, bw - 4, 1, st.tc); P(c, fx, fy + 3, 2, 2, st.tc); }
      else P(c, fx + 1, fy + 3, 1, 1, st.tc);
    } else if (classId === 'marksman' || classId === 'demolitionist') {
      const col = classId === 'marksman' ? 0x5a4a30 : 0x3a4028;
      noise(c, fx, fy + 1, fw, fh - 3, col, 0.12, rnd); noise(c, bx, by + 1, bw, bh - 3, col, 0.12, rnd);
      P(c, fx + 1, fy + fh - 5, 2, 2, shadeNum(col, 0.75)); P(c, fx + fw - 3, fy + fh - 5, 2, 2, shadeNum(col, 0.75));
      P(c, fx + Math.floor(fw / 2) - 1, fy + 2, 2, 2, st.tc);
    } else if (classId === 'juggernaut') {
      for (let i = 0; i < fw; i++) { P(c, fx + i, fy + 1 + Math.floor(i * (fh - 4) / fw), 1, 2, i % 2 ? 0xc9a14a : 0x8a6a2a); P(c, bx + i, by + fh - 3 - Math.floor(i * (fh - 4) / fw), 1, 2, i % 2 ? 0xc9a14a : 0x8a6a2a); }
    } else if (classId === 'mechanic') {
      rows(h - 3, 2, 0x3a2e22); P(c, fx + 1, fy + h - 3, 2, 2, 0xc0a040); P(c, fx + fw - 3, fy + h - 3, 2, 2, 0x808890);
    } else if (classId === 'scout') {
      rows(h - 2, 1, 0x2a2a2a); P(c, fx + 2, fy + 2, 3, 3, 0xffffff); P(c, fx + 3, fy + 3, 1, 1, st.tc);
    } else if (classId === 'incinerator') {
      rows(5, 1, 0xa8862e); rows(h - 3, 2, 0x3a3a3a);
    }
    painted = true;
  } else if (part === 'leg') {
    rows(h - 4, 2, shadeNum(st.pants, 0.8));
    if (classId === 'mechanic' || classId === 'demolitionist') { const [fx, fy, fw] = L.front; P(c, fx, fy + 5, fw, 2, 0x2e2e2e); }
  } else if (part === 'head') {
    if (classId === 'scout' || classId === 'doctor') {
      const [fx, fy, fw] = L.front;
      for (let x = 0; x < fw; x++) { const n = classId === 'scout' ? 1 + Math.floor(rnd() * 2.2) : 1; P(c, fx + x, fy, 1, n, st.hair); }
      for (const f of ['right', 'left']) { const [x0, y0, ww] = L[f]; for (let x = 0; x < ww; x++) P(c, x0 + x, y0, 1, 2 + Math.floor(rnd() * 2), st.hair); }
      const [bx, by, bw] = L.back; for (let x = 0; x < bw; x++) P(c, bx + x, by, 1, 4 + Math.floor(rnd() * 2), st.hair);
      cap(st.hair);
      painted = true;
    }
  }
  if (!painted) return null;
  shadeAtlas(c, L, true);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, L };
}

function shadeNum(hexNum, f) {
  const r = Math.min(255, ((hexNum >> 16) & 255) * f), g = Math.min(255, ((hexNum >> 8) & 255) * f), b = Math.min(255, (hexNum & 255) * f);
  return (r << 16) | (g << 8) | b;
}

const overlayCache = new Map();
function overlayTexture(classId, team, part, dims) {
  const key = `${classId}|${team}|${part}`;
  if (!overlayCache.has(key)) overlayCache.set(key, paintOverlay(classId, team, part, dims));
  return overlayCache.get(key);
}

// Messy voxel hair (scout) / short cropped hair (doctor) sitting on top of the head.
function hairVoxels(classId, team, s, flatten) {
  const st = styleFor(classId, team);
  if (classId !== 'scout' && classId !== 'doctor') return null;
  const rnd = mulberry32(classId === 'scout' ? 4242 : 777);
  const cells = [];
  const base = st.hair;
  const col = (k) => shadeNum(base, k * (0.92 + rnd() * 0.16));
  const messy = classId === 'scout' && !flatten;
  for (let x = -1; x <= 8; x++) for (let z = -1; z <= 8; z++) {
    const ring = x === -1 || x === 8 || z === -1 || z === 8;
    const top = messy ? 1 + Math.floor(rnd() * 2.6) : 1;
    if (!ring || !messy || rnd() < 0.9) for (let y = 8; y < 8 + (ring ? Math.max(1, top - 1) : top); y++) cells.push({ x, y, z, c: col(1.05 + (y - 8) * 0.06) });
    if (ring) {
      // sides and back come down further; front only a ragged fringe
      const down = z === 8 ? (messy ? 4 + Math.floor(rnd() * 2) : 3) : z === -1 ? (messy && rnd() < 0.45 ? 2 : 0) : (messy ? 2 + Math.floor(rnd() * 2) : 2);
      for (let y = 8 - down; y < 8; y++) cells.push({ x, y, z, c: col(0.85) });
    }
  }
  // a few spikes sticking up / out
  if (messy) for (let i = 0; i < 7; i++) {
    const x = Math.floor(rnd() * 8), z = Math.floor(rnd() * 7);
    cells.push({ x, y: 11, z, c: col(1.2) });
    if (rnd() < 0.5) cells.push({ x, y: 12, z: z + 1, c: col(1.25) });
  }
  return voxelCells(cells, s, [-4 * s, 0, -4 * s]);
}

const texCache = new Map();
function partTexture(classId, team, part, dims, gloves) {
  const key = `${classId}|${team}|${part}|${gloves || ''}`;
  if (!texCache.has(key)) texCache.set(key, paintPart(classId, team, part, dims, gloves));
  return texCache.get(key);
}

// ---------------------------------------------------------------- class accessories (simple boxes in pixel units)
function accessories(classId, team, j, s, prop) {
  const tc = TEAM_COLORS_HEX[team], td = TEAM_DARK_HEX[team];
  const A = (parent, x, y, z, w, h, d, col, glow) => {
    const m = new THREE.Mesh(boxGeo(w * s, h * s, d * s), glow ? colorMat(col, { basic: true }) : colorMat(col));
    m.position.set(x * s, y * s, z * s);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const [bw, bh, bd] = prop.body;
  const hat = [];
  switch (classId) {
    case 'scout':
      A(j.head, 0, 4.6, -4.35, 8.8, 1.8, 0.7, 0x151515);
      A(j.head, -2, 4.55, -4.75, 2.8, 1.2, 0.15, 0x3f7fd6, true);
      A(j.head, 2, 4.55, -4.75, 2.8, 1.2, 0.15, 0x3f7fd6, true);
      A(j.head, -2.6, 4.85, -4.86, 0.8, 0.4, 0.1, 0xd8f0ff, true);
      A(j.head, 4.45, 4.6, -2.5, 0.5, 0.8, 4, 0x151515); A(j.head, -4.45, 4.6, -2.5, 0.5, 0.8, 4, 0x151515);
      A(j.torso, 0, bh * 0.6, bd / 2 + 1, 5, 6, 2, 0x3d454c);
      break;
    case 'spy':
      A(j.torso, 0, bh - 1, 0, bw + 0.4, 1, bd + 0.4, 0x1a1a1a);
      A(j.torso, bw / 2 + 0.2, bh * 0.35, 0, 0.6, 3, 2, 0x1a1a1a);
      break;
    case 'marksman':
      hat.push(A(j.head, 0, 8.3, 0, 11, 0.8, 11, 0x6a5a3e), A(j.head, 0, 9.2, 0, 8, 2, 8, 0x7a6a48), A(j.head, 0, 9.2, 0, 8.2, 0.6, 8.2, tc));
      A(j.torso, 0, bh * 0.55, bd / 2 + 1, 6, 7, 2, 0x5a4a30);
      A(j.torso, -bw / 2 - 0.2, bh * 0.3, 0, 0.5, 4, 3, 0x3a2a1a);
      break;
    case 'mechanic':
      hat.push(A(j.head, 0, 8.6, 0, 8.6, 2, 8.6, 0xe2b12a), A(j.head, 0, 8.2, -4.4, 8.6, 0.6, 2, 0xe2b12a), A(j.head, 0, 9.0, 0, 1.2, 2.4, 9, 0xc89a20));
      A(j.torso, 0, bh * 0.45, bd / 2 + 2, 7, 8, 4, 0x5a4a30);
      A(j.torso, 0, bh * 0.45 + 4.2, bd / 2 + 2, 7.2, 0.8, 4.2, tc);
      A(j.torso, 2.5, bh * 0.45 + 5.2, bd / 2 + 2, 1, 3, 1, 0x80868c);
      break;
    case 'doctor':
      A(j.head, 0, 7.1, 0, 8.7, 0.6, 8.7, 0x3a3a3a); A(j.head, -2.2, 7.1, -4.6, 2.4, 2.4, 0.5, 0xd8e8f0); A(j.head, -2.2, 7.1, -4.9, 1.2, 1.2, 0.1, 0xffffff, true); // head mirror
      A(j.head, 0, 4.4, -4.25, 7, 0.4, 0.5, 0x555555); A(j.head, -2, 4.0, -4.3, 2.6, 1.6, 0.4, 0x555555); A(j.head, 2, 4.0, -4.3, 2.6, 1.6, 0.4, 0x555555);
      A(j.head, -2, 4.0, -4.52, 1.8, 0.9, 0.05, 0xbfe6ff, true); A(j.head, 2, 4.0, -4.52, 1.8, 0.9, 0.05, 0xbfe6ff, true);
      A(j.torso, 0, bh * 0.5, bd / 2 + 1.8, 6, 8, 3.6, 0xe8ecef);
      A(j.torso, 0, bh * 0.5 + 1, bd / 2 + 3.7, 3, 3, 0.4, tc);
      A(j.torso, 0, bh * 0.5 + 1, bd / 2 + 3.75, 1, 3, 0.4, 0xffffff, true);
      A(j.torso, 0, bh * 0.5 + 1, bd / 2 + 3.75, 3, 1, 0.4, 0xffffff, true);
      // lower coat
      A(j.hips, 0, -3, 0, bw + 0.6, 6, bd + 0.6, 0xe8ecef);
      break;
    case 'juggernaut':
      hat.push(A(j.head, 0, 8.4, 0, 8.6, 1.4, 8.6, 0x5b5144), A(j.head, 0, 8.2, -4.3, 8.6, 0.8, 1, 0x4a4238));
      A(j.torso, 0, bh * 0.5, bd / 2 + 2.5, 9, 10, 5, 0x5b5144);
      A(j.torso, 0, bh * 0.5 + 5, bd / 2 + 2.5, 9.2, 1, 5.2, tc);
      A(j.torso, -bw / 2 - 1, bh - 1.5, 0, 2, 2, bd + 1, 0x3a3a3a); A(j.torso, bw / 2 + 1, bh - 1.5, 0, 2, 2, bd + 1, 0x3a3a3a);
      break;
    case 'incinerator':
      A(j.head, 0, 1, -4.6, 3, 3, 2, 0x2a2a2a); A(j.head, 0, 1, -5.8, 2, 2, 1, 0x555555);
      A(j.torso, -1.8, bh * 0.45, bd / 2 + 2, 3, 10, 3.4, 0xc8402f); A(j.torso, 1.8, bh * 0.45, bd / 2 + 2, 3, 10, 3.4, 0xc8402f);
      A(j.torso, 0, bh * 0.45 + 5.4, bd / 2 + 2, 6.4, 0.8, 3, 0x3a3a3a);
      A(j.torso, 0, bh * 0.45 + 1, bd / 2 + 3.8, 1.4, 1.4, 0.5, tc);
      break;
    case 'demolitionist':
      hat.push(A(j.head, 0, 8.6, 0, 8.8, 2.2, 8.8, tc), A(j.head, 0, 9.8, 0, 6, 0.8, 6, td), A(j.head, 0, 7.5, -4.5, 9, 0.5, 1.2, td));
      // safety goggles pushed up onto the helmet brim
      hat.push(A(j.head, 0, 8.1, -4.55, 8.4, 1.3, 0.7, 0x222222), A(j.head, -2, 8.1, -4.95, 2.4, 0.9, 0.15, 0xffb040, true), A(j.head, 2, 8.1, -4.95, 2.4, 0.9, 0.15, 0xffb040, true));
      A(j.torso, 0, bh * 0.5, bd / 2 + 2, 7, 9, 4, 0x3f4430);
      for (let i = 0; i < 3; i++) A(j.torso, -2 + i * 2, bh * 0.5 + 5, bd / 2 + 2, 1.4, 2.5, 1.4, 0xc8402f);
      A(j.torso, 0, bh * 0.5 - 4, bd / 2 + 4.1, 6, 1, 0.3, 0xe2b12a);
      break;
    default:
  }
  return hat;
}

function cosmeticsOn(j, s, cos, team, classHat) {
  if (!cos) return;
  const tc = TEAM_COLORS_HEX[team];
  const A = (parent, x, y, z, w, h, d, col, glow) => {
    const m = new THREE.Mesh(boxGeo(w * s, h * s, d * s), glow ? colorMat(col, { basic: true }) : colorMat(col));
    m.position.set(x * s, y * s, z * s);
    parent.add(m);
    return m;
  };
  if (cos.hat && cos.hat !== 'none') {
    for (const h of classHat) h.visible = false;
    switch (cos.hat) {
      case 'beanie': A(j.head, 0, 8.6, 0, 8.6, 2.4, 8.6, tc); A(j.head, 0, 10.2, 0, 2, 1, 2, 0xffffff); break;
      case 'cone': A(j.head, 0, 8.5, 0, 7, 1.2, 7, 0xff7a20); A(j.head, 0, 9.7, 0, 5, 2, 5, 0xff7a20); A(j.head, 0, 11.4, 0, 3, 1.6, 3, 0xffffff); A(j.head, 0, 12.6, 0, 2, 1.4, 2, 0xff7a20); break;
      case 'tophat': A(j.head, 0, 8.4, 0, 11, 0.6, 11, 0x1a1a1a); A(j.head, 0, 9, 0, 7, 6, 7, 0x1a1a1a); A(j.head, 0, 9.6, 0, 7.2, 1, 7.2, tc); break;
      case 'headphones': A(j.head, 0, 9, 0, 9, 1, 2, 0x2a2a2a); A(j.head, 4.6, 4.5, 0, 1.4, 3.4, 3.4, tc); A(j.head, -4.6, 4.5, 0, 1.4, 3.4, 3.4, tc); break;
      case 'horns': A(j.head, 0, 8.4, 0, 8.6, 1.6, 8.6, 0x8a8f96); A(j.head, 5, 9.4, 0, 2.4, 2, 2, 0xf0e8d0); A(j.head, 6, 11, 0, 1.6, 2.4, 1.6, 0xf0e8d0); A(j.head, -5, 9.4, 0, 2.4, 2, 2, 0xf0e8d0); A(j.head, -6, 11, 0, 1.6, 2.4, 1.6, 0xf0e8d0); break;
      case 'crown': A(j.head, 0, 8.4, 0, 8.6, 1.6, 8.6, 0xe8b830); for (const [x, z] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5], [0, -3.5]]) A(j.head, x, 10, z, 1.4, 1.6, 1.4, 0xe8b830); A(j.head, 0, 9, -4.35, 1.2, 1.2, 0.2, 0xd8384a, true); break;
      case 'halo': A(j.head, 0, 11, 0, 8, 0.6, 1.2, 0xfff28a, true); A(j.head, 0, 11, 0, 1.2, 0.6, 8, 0xfff28a, true); A(j.head, 3.4, 11, 3.4, 1.2, 0.6, 1.2, 0xfff28a, true); A(j.head, -3.4, 11, -3.4, 1.2, 0.6, 1.2, 0xfff28a, true); A(j.head, 3.4, 11, -3.4, 1.2, 0.6, 1.2, 0xfff28a, true); A(j.head, -3.4, 11, 3.4, 1.2, 0.6, 1.2, 0xfff28a, true); break;
      default:
    }
  }
  if (cos.mask && cos.mask !== 'none') {
    switch (cos.mask) {
      case 'bandana': A(j.head, 0, 1.5, -4.2, 8.4, 3, 0.4, tc); break;
      case 'shades': A(j.head, 0, 4.6, -4.25, 8.2, 1.4, 0.4, 0x111111); A(j.head, -2, 4.6, -4.4, 2, 1, 0.1, 0x4a6aa0, true); A(j.head, 2, 4.6, -4.4, 2, 1, 0.1, 0x4a6aa0, true); break;
      case 'visor': A(j.head, 0, 4.6, -4.3, 8.4, 1.6, 0.4, 0x3ff2ff, true); break;
      default:
    }
  }
  if (cos.accessory && cos.accessory !== 'none') {
    const bh = j.bodyH;
    switch (cos.accessory) {
      case 'scarf': A(j.torso, 0, bh - 0.5, 0, j.bodyW + 1.2, 2, j.bodyD + 1.2, tc); A(j.torso, 2, bh - 4, -j.bodyD / 2 - 0.6, 2, 5, 0.6, tc); break;
      case 'medals': for (let i = 0; i < 3; i++) A(j.torso, -2 + i * 1.6, bh - 4, -j.bodyD / 2 - 0.3, 1.2, 1.6, 0.4, [0xe8b830, 0xc0c0c8, 0xb07040][i]); break;
      case 'antenna': A(j.torso, -2, bh + 2, j.bodyD / 2 + 1, 0.5, 9, 0.5, 0x2a2a2a); A(j.torso, -2, bh + 7, j.bodyD / 2 + 1, 1, 1, 1, 0xff4040, true); break;
      default:
    }
  }
}

// ---------------------------------------------------------------- rig
const _qx = new THREE.Quaternion(), _qy = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0), _Y = new THREE.Vector3(0, 1, 0);
export class CharacterRig {
  constructor(classId, team, opts = {}) {
    this.classId = classId;
    this.team = team;
    this.opts = opts;
    this.root = new THREE.Group();
    this.anim = {
      phase: 0, legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0, armRz: 0, torsoX: 0, hipsY: 0, headX: 0,
      crouch: 0, air: 0, kick: 0, reload: 0, swing: -1, ability: 0, hurt: 0, land: 0, spin: 0, pose: null,
    };
    this.materials = [];
    this.build();
  }

  build() {
    const cls = getClass(this.classId);
    const prop = PROPORTIONS[this.classId] || PROPORTIONS.marksman;
    const totalPx = prop.head[1] + prop.body[1] + prop.leg[1];
    const s = prop.height / totalPx;
    this.scale = s;
    this.prop = prop;
    const gloves = this.opts.cosmetics?.gloves;
    const mk = (part, dims) => {
      const { tex, L } = partTexture(this.classId, this.team, part, dims, gloves);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      this.materials.push(mat);
      const m = new THREE.Mesh(atlasGeometry(dims[0], dims[1], dims[2], s, L), mat);
      m.castShadow = true;
      const ov = overlayTexture(this.classId, this.team, part, dims);
      if (ov) {
        const om = new THREE.MeshLambertMaterial({ map: ov.tex, alphaTest: 0.5 });
        this.materials.push(om);
        const o = new THREE.Mesh(atlasGeometry(dims[0] + 1, dims[1] + 1, dims[2] + 1, s, ov.L), om);
        o.castShadow = true;
        m.add(o);
      }
      return m;
    };
    const j = {};
    j.hips = new THREE.Group();
    j.hips.position.y = prop.leg[1] * s;
    this.root.add(j.hips);
    // legs
    const legX = (prop.body[0] / 2 - prop.leg[0] / 2) * s;
    j.legL = new THREE.Group(); j.legL.position.set(-legX, 0, 0);
    j.legR = new THREE.Group(); j.legR.position.set(legX, 0, 0);
    for (const L of [j.legL, j.legR]) { const m = mk('leg', prop.leg); m.position.y = -prop.leg[1] * s / 2; L.add(m); j.hips.add(L); }
    // torso
    j.torso = new THREE.Group();
    j.hips.add(j.torso);
    const body = mk('body', prop.body); body.position.y = prop.body[1] * s / 2; j.torso.add(body);
    j.head = new THREE.Group(); j.head.position.y = prop.body[1] * s;
    const head = mk('head', prop.head); head.position.y = prop.head[1] * s / 2; j.head.add(head);
    j.torso.add(j.head);
    const armY = (prop.body[1] - prop.arm[0] / 2) * s;
    const armX = (prop.body[0] / 2 + prop.arm[0] / 2) * s;
    j.armL = new THREE.Group(); j.armL.position.set(-armX, armY, 0);
    j.armR = new THREE.Group(); j.armR.position.set(armX, armY, 0);
    j.armL.rotation.order = 'YXZ'; j.armR.rotation.order = 'YXZ';
    for (const A of [j.armL, j.armR]) { const m = mk('arm', prop.arm); m.position.y = -(prop.arm[1] / 2 - prop.arm[0] / 2) * s; A.add(m); j.torso.add(A); }
    j.handR = new THREE.Group(); j.handR.position.y = -(prop.arm[1] - prop.arm[0] / 2 - 0.5) * s; j.armR.add(j.handR);
    j.bodyH = prop.body[1]; j.bodyW = prop.body[0]; j.bodyD = prop.body[2];
    this.j = j;
    this.classHat = accessories(this.classId, this.team, j, s, prop);
    const hatOn = !!(this.opts.cosmetics?.hat && this.opts.cosmetics.hat !== 'none');
    const hairGeo = hairVoxels(this.classId, this.team, s, hatOn);
    if (hairGeo) {
      const hair = new THREE.Mesh(hairGeo, VOXEL_MATERIAL);
      hair.castShadow = true;
      j.head.add(hair);
    }
    cosmeticsOn(j, s, this.opts.cosmetics, this.team, this.classHat);
    this.armLen = (prop.arm[1] - prop.arm[0] / 2) * s;
    // both hands converge on a point in front of the chest (rigid arms can't bend)
    const sx = armX, reachZ = Math.sqrt(Math.max(0.01, this.armLen ** 2 - (sx * 0.85) ** 2));
    const px = sx * 0.15;
    this.holdR = Math.atan2(sx - px, reachZ);
    this.holdL = Math.atan2(sx + px, reachZ);
    this.shoulderY = prop.leg[1] * s + armY;
    void cls;
  }

  setWeapon(weaponId, skin) {
    if (this.weaponId === weaponId && this.weaponSkin === skin) return;
    this.weaponId = weaponId;
    this.weaponSkin = skin;
    if (this.weapon) this.j.handR.remove(this.weapon);
    const w = buildWeapon(weaponId, { team: this.team, skin });
    const def = WEAPON_MODELS[weaponId];
    this.melee = !!def?.melee;
    this.twoHand = !!(def && !def.melee && Math.abs(def.muzzle3[2]) > 0.35);
    if (this.melee) { w.rotation.x = -Math.PI / 2; w.position.set(0, 0, 0); }
    else { w.rotation.x = -Math.PI / 2; w.position.set(0, 0, 0.02); }
    const sc = (this.classId === 'juggernaut' ? 1.15 : 1) * 1.3;
    w.scale.setScalar(sc);
    this.weapon = w;
    this.j.handR.add(w);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    if (!this.weapon) return this.root.getWorldPosition(out).setY(this.root.position.y + 1.4);
    return this.weapon.userData.muzzle.getWorldPosition(out);
  }

  // per-frame animation update. st: { speed, grounded, crouch, pitch, firing, reloading, swing, ability, spun, dead, vy }
  update(dt, st) {
    const a = this.anim, j = this.j;
    const set = getClass(this.classId).animSet;
    const heavy = set === 'heavy', light = set === 'light';
    const sp = st.speed || 0;
    const moving = sp > 0.4 && st.grounded;
    const running = sp > 6.5;
    const cadence = heavy ? 1.6 : light ? 2.4 : 2.0;
    a.phase += dt * (moving ? sp * cadence : 0);
    const amp = moving ? Math.min(1, sp / 7) * (heavy ? 0.55 : light ? 0.95 : 0.8) : 0;
    let legL = Math.sin(a.phase) * amp, legR = -legL;
    let armSwing = -legL * 0.6;
    const k = 14;
    a.crouch = damp(a.crouch, st.crouch ? 1 : 0, k, dt);
    a.air = damp(a.air, st.grounded ? 0 : 1, 10, dt);
    if (a.air > 0.05) { legL = -0.7 * a.air + (st.vy < 0 ? 0.3 : 0); legR = 0.35 * a.air; }
    if (a.crouch > 0.05) { legL = legL * 0.3 - 0.62 * a.crouch; legR = legR * 0.3 + 0.62 * a.crouch; }
    a.legL = damp(a.legL, legL, k, dt);
    a.legR = damp(a.legR, legR, k, dt);
    j.legL.rotation.x = a.legL;
    j.legR.rotation.x = a.legR;
    // hips height (crouch / landing squash / walking bob)
    a.land = Math.max(0, a.land - dt * 4);
    const bob = moving ? Math.abs(Math.sin(a.phase)) * 0.05 * (heavy ? 0.7 : 1) : Math.sin(performance.now() / 600) * 0.008;
    const baseHip = this.prop.leg[1] * this.scale;
    // keep feet on the ground: rigid legs swung by angle t reach baseHip*cos(t)
    const reach = Math.cos(Math.min(1.2, Math.max(Math.abs(a.legL), Math.abs(a.legR))));
    j.hips.position.y = baseHip * (1 - (a.crouch + a.land * 0.4) * (1 - reach)) + bob * (1 - a.crouch);
    // torso lean
    const lean = (running ? 0.18 : moving ? 0.08 : 0) + a.crouch * 0.35 + (heavy && st.spun ? 0.1 : 0);
    a.torsoX = damp(a.torsoX, -lean, 10, dt);
    j.torso.rotation.x = a.torsoX;
    j.head.rotation.x = Math.max(-0.7, Math.min(0.7, st.pitch || 0)) * 0.6 - a.torsoX * 0.5;

    // arms
    a.kick = Math.max(0, a.kick - dt * 6);
    a.hurt = Math.max(0, a.hurt - dt * 5);
    const pitch = (st.pitch || 0) - a.torsoX;
    let rx, lx, ly, lz = 0, rz = 0, ry = 0;
    if (st.dead) { rx = 0; lx = 0; ly = 0; }
    else if (a.pose) {
      [rx, lx, rz, lz] = poseAngles(a.pose, performance.now() / 1000);
      ly = 0;
    } else if (this.melee) {
      // melee: idle guard, swing arc when swinging
      rx = 0.9 + pitch * 0.5 + armSwing * 0.3;
      if (a.swing >= 0) {
        a.swing += dt;
        const t = Math.min(1, a.swing / 0.35);
        rx = t < 0.3 ? 2.6 * (t / 0.3) : 2.6 - (t - 0.3) / 0.7 * 2.2;
        if (t >= 1) a.swing = -1;
      }
      lx = 0.3 + armSwing; ly = 0; lz = -0.1;
    } else {
      rx = Math.PI / 2 + pitch - a.kick * 0.25;
      lx = Math.PI / 2 + pitch - a.kick * 0.15 - 0.08;
      ly = -this.holdL;
      lz = 0;
      ry = this.holdR;
      if (st.reloading) {
        a.reload += dt;
        lx = Math.PI / 2 + pitch - 0.6 + Math.sin(a.reload * 9) * 0.15;
        ly = -0.2;
        rx -= 0.25;
      } else a.reload = 0;
      if (!st.grounded && !st.firing) { lx += 0.2; rx += 0.1; }
    }
    if (a.ability > 0) { a.ability = Math.max(0, a.ability - dt); lx = 2.6; ly = 0.2; lz = -0.2; }
    a.armRx = damp(a.armRx, rx, 18, dt);
    a.armLx = damp(a.armLx, lx, 18, dt);
    j.armR.rotation.set(a.armRx, ry, rz);
    // cancel the arm's inward yaw on the weapon so it always points where the player aims:
    // hand = Rx(rx)^-1 * Ry(-ry) * Rx(rx)
    if (this.melee) j.handR.quaternion.identity();
    else {
      _qx.setFromAxisAngle(_X, a.armRx);
      _qy.setFromAxisAngle(_Y, -ry);
      j.handR.quaternion.copy(_qx).invert().multiply(_qy).multiply(_qx);
    }
    j.armL.rotation.set(a.armLx, ly, lz);
    if (this.weapon && this.weapon.userData.spin) {
      a.spin = damp(a.spin, st.spun ? (st.firing ? 30 : 12) : 0, 4, dt);
      this.weapon.userData.spin.rotation.z += a.spin * dt;
    }
    // hurt tint
    const em = a.hurt > 0 ? a.hurt * 0.6 : 0;
    if (em !== this._em) {
      this._em = em;
      for (const m of this.materials) m.emissive.setRGB(em, em * 0.15, em * 0.1);
    }
  }

  onFire() { this.anim.kick = 1; }
  onSwing() { this.anim.swing = 0; }
  onHurt() { this.anim.hurt = 1; }
  onLand() { this.anim.land = 1; }
  onAbility() { this.anim.ability = 0.6; }

  // world-space part meshes (for elimination gibs)
  partMeshes() {
    const out = [];
    this.root.updateMatrixWorld(true);
    this.root.traverse((o) => { if (o.isMesh) out.push(o); });
    return out;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    this.root.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' && o.material?.map) o.geometry.dispose(); });
  }
}

function poseAngles(pose, t) {
  switch (pose) {
    case 'flex': return [2.8 + Math.sin(t * 3) * 0.1, 2.8 - Math.sin(t * 3) * 0.1, 0.6, -0.6];
    case 'salute': return [2.6, 0.1, 0.9, 0];
    case 'cheer': return [3.0 + Math.sin(t * 8) * 0.3, 3.0 + Math.cos(t * 8) * 0.3, 0.3, -0.3];
    case 'dab': return [2.9, 1.2, 0.2, -1.2];
    default: return [0.2, 0.2, 0, 0];
  }
}

// First-person arm: same painted skin and sleeve overlay as the third-person model.
// Hand end at the origin, sleeve extends toward +Z (toward the camera).
export function buildArmMesh(classId, team, gloves, len) {
  const prop = PROPORTIONS[classId] || PROPORTIONS.marksman;
  const dims = prop.arm;
  const s = len / dims[1];
  const g = new THREE.Group();
  const { tex, L } = partTexture(classId, team, 'arm', dims, gloves);
  const mats = [];
  const base = new THREE.MeshLambertMaterial({ map: tex });
  mats.push(base);
  const m = new THREE.Mesh(atlasGeometry(dims[0], dims[1], dims[2], s, L), base);
  const ov = overlayTexture(classId, team, 'arm', dims);
  if (ov) {
    const om = new THREE.MeshLambertMaterial({ map: ov.tex, alphaTest: 0.5 });
    mats.push(om);
    m.add(new THREE.Mesh(atlasGeometry(dims[0] + 1, dims[1] + 1, dims[2] + 1, s, ov.L), om));
  }
  m.rotation.x = Math.PI / 2;
  m.position.z = len / 2 - dims[0] * s * 0.3;
  // slimmer cross-section in first person so the arm frames the weapon instead of covering it
  g.scale.set(0.5, 0.5, 1);
  g.add(m);
  g.userData.thick = dims[0] * s * 0.5;
  return g;
}

export { PROPORTIONS };
