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
import { attachCosmetics, gloveSpec } from './CosmeticModels.js';
import { getItem } from '../../shared/config/cosmetics.js';
import { TEAM_COLORS_HEX, TEAM_DARK_HEX } from '../../shared/constants.js';
import { getClass } from '../../shared/config/classes.js';
import { mulberry32, damp } from '../../shared/math.js';

// ---------------------------------------------------------------- body proportions (pixels)
const PROPORTIONS = {
  scout: { head: [8, 8, 8], body: [7, 11, 4], arm: [3, 11, 3], leg: [3, 13, 3], height: 1.8 },
  spy: { head: [8, 8, 8], body: [7, 12, 4], arm: [3, 12, 3], leg: [3, 12, 3], height: 1.82 },
  marksman: { head: [8, 8, 8], body: [8, 12, 4], arm: [3, 12, 3], leg: [3, 13, 3], height: 1.88 },
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
    scout: { skin: 0xecb48e, hair: 0x5a3a22, shirt: tc, pants: 0x5c5850, boots: 0x262628, sleeve: tc, vest: 0x5a4632 },
    spy: { skin: 0xd9a27c, hair: 0x2a2a2a, shirt: team ? 0x384660 : 0x5e3c36, pants: team ? 0x384660 : 0x5e3c36, boots: 0x141414, sleeve: team ? 0x384660 : 0x5e3c36, vest: td, mask: team ? 0x24365a : 0x6e2622, tie: team ? 0x1f3a6a : 0x7a1f1c, stripe: team ? 0x4c5c7a : 0x77524b },
    marksman: { skin: 0xd59a72, hair: 0x5a3e26, shirt: team ? 0x7fb0d8 : 0xcf7466, pants: 0x4a5466, boots: 0x5a3a24, sleeve: team ? 0x7fb0d8 : 0xcf7466, vest: 0x4a3a2c },
    mechanic: { skin: 0xdca47e, hair: 0x6a4a2a, shirt: team ? 0x5a86ba : 0xc4584a, pants: 0x3e3028, boots: 0x5a4030, sleeve: team ? 0x5a86ba : 0xc4584a, vest: 0x4a3a32 },
    doctor: { skin: 0xf0c8a6, hair: 0x2c2622, shirt: 0xe6e2d8, pants: 0x4a3632, boots: 0x1a1a1a, sleeve: 0xe6e2d8, vest: tc, glove: team ? 0x4a7ad0 : 0xd8382e },
    juggernaut: { skin: 0xd29a74, hair: 0xd29a74, shirt: team ? 0x4a72a8 : 0xb2443a, pants: 0x56554a, boots: 0x2a2622, sleeve: team ? 0x4a72a8 : 0xb2443a, vest: 0x33352f },
    incinerator: { skin: 0x26262a, hair: 0x26262a, shirt: team ? 0x4a6e9e : 0xa8443a, pants: team ? 0x4a6e9e : 0xa8443a, boots: 0x1e1e20, sleeve: team ? 0x4a6e9e : 0xa8443a, vest: 0x232323, mask: 0x222224 },
    demolitionist: { skin: 0x6e4630, hair: 0x1c1c1e, shirt: team ? 0x41679a : 0xa23a32, pants: team ? 0x41679a : 0xa23a32, boots: 0x2a2420, sleeve: team ? 0x41679a : 0xa23a32, vest: 0x3a3c3e },
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
  const gs = gloveSpec(gloves, team);
  const glove = gs ? gs.main : null;

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
  if (SIGNATURE.has(classId)) signaturePaint(classId, part, c, L, st, rnd, dims, glove);
  if (part === 'arm' && gs) {
    const gh = classId === 'spy' ? 2 : 3;
    if (gs.cuff != null) band(h - gh - 1, 1, gs.cuff);
    if (gs.stripe != null) band(h - 2, 1, gs.stripe);
  }
  shadeAtlas(c, L, false);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, L };
}


// Hand-tuned looks for the Scout (cap, headset, tee, satchel, wraps, socks), Spy (pinstripe suit, balaclava),
// Marksman (slouch hat, amber shades, open vest over a rolled-sleeve shirt, jeans) and Demolitionist
// (knit cap, eye patch, armoured vest with grenade pods, rolled undershirt, gaiters).
const SIGNATURE = new Set(['scout', 'spy', 'marksman', 'demolitionist', 'incinerator', 'juggernaut', 'mechanic', 'doctor']);
function signaturePaint(classId, part, c, L, st, rnd, dims, glove) {
  const [w, h] = dims;
  const sides = ['right', 'front', 'left', 'back'];
  const fill = (col, amt = 0.07) => { for (const f of ['top', 'bottom', ...sides]) { const [x, y, fw, fh] = L[f]; noise(c, x, y, fw, fh, col, amt, rnd); } };
  const rows = (y0, n, col, which = sides) => { for (const f of which) { const [x, y, fw] = L[f]; noise(c, x, y + y0, fw, n, col, 0.07, rnd); } };
  const pin = (y0, y1) => { for (const f of sides) { const [x, y, fw] = L[f]; for (let i = 1; i < fw; i += 2) P(c, x + i, y + y0, 1, y1 - y0, st.stripe); } };
  const [fx, fy, fw, fh] = L.front;
  const [bx, by, bw] = L.back;
  if (classId === 'scout') {
    if (part === 'head') {
      fill(st.skin, 0.05);
      const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.hair, 0.15, rnd);
      noise(c, bx, by, bw, 3, st.hair, 0.15, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y, ww, 2, st.hair, 0.15, rnd); P(c, x + ww - 2, y + 2, 1, 1, st.hair); }
      P(c, fx, fy, fw, 1, st.hair);
      P(c, fx + 1, fy + 2, 2, 1, '#5a3a22'); P(c, fx + 5, fy + 2, 2, 1, '#5a3a22');
      P(c, fx + 1, fy + 3, 2, 1, '#f4f1ea'); P(c, fx + 5, fy + 3, 2, 1, '#f4f1ea');
      P(c, fx + 2, fy + 3, 1, 1, '#3d6fb8'); P(c, fx + 5, fy + 3, 1, 1, '#3d6fb8');
      P(c, fx + 3, fy + 4, 2, 1, hex(shadeNum(st.skin, 0.84)));
      P(c, fx + 3, fy + 6, 3, 1, '#9a4e3c'); P(c, fx + 6, fy + 5, 1, 1, '#9a4e3c');
    } else if (part === 'body') {
      fill(st.shirt);
      rows(h - 2, 1, 0x1e1e1e); P(c, fx + Math.floor(fw / 2) - 1, fy + h - 2, 2, 1, '#b8bcc2');
      rows(h - 1, 1, st.pants);
      // dog tags on a chain
      P(c, fx + 2, fy + 1, 1, 1, '#9aa0a6'); P(c, fx + 4, fy + 1, 1, 1, '#9aa0a6'); P(c, fx + 3, fy + 2, 1, 1, '#9aa0a6'); P(c, fx + 3, fy + 3, 1, 2, '#d6dadf');
      // satchel strap: shoulder to opposite hip, front and back
      for (let i = 0; i < h - 2; i++) { const x = Math.round((fw - 1) - (i * (fw - 1)) / (h - 3)); P(c, fx + x, fy + i, 1, 1, '#4a3826'); P(c, bx + (bw - 1 - x), by + i, 1, 1, '#4a3826'); }
    } else if (part === 'arm') {
      fill(st.skin, 0.05);
      rows(0, 3, st.shirt); const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.shirt, 0.07, rnd);
      const wrap = glove ?? 0xeeebe2;
      rows(h - 3, 3, wrap); const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, wrap, 0.05, rnd);
      rows(h - 2, 1, shadeNum(wrap, 0.82));
    } else if (part === 'leg') {
      fill(st.pants);
      rows(7, 1, shadeNum(st.pants, 0.78));
      rows(8, 3, 0xe6e6e2);
      rows(h - 2, 2, st.boots); rows(h - 1, 1, 0xd8d8d4, ['front']);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
      rows(0, 1, 0x1e1e1e);
    }
  } else if (classId === 'spy') {
    if (part === 'head') {
      fill(st.mask, 0.08);
      // face opening of the balaclava
      noise(c, fx + 1, fy + 2, 6, 5, st.skin, 0.05, rnd);
      P(c, fx + 1, fy + 2, 1, 1, hex(st.mask)); P(c, fx + 6, fy + 2, 1, 1, hex(st.mask)); P(c, fx + 1, fy + 6, 1, 1, hex(st.mask)); P(c, fx + 6, fy + 6, 1, 1, hex(st.mask));
      P(c, fx + 1, fy + 2, 2, 1, hex(shadeNum(st.mask, 0.7))); P(c, fx + 5, fy + 2, 2, 1, hex(shadeNum(st.mask, 0.7)));
      // eyes spaced like the Scout's: two-pixel whites at the edges of the opening, irises inside
      P(c, fx + 1, fy + 3, 2, 1, '#f2efe6'); P(c, fx + 5, fy + 3, 2, 1, '#f2efe6');
      P(c, fx + 2, fy + 3, 1, 1, '#5a3a20'); P(c, fx + 5, fy + 3, 1, 1, '#5a3a20');
      P(c, fx + 3, fy + 4, 2, 1, hex(shadeNum(st.skin, 0.82)));
      P(c, fx + 3, fy + 5, 2, 1, '#8a4a3a');
      P(c, fx + 2, fy + 1, 4, 1, hex(shadeNum(st.mask, 0.85)));
    } else if (part === 'body') {
      fill(st.shirt);
      pin(0, h);
      // shirt V, tie, lapels, buttons, pocket square
      const mid = Math.floor(fw / 2);
      for (let y = 0; y < 6; y++) { const half = y < 4 ? 1 : 0; P(c, fx + mid - half, fy + y, 1 + half * 2, 1, '#eeece6'); }
      P(c, fx + mid, fy + 1, 1, 6, hex(st.tie)); P(c, fx + mid, fy, 1, 1, hex(shadeNum(st.tie, 0.8)));
      P(c, fx + mid - 2, fy, 1, 6, hex(shadeNum(st.shirt, 0.72))); P(c, fx + mid + 2, fy, 1, 6, hex(shadeNum(st.shirt, 0.72)));
      P(c, fx + mid, fy + 8, 1, 1, '#1a1a1a'); P(c, fx + mid, fy + 10, 1, 1, '#1a1a1a');
      P(c, fx + 1, fy + 4, 1, 1, '#eeece6');
      P(c, bx + Math.floor(bw / 2), by + 6, 1, h - 6, hex(shadeNum(st.shirt, 0.8)));
    } else if (part === 'arm') {
      fill(st.sleeve);
      pin(0, h - 3);
      rows(h - 3, 1, 0xeeece6);
      const gl = glove ?? 0x161616;
      rows(h - 2, 2, gl); const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, gl, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants);
      pin(0, h - 2);
      rows(h - 2, 2, st.boots); rows(h - 2, 1, 0x2e2e2e, ['front']);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
    }
  } else if (classId === 'marksman') {
    if (part === 'head') {
      fill(st.skin, 0.05);
      // short hair at the back and sides (the hat covers the top), sideburns
      noise(c, bx, by, bw, 5, st.hair, 0.15, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y, ww, 3, st.hair, 0.15, rnd); P(c, x + (f === 'right' ? 0 : ww - 1), y + 3, 1, 2, hex(st.hair)); }
      const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.hair, 0.15, rnd);
      P(c, fx + 1, fy + 2, 2, 1, hex(shadeNum(st.hair, 0.8))); P(c, fx + 5, fy + 2, 2, 1, hex(shadeNum(st.hair, 0.8)));
      P(c, fx + 1, fy + 3, 2, 1, '#f2efe6'); P(c, fx + 5, fy + 3, 2, 1, '#f2efe6');
      P(c, fx + 2, fy + 3, 1, 1, '#4a3420'); P(c, fx + 5, fy + 3, 1, 1, '#4a3420');
      P(c, fx + 3, fy + 4, 2, 2, hex(shadeNum(st.skin, 0.86)));
      // stubbled jaw, thin mouth
      noise(c, fx + 1, fy + 6, 6, 2, shadeNum(st.skin, 0.72), 0.18, rnd);
      P(c, fx + 2, fy + 6, 4, 1, '#7a3e2e');
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y + 6, ww, 2, shadeNum(st.skin, 0.78), 0.15, rnd); }
    } else if (part === 'body') {
      fill(st.shirt, 0.06);
      // shirt buttons down the open front, collar, belt with buckle
      const mid = Math.floor(fw / 2);
      for (let y = 2; y < h - 3; y += 2) P(c, fx + mid, fy + y, 1, 1, hex(shadeNum(st.shirt, 0.7)));
      P(c, fx + mid - 1, fy, 3, 1, hex(shadeNum(st.shirt, 1.12)));
      rows(h - 3, 1, 0x3a2618); P(c, fx + mid - 1, fy + h - 3, 2, 1, '#c9a14a');
      rows(h - 2, 2, st.pants);
    } else if (part === 'arm') {
      fill(st.skin, 0.05);
      rows(0, 6, st.sleeve); const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.sleeve, 0.06, rnd);
      rows(5, 1, shadeNum(st.sleeve, 1.12));
      // wristwatch and fingerless gloves
      rows(h - 4, 1, 0x3a3a3a); P(c, L.front[0] + 1, L.front[1] + h - 4, 1, 1, '#d8dcdf');
      const gl = glove ?? 0x5a3e28;
      rows(h - 3, 2, gl); rows(h - 1, 1, st.skin);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.skin, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants, 0.07);
      // jeans seams, knee wear, cuffs over brown boots
      for (const f of ['right', 'left']) { const [x, y] = L[f]; P(c, x + 1, y, 1, h - 3, hex(shadeNum(st.pants, 0.82))); }
      noise(c, fx, fy + 6, fw, 2, shadeNum(st.pants, 1.12), 0.1, rnd);
      rows(h - 4, 1, shadeNum(st.pants, 0.78));
      rows(h - 3, 3, st.boots); rows(h - 1, 1, shadeNum(st.boots, 0.6));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, shadeNum(st.boots, 0.6), 0.05, rnd);
    }
  } else if (classId === 'demolitionist') {
    if (part === 'head') {
      fill(st.skin, 0.05);
      // knit cap low on the brow (the voxel cap sits on top), eye patch with strap, stubble
      const capC = 0x1e1e20;
      for (const f of sides) { const [x, y, ww] = L[f]; noise(c, x, y, ww, 2, capC, 0.12, rnd); }
      const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, capC, 0.12, rnd);
      P(c, fx + 1, fy + 3, 2, 1, '#f2efe6'); P(c, fx + 2, fy + 3, 1, 1, '#2a1a10');
      P(c, fx + 1, fy + 2, 2, 1, '#1a120c');
      P(c, fx + 5, fy + 2, 2, 2, '#121212'); P(c, fx + 6, fy + 2, 1, 1, '#2a2a2a');
      P(c, fx + 7, fy + 2, 1, 1, '#121212'); P(c, fx + 4, fy + 2, 1, 1, '#121212'); P(c, fx + 3, fy + 2, 1, 1, '#121212');
      { const [x, y] = L.right; P(c, x, y + 2, L.right[2], 1, '#121212'); }
      { const [x, y, ww] = L.left; P(c, x, y + 2, ww, 1, '#121212'); }
      P(c, bx, by + 2, bw, 1, '#121212');
      P(c, fx + 3, fy + 4, 2, 1, hex(shadeNum(st.skin, 0.8)));
      noise(c, fx + 1, fy + 5, 6, 3, shadeNum(st.skin, 0.62), 0.2, rnd);
      P(c, fx + 2, fy + 6, 4, 1, '#3a1e14'); P(c, fx + 3, fy + 6, 2, 1, '#5a2a1e');
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y + 5, ww, 3, shadeNum(st.skin, 0.66), 0.18, rnd); }
    } else if (part === 'body') {
      fill(st.shirt, 0.06);
      rows(h - 2, 2, st.pants);
    } else if (part === 'arm') {
      fill(0xd8ccb2, 0.06);
      // team sleeve over a long cream undershirt; bare dark hands
      rows(0, 5, st.sleeve); const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.sleeve, 0.06, rnd);
      rows(4, 1, shadeNum(st.sleeve, 0.78));
      const hand = glove ?? st.skin;
      rows(h - 3, 3, hand); rows(h - 3, 1, shadeNum(0xd8ccb2, 0.82));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, hand, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants, 0.07);
      // baggy trousers tucked into grey gaiters over dark boots
      rows(h - 6, 1, shadeNum(st.pants, 0.75));
      rows(h - 5, 3, 0x55585c); rows(h - 5, 1, 0x6a6e72);
      rows(h - 2, 2, st.boots); rows(h - 1, 1, shadeNum(st.boots, 0.7));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
    }
  } else if (classId === 'incinerator') {
    const suit = st.shirt, rubber = 0x1e1e20, cuff = 0x6a4a32;
    if (part === 'head') {
      // full black gas mask: two round pale lenses, seams, strap rings
      fill(st.mask, 0.07);
      for (const ex of [1, 5]) {
        P(c, fx + ex, fy + 2, 2, 2, '#d6dedd'); P(c, fx + ex, fy + 2, 1, 1, '#ffffff'); P(c, fx + ex + 1, fy + 3, 1, 1, '#9aa6a6');
      }
      P(c, fx + 3, fy + 4, 2, 1, hex(shadeNum(st.mask, 1.5)));
      P(c, fx, fy + 1, fw, 1, hex(shadeNum(st.mask, 1.3)));
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; P(c, x, y + 3, ww, 1, hex(shadeNum(st.mask, 1.4))); P(c, x + Math.floor(ww / 2), y + 3, 1, 1, '#6a6e72'); }
      P(c, bx, by + 3, bw, 1, hex(shadeNum(st.mask, 1.4)));
    } else if (part === 'body') {
      fill(suit, 0.08);
      // harness straps over the shoulders down to the belt, belt, rubber wrinkles
      P(c, fx + 1, fy, 1, h - 4, '#232323'); P(c, fx + fw - 2, fy, 1, h - 4, '#232323');
      P(c, fx + 1, fy + 6, fw - 2, 1, '#232323');
      for (let i = 0; i < h - 4; i++) { const x = Math.round((i * (bw - 1)) / (h - 5)); P(c, bx + x, by + i, 1, 1, '#232323'); P(c, bx + bw - 1 - x, by + i, 1, 1, '#232323'); }
      rows(h - 4, 2, 0x1c1c1c); P(c, fx + Math.floor(fw / 2) - 1, fy + h - 4, 2, 2, '#4a4c4e');
      rows(h - 2, 2, st.pants);
      noise(c, fx + 2, fy + 8, fw - 4, 1, shadeNum(suit, 0.82), 0.1, rnd);
    } else if (part === 'arm') {
      fill(suit, 0.08);
      // elbow-length rubber gauntlets with a leather cuff
      const g = glove ?? rubber;
      rows(5, h - 5, g); rows(5, 1, cuff); rows(6, 1, shadeNum(cuff, 0.7));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, g, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants, 0.08);
      rows(h - 6, 1, shadeNum(st.pants, 0.78)); rows(h - 5, 1, shadeNum(st.pants, 1.1));
      rows(h - 4, 4, st.boots); rows(h - 4, 1, 0x2e2e30);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
    }
  } else if (classId === 'juggernaut') {
    if (part === 'head') {
      // bald, heavy brow, broad grin
      fill(st.skin, 0.05);
      const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, shadeNum(st.skin, 1.06), 0.04, rnd);
      P(c, fx + 1, fy + 2, 2, 1, '#5a3a24'); P(c, fx + 5, fy + 2, 2, 1, '#5a3a24'); P(c, fx + 3, fy + 2, 2, 1, hex(shadeNum(st.skin, 0.8)));
      P(c, fx + 1, fy + 3, 2, 1, '#f2efe6'); P(c, fx + 5, fy + 3, 2, 1, '#f2efe6');
      P(c, fx + 2, fy + 3, 1, 1, '#2a2a2a'); P(c, fx + 5, fy + 3, 1, 1, '#2a2a2a');
      P(c, fx + 3, fy + 4, 2, 1, hex(shadeNum(st.skin, 0.82)));
      P(c, fx + 1, fy + 5, 6, 2, '#4a2418'); P(c, fx + 2, fy + 5, 4, 1, '#f4f0e4');
      P(c, fx + 2, fy + 7, 4, 1, hex(shadeNum(st.skin, 0.85)));
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; P(c, x + Math.floor(ww / 2), y + 3, 1, 2, hex(shadeNum(st.skin, 0.85))); }
    } else if (part === 'body') {
      fill(st.shirt, 0.07);
      const mid = Math.floor(fw / 2);
      P(c, fx + mid - 1, fy, 2, 2, '#e8e4da'); P(c, fx + mid - 2, fy, 1, 1, '#e8e4da'); P(c, fx + mid + 1, fy, 1, 1, '#e8e4da');
      rows(h - 3, 1, 0x4a3e32); P(c, fx + mid - 1, fy + h - 3, 3, 1, '#8a8478');
      rows(h - 2, 2, st.pants);
    } else if (part === 'arm') {
      fill(st.skin, 0.05);
      rows(0, 4, st.sleeve); const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.sleeve, 0.06, rnd);
      rows(3, 1, shadeNum(st.sleeve, 0.8));
      // forearm shading, fingerless gloves
      rows(6, 1, shadeNum(st.skin, 0.9));
      const g = glove ?? 0x1e1e1e;
      rows(h - 3, 2, g); rows(h - 1, 1, st.skin);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.skin, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants, 0.07);
      noise(c, fx, fy + 5, fw, 2, shadeNum(st.pants, 1.1), 0.1, rnd);
      rows(h - 5, 1, shadeNum(st.pants, 0.75));
      rows(h - 3, 3, st.boots); rows(h - 1, 1, shadeNum(st.boots, 0.7));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
    }
  } else if (classId === 'mechanic') {
    if (part === 'head') {
      fill(st.skin, 0.05);
      noise(c, bx, by, bw, 5, st.hair, 0.15, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y, ww, 3, st.hair, 0.15, rnd); }
      const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.hair, 0.15, rnd);
      P(c, fx + 3, fy + 5, 2, 1, hex(shadeNum(st.skin, 0.82)));
      noise(c, fx + 1, fy + 6, 6, 2, shadeNum(st.skin, 0.74), 0.16, rnd);
      P(c, fx + 2, fy + 6, 4, 1, '#6a3a2a');
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y + 6, ww, 2, shadeNum(st.skin, 0.8), 0.12, rnd); }
    } else if (part === 'body') {
      fill(st.shirt, 0.07);
      const mid = Math.floor(fw / 2);
      // collar points and buttons (the bib overlay covers the middle)
      P(c, fx + mid - 2, fy, 2, 1, hex(shadeNum(st.shirt, 1.15))); P(c, fx + mid + 1, fy, 2, 1, hex(shadeNum(st.shirt, 1.15)));
      for (let y = 1; y < 4; y++) P(c, fx + mid, fy + y, 1, 1, hex(shadeNum(st.shirt, 0.7)));
      rows(h - 2, 2, st.pants);
    } else if (part === 'arm') {
      fill(st.skin, 0.05);
      rows(0, 6, st.sleeve); const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.sleeve, 0.06, rnd);
      rows(5, 1, shadeNum(st.sleeve, 1.14));
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; P(c, x + Math.floor(ww / 2) - 1, y + 1, 2, 2, '#e4b03a'); P(c, x + Math.floor(ww / 2), y + 2, 1, 1, '#8a5a1a'); }
      if (glove != null) rows(h - 3, 3, glove);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, glove ?? st.skin, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants, 0.07);
      for (const f of ['right', 'left']) { const [x, y] = L[f]; P(c, x + 1, y, 1, h - 3, hex(shadeNum(st.pants, 0.8))); }
      rows(h - 3, 3, st.boots); rows(h - 1, 1, shadeNum(st.boots, 0.65));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
    }
  } else if (classId === 'doctor') {
    if (part === 'head') {
      fill(st.skin, 0.05);
      // slicked-back dark hair with a side part
      const [tx, ty, tw, th] = L.top; noise(c, tx, ty, tw, th, st.hair, 0.12, rnd);
      noise(c, bx, by, bw, 4, st.hair, 0.12, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y, ww, 2, st.hair, 0.12, rnd); P(c, x + (f === 'right' ? 0 : ww - 1), y + 2, 1, 2, hex(st.hair)); }
      P(c, fx, fy, fw, 1, hex(st.hair)); P(c, fx + 5, fy + 1, 3, 1, hex(st.hair));
      P(c, fx + 1, fy + 2, 2, 1, hex(shadeNum(st.hair, 1.3))); P(c, fx + 5, fy + 2, 2, 1, hex(shadeNum(st.hair, 1.3)));
      P(c, fx + 1, fy + 3, 2, 1, '#f2efe6'); P(c, fx + 5, fy + 3, 2, 1, '#f2efe6');
      P(c, fx + 2, fy + 3, 1, 1, '#3a5a7a'); P(c, fx + 5, fy + 3, 1, 1, '#3a5a7a');
      P(c, fx + 3, fy + 4, 2, 2, hex(shadeNum(st.skin, 0.86)));
      P(c, fx + 2, fy + 6, 4, 1, '#9a5848'); P(c, fx + 5, fy + 6, 1, 1, '#7a4030');
    } else if (part === 'body') {
      fill(st.shirt, 0.05);
      // white shirt, team tie, coat buttons
      const mid = Math.floor(fw / 2);
      for (let y = 0; y < 6; y++) { const half = y < 4 ? 1 : 0; P(c, fx + mid - half, fy + y, 1 + half * 2, 1, '#fbfaf6'); }
      P(c, fx + mid, fy + 1, 1, 5, hex(st.tc)); P(c, fx + mid, fy, 1, 1, hex(shadeNum(st.tc, 0.8)));
      P(c, fx + mid - 2, fy, 1, 7, hex(shadeNum(st.shirt, 0.8))); P(c, fx + mid + 2, fy, 1, 7, hex(shadeNum(st.shirt, 0.8)));
      for (let y = 7; y < h; y += 2) P(c, fx + mid + 1, fy + y, 1, 1, '#b8b4aa');
      P(c, bx + Math.floor(bw / 2), by + 4, 1, h - 4, hex(shadeNum(st.shirt, 0.85)));
    } else if (part === 'arm') {
      fill(st.sleeve, 0.05);
      // coat sleeve, cross patch, long rubber gloves
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; const cx = x + Math.floor(ww / 2); P(c, cx - 1, y + 2, 3, 1, hex(st.tc)); P(c, cx, y + 1, 1, 3, hex(st.tc)); }
      const g = glove ?? st.glove;
      rows(h - 4, 4, g); rows(h - 4, 1, shadeNum(g, 1.15));
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, g, 0.05, rnd);
    } else if (part === 'leg') {
      fill(st.pants, 0.07);
      rows(h - 5, 5, st.boots); rows(h - 5, 1, 0x2e2e2e);
      const [ox, oy, ow, oh] = L.bottom; noise(c, ox, oy, ow, oh, st.boots, 0.05, rnd);
    }
  }
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
    scout: [3, st.shirt], spy: [h - 3, st.sleeve], marksman: [6, st.sleeve], mechanic: [6, st.sleeve], doctor: [h - 4, st.shirt],
    juggernaut: [4, st.sleeve], incinerator: [5, st.sleeve], demolitionist: [5, st.sleeve],
  }[classId];
  if (part === 'arm') {
    const [n, col] = sleeve;
    rows(0, n, col); cap(col);
    rows(n - 1, 1, shadeNum(col, 0.72));
    if (classId === 'spy') { rows(n - 1, 1, 0xeeece6); for (const f of sides) { const [x, y, fw] = L[f]; for (let i = 1; i < fw; i += 2) P(c, x + i, y, 1, n - 1, st.stripe); } }
    if (classId === 'incinerator') { const g = 0x1e1e20; rows(h - 6, 6, g); cap(g, 'bottom'); rows(h - 6, 1, 0x6a4a32); }
    if (classId === 'mechanic') rows(n - 1, 1, shadeNum(col, 1.14));
    if (classId === 'marksman') {
      rows(n - 1, 1, shadeNum(col, 1.14));
      // round shoulder patch on the outer sides
      for (const f of ['right', 'left']) { const [x, y, fw] = L[f]; P(c, x + Math.floor(fw / 2) - 1, y + 1, 2, 2, 0xe4c25a); P(c, x + Math.floor(fw / 2), y + 1, 1, 1, 0xf2dc8a); }
    }
  } else if (part === 'body') {
    rows(0, 1, shadeNum(st.shirt, 0.85));
    const [fx, fy, fw, fh] = L.front;
    const [bx, by, bw, bh] = L.back;
    if (classId === 'doctor' || classId === 'spy') {
      const col = st.shirt;
      rows(0, h, col, ['right', 'left', 'back']); cap(col);
      if (classId === 'spy') {
        // jacket front closes below the V; lapels in a darker shade; pinstripes everywhere
        noise(c, fx, fy, fw, fh, col, 0.06, rnd);
        const mid = Math.floor(fw / 2);
        for (let y = 0; y < 7; y++) { const half = y < 4 ? 1 : 0; c.clearRect(fx + mid - half, fy + y, 1 + half * 2, 1); }
        P(c, fx + mid - 2, fy, 1, 6, shadeNum(col, 0.66)); P(c, fx + mid + 2, fy, 1, 6, shadeNum(col, 0.66));
        for (const f of sides) { const [x, y, ww, hh] = L[f]; for (let i = 1; i < ww; i += 2) for (let yy = 0; yy < hh; yy++) { const id = c.getImageData(x + i, y + yy, 1, 1).data; if (id[3] > 0) P(c, x + i, y + yy, 1, 1, st.stripe); } }
        P(c, fx + mid, fy + 8, 1, 1, 0x161616); P(c, fx + mid, fy + 10, 1, 1, 0x161616); P(c, fx + 1, fy + 4, 1, 1, 0xeeece6);
      } else {
        noise(c, fx, fy, 2, fh, col, 0.1, rnd); noise(c, fx + fw - 2, fy, 2, fh, col, 0.1, rnd);
        P(c, fx + 2, fy, 1, 3, shadeNum(col, 0.7)); P(c, fx + fw - 3, fy, 1, 3, shadeNum(col, 0.7));
      }
      if (classId === 'doctor') { P(c, fx + 1, fy + 8, 1, 1, 0xb8b4aa); P(c, fx + fw - 2, fy + 8, 1, 1, 0xb8b4aa); }
    } else if (classId === 'marksman') {
      // open brown vest: two front panels with pockets and a cartridge loop row, full back, leather strap
      const col = st.vest;
      const pw = Math.floor(fw / 2) - 1;
      noise(c, fx, fy, pw, fh - 3, col, 0.1, rnd); noise(c, fx + fw - pw, fy, pw, fh - 3, col, 0.1, rnd);
      noise(c, bx, by, bw, bh - 3, col, 0.1, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y, ww, fh - 3, col, 0.1, rnd); }
      cap(col);
      P(c, fx + pw - 1, fy, 1, fh - 3, shadeNum(col, 0.7)); P(c, fx + fw - pw, fy, 1, fh - 3, shadeNum(col, 0.7));
      P(c, fx, fy + 6, pw - 1, 2, shadeNum(col, 0.8)); P(c, fx + fw - pw + 1, fy + 6, pw - 1, 2, shadeNum(col, 0.8));
      for (let i = 0; i < pw - 1; i++) { P(c, fx + i, fy + 2, 1, 2, 0xd8b04a); P(c, fx + i, fy + 2, 1, 1, 0xa8742a); }
      for (let i = 0; i < fh - 3; i++) { const x = Math.round(fw - 1 - (i * (fw - 1)) / (fh - 4)); P(c, fx + x, fy + i, 1, 1, 0x7a5636); P(c, bx + (bw - 1 - x), by + i, 1, 1, 0x7a5636); }
    } else if (classId === 'demolitionist') {
      // dark armoured vest: high collar, chest plate seams, heavy belt with buckle
      const col = st.vest;
      noise(c, fx, fy, fw, fh - 2, col, 0.08, rnd); noise(c, bx, by, bw, bh - 2, col, 0.08, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y + 1, ww, fh - 3, col, 0.08, rnd); }
      cap(col);
      P(c, fx, fy + 6, fw, 1, shadeNum(col, 0.72)); P(c, fx + Math.floor(fw / 2), fy, 1, 6, shadeNum(col, 0.8));
      rows(h - 3, 1, 0x222222); P(c, fx + Math.floor(fw / 2) - 1, fy + h - 3, 2, 1, 0x8a8e92);
    } else if (classId === 'juggernaut') {
      // dark vest over the shirt: open V neck, team shoulders showing, trim seam
      const col = st.vest, mid = Math.floor(fw / 2);
      noise(c, fx + 1, fy, fw - 2, fh - 4, col, 0.08, rnd); noise(c, bx + 1, by, bw - 2, bh - 4, col, 0.08, rnd);
      for (const f of ['right', 'left']) { const [x, y, ww] = L[f]; noise(c, x, y + 2, ww, fh - 6, col, 0.08, rnd); }
      for (let y = 0; y < 3; y++) c.clearRect(fx + mid - 2 + y, fy + y, 4 - y * 2 + 1, 1);
      P(c, fx + 1, fy + fh - 5, fw - 2, 1, shadeNum(col, 1.35)); P(c, bx + 1, by + bh - 5, bw - 2, 1, shadeNum(col, 1.35));
      P(c, fx + 1, fy, 1, fh - 4, shadeNum(col, 1.3)); P(c, fx + fw - 2, fy, 1, fh - 4, shadeNum(col, 1.3));
    } else if (classId === 'mechanic') {
      // overall bib with suspenders, back straps, tool belt
      const col = st.vest;
      noise(c, fx + 1, fy + 3, fw - 2, fh - 3, col, 0.1, rnd); noise(c, bx + 1, by + 5, bw - 2, bh - 5, col, 0.1, rnd);
      P(c, fx + 2, fy, 1, 3, shadeNum(col, 0.8)); P(c, fx + fw - 3, fy, 1, 3, shadeNum(col, 0.8));
      P(c, fx + 2, fy + 3, 1, 1, 0x9a9a9a); P(c, fx + fw - 3, fy + 3, 1, 1, 0x9a9a9a);
      for (let i = 0; i < 5; i++) { P(c, bx + 2 + Math.floor(i * (bw - 5) / 4), by + i, 1, 1, shadeNum(col, 0.8)); P(c, bx + bw - 3 - Math.floor(i * (bw - 5) / 4), by + i, 1, 1, shadeNum(col, 0.8)); }
      P(c, fx + 3, fy + 5, fw - 6, 2, shadeNum(col, 0.82));
      rows(h - 4, 2, 0x7a6a50); P(c, fx + Math.floor(fw / 2) - 1, fy + h - 4, 3, 2, 0x5a4a38); P(c, fx + Math.floor(fw / 2), fy + h - 4, 1, 1, 0xa89a7a);
    } else if (classId === 'scout') {
      rows(h - 2, 1, 0x1e1e1e); P(c, fx + Math.floor(fw / 2) - 1, fy + h - 2, 2, 1, 0xb8bcc2);
      for (let i = 0; i < h - 2; i++) { const x = Math.round((fw - 1) - (i * (fw - 1)) / (h - 3)); P(c, fx + x, fy + i, 1, 1, 0x4a3826); P(c, bx + (bw - 1 - x), by + i, 1, 1, 0x4a3826); }
      { const [tx, ty, tw] = L.top; P(c, tx, ty, 1, L.top[3], 0x4a3826); }
    } else if (classId === 'incinerator') {
      // puffy rubber suit layer with chest seam
      rows(0, h - 4, st.shirt, ['right', 'left', 'back']); cap(st.shirt);
      noise(c, fx, fy, fw, fh - 4, st.shirt, 0.08, rnd);
      P(c, fx + 1, fy, 1, fh - 4, 0x232323); P(c, fx + fw - 2, fy, 1, fh - 4, 0x232323); P(c, fx + 1, fy + 6, fw - 2, 1, 0x232323);
      P(c, fx + Math.floor(fw / 2), fy, 1, 5, shadeNum(st.shirt, 0.78));
    }
    painted = true;
  } else if (part === 'leg') {
    if (classId === 'scout') rows(7, 1, shadeNum(st.pants, 0.8));
    else if (classId !== 'spy') rows(h - 4, 2, shadeNum(st.pants, 0.8));
    else rows(h - 3, 1, st.pants);
    if (classId === 'mechanic') { const [fx, fy, fw] = L.front; P(c, fx, fy + 5, fw, 2, 0x2e2e2e); }
    if (classId === 'demolitionist') rows(h - 5, 3, 0x55585c);
    if (classId === 'marksman') rows(h - 4, 1, shadeNum(st.pants, 0.78));
  } else if (part === 'head') {
    if (classId === 'doctor') {
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
  if (classId !== 'doctor') return null;
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
function accessories(classId, team, j, s, prop, cos) {
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
      // backwards baseball cap
      hat.push(A(j.head, 0, 8.35, 0, 8.8, 1.7, 8.8, 0x2e2e31), A(j.head, 0, 9.3, 0, 7.6, 0.5, 7.6, 0x2e2e31), A(j.head, 0, 9.65, 0, 1, 0.3, 1, 0x4a4a4e), A(j.head, 0, 7.75, 5.3, 6.8, 0.5, 2.8, 0x262628), A(j.head, 0, 7.75, -4.45, 8.8, 0.6, 0.2, 0x3a3a3e));
      // headset: band over the cap, yellow ear cups, mic boom to the mouth
      hat.push(A(j.head, 0, 9.55, 0.8, 9.6, 0.5, 1.2, 0x2a2a2a));
      A(j.head, 4.6, 4.6, 0.6, 0.6, 5, 1, 0x2a2a2a); A(j.head, -4.6, 4.6, 0.6, 0.6, 5, 1, 0x2a2a2a);
      A(j.head, 4.75, 4.4, 0.4, 1.1, 3.2, 3.2, 0xe2b440); A(j.head, -4.75, 4.4, 0.4, 1.1, 3.2, 3.2, 0xe2b440);
      A(j.head, 5.35, 4.4, 0.4, 0.2, 2.2, 2.2, 0x2a2a2a); A(j.head, -5.35, 4.4, 0.4, 0.2, 2.2, 2.2, 0x2a2a2a);
      A(j.head, 4.55, 2.9, -2.4, 0.4, 0.4, 4.4, 0x2a2a2a); A(j.head, 3.4, 2.5, -4.55, 1.2, 0.8, 0.8, 0x1a1a1a);
      // satchel on the hip
      A(j.torso, -(bw / 2 + 0.6), 1.6, 1.2, 1.4, 3.4, 3.6, 0x5a4632); A(j.torso, -(bw / 2 + 1.35), 2.2, 1.2, 0.2, 1.8, 2.6, 0x4a3826);
      break;
    case 'spy':
      break;
    case 'marksman':
      // slouch hat: wide brim dipping at the front, pinched crown, dark band
      hat.push(A(j.head, 0, 7.9, 0.4, 11.4, 0.6, 10.4, 0x5e4630), A(j.head, 0, 7.6, -5.2, 9, 0.6, 1.4, 0x5e4630));
      hat.push(A(j.head, 0, 9.4, 0.4, 7.6, 2.8, 7.6, 0x6e5438), A(j.head, 0, 10.9, 0.4, 6, 0.5, 6.4, 0x6e5438), A(j.head, 0, 10.95, 0.4, 1.2, 0.5, 5.6, 0x54402a));
      hat.push(A(j.head, 0, 8.6, 0.4, 7.8, 0.8, 7.8, 0x2a1e16));
      // round amber shades
      A(j.head, 0, 4.7, -4.25, 7.4, 0.4, 0.3, 0x2a2420);
      for (const sx of [-2, 2]) { A(j.head, sx, 4.1, -4.3, 2.8, 2.2, 0.25, 0x2a2420); A(j.head, sx, 4.1, -4.45, 2.2, 1.6, 0.1, 0xe2a23e, true); }
      A(j.head, 4.2, 4.6, -2, 0.3, 0.3, 4.4, 0x2a2420); A(j.head, -4.2, 4.6, -2, 0.3, 0.3, 4.4, 0x2a2420);
      // leather hip pouch on the strap
      A(j.torso, -(bw / 2 + 0.7), 1.2, -0.4, 1.4, 3.2, 3.2, 0x6a4a2e); A(j.torso, -(bw / 2 + 1.45), 1.9, -0.4, 0.2, 1.6, 2.4, 0x7a5636);
      break;
    case 'mechanic': {
      // orange hard hat, welding goggles, tool belt pouches, knee pads
      hat.push(A(j.head, 0, 8.7, 0, 8.8, 2.4, 8.8, 0xe8922a), A(j.head, 0, 7.7, 0, 10.2, 0.5, 10.2, 0xd8821e), A(j.head, 0, 9.95, 0, 1.2, 0.5, 8.6, 0xf4a83e), A(j.head, 0, 7.75, -5.3, 7, 0.4, 1.2, 0xd8821e));
      A(j.head, 0, 4.6, 0, 8.8, 0.9, 8.8, 0x262626);
      for (const sx of [-2, 2]) { A(j.head, sx, 4.5, -4.5, 2.8, 2.4, 0.8, 0x1c1c1c); A(j.head, sx, 4.5, -4.92, 2, 1.6, 0.1, 0x6a5232, true); }
      A(j.torso, -1.2, 0.2, -(bd / 2 + 1), 3, 3.8, 1.8, 0x7a6a50); A(j.torso, -1.2, 1.8, -(bd / 2 + 1.95), 3, 0.6, 0.15, 0x5a4a38);
      A(j.torso, bw / 2 + 0.6, 0.6, -0.6, 1.2, 3, 2.6, 0x3a3a3c);
      const [lw, lh, ld] = prop.leg;
      for (const L of [j.legL, j.legR]) { A(L, 0, -lh * 0.52, -(ld / 2 + 0.35), lw - 0.4, 2.6, 0.7, 0xc8944e); A(L, 0, -lh * 0.52, -(ld / 2 + 0.75), lw - 1.6, 1.4, 0.1, 0x8a8e92); }
      break;
    }
    case 'doctor': {
      // round glasses, medic pack with tanks, coat tails
      A(j.head, 0, 4.7, -4.22, 6.6, 0.3, 0.3, 0x2a2a2a);
      for (const sx of [-2, 2]) { A(j.head, sx, 4.3, -4.25, 2.6, 2.4, 0.25, 0x2a2a2a); A(j.head, sx, 4.3, -4.4, 2, 1.8, 0.1, 0xcfe4ee, true); }
      A(j.head, 4.2, 4.7, -2, 0.3, 0.3, 4.4, 0x2a2a2a); A(j.head, -4.2, 4.7, -2, 0.3, 0.3, 4.4, 0x2a2a2a);
      A(j.torso, 0, bh * 0.55, bd / 2 + 1.8, 6, 7.5, 3.6, 0x7a4a3a);
      A(j.torso, -1.6, bh * 0.55 + 4.6, bd / 2 + 1.8, 1.8, 2.4, 1.8, 0x8a8e92); A(j.torso, 1.6, bh * 0.55 + 4.6, bd / 2 + 1.8, 1.8, 2.4, 1.8, 0x8a8e92);
      A(j.torso, 0, bh * 0.55, bd / 2 + 3.65, 2.6, 2.6, 0.2, tc); A(j.torso, 0, bh * 0.55, bd / 2 + 3.7, 0.8, 2.2, 0.2, 0xffffff, true); A(j.torso, 0, bh * 0.55, bd / 2 + 3.7, 2.2, 0.8, 0.2, 0xffffff, true);
      for (const sx of [-2.2, 2.2]) A(j.torso, sx, bh * 0.62, -(bd / 2 + 0.15), 0.8, bh * 0.72, 0.3, 0x3a3030);
      // long coat skirt
      A(j.hips, 0, -3.6, 0, bw + 0.8, 7.2, bd + 0.8, 0xe6e2d8).material = colorMat(0xe6e2d8, { flat: true });
      A(j.hips, 0, -3.6, -(bd / 2 + 0.45), 0.3, 7.2, 0.1, 0xb8b4aa);
      break;
    }
    case 'juggernaut': {
      // bullet bandolier across the chest and back, holster pouch on the belt
      const n = 9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const x = (bw / 2 - 1.2) - t * (bw - 2.4), y = bh - 1 - t * (bh - 3.5);
        A(j.torso, x, y, -(bd / 2 + 0.7), 1.1, 1.8, 1.3, 0x8a7444);
        A(j.torso, x, y + 1.25, -(bd / 2 + 0.7), 0.9, 0.7, 1.1, 0xe08a3a);
        A(j.torso, -x, y, bd / 2 + 0.7, 1.1, 1.8, 1.3, 0x8a7444);
        A(j.torso, -x, y + 1.25, bd / 2 + 0.7, 0.9, 0.7, 1.1, 0xe08a3a);
      }
      A(j.torso, bw / 2 - 1.6, 0.2, -(bd / 2 + 0.8), 2.6, 3.4, 1.6, 0x2e2e2c); A(j.torso, bw / 2 - 1.6, 1.6, -(bd / 2 + 1.65), 2.6, 0.6, 0.1, 0x3e3e3a);
      break;
    }
    case 'incinerator': {
      // gas mask filter snout and raised lens rims
      A(j.head, 0, 1.7, -4.5, 3.2, 3, 1.4, 0x2a2a2c); A(j.head, 0, 1.4, -5.5, 2.4, 2.4, 0.8, 0x45474a); A(j.head, 0, 1.4, -5.95, 1.6, 1.6, 0.1, 0x1a1a1a);
      for (const sx of [-2, 2]) { A(j.head, sx, 4.6, -4.18, 2.8, 2.8, 0.3, 0x3a3a3c); A(j.head, sx, 4.6, -4.36, 2.1, 2.1, 0.1, 0xcfd8d6, true); A(j.head, sx - 0.4, 5, -4.42, 0.6, 0.6, 0.05, 0xffffff, true); }
      // three canisters on the harness, belt pouch, back tank with pilot knob, shoulder straps
      for (const x of [-2.6, 0, 2.6]) { A(j.torso, x, bh - 3.4, -(bd / 2 + 1), 1.9, 3.2, 1.9, 0x4a4c4e); A(j.torso, x, bh - 3.6, -(bd / 2 + 1), 2, 0.8, 2, 0xd8782a); }
      A(j.torso, 0, 1.4, -(bd / 2 + 0.7), 2.6, 2.2, 1.1, 0x1e1e1e); A(j.torso, -0.5, 1.9, -(bd / 2 + 1.3), 0.3, 0.3, 0.1, 0xd0d0d0, true); A(j.torso, 0.5, 1.9, -(bd / 2 + 1.3), 0.3, 0.3, 0.1, 0xd0d0d0, true);
      A(j.torso, 0, bh * 0.5, bd / 2 + 1.7, 5, 8, 3, 0x3a3c3e); A(j.torso, 0, bh * 0.5 + 4.2, bd / 2 + 1.7, 3, 0.6, 2, 0x2a2a2a);
      A(j.torso, 2.6, bh + 1.4, bd / 2 + 1.7, 0.4, 2.6, 0.4, 0x1e1e1e); A(j.torso, 2.6, bh + 2.9, bd / 2 + 1.7, 0.9, 0.9, 0.9, 0x1e1e1e);
      for (const sx of [-1, 1]) A(j.torso, sx * (bw / 2 - 1.5), bh + 0.1, 0, 1.2, 0.5, bd + 0.8, 0x232323);
      break;
    }
    case 'demolitionist': {
      // snug knit cap with a rolled edge
      hat.push(A(j.head, 0, 8.5, 0, 8.7, 1.4, 8.7, 0x242426), A(j.head, 0, 7.4, 0, 8.9, 1, 8.9, 0x1c1c1e), A(j.head, 0, 9.3, 0, 7, 0.5, 7, 0x2a2a2c));
      // raised eye patch
      A(j.head, 2, 4.6, -4.12, 2.6, 2.2, 0.25, 0x101010);
      // armoured vest: chest + back plates, high collar, grenade pods on the chest, belt pouch and front flap
      const vest = 0x3a3c3e, vestD = 0x2e3032;
      A(j.torso, 0, bh * 0.56, -(bd / 2 + 0.5), bw + 0.6, bh * 0.66, 1, vest);
      A(j.torso, 0, bh * 0.56, bd / 2 + 0.5, bw + 0.6, bh * 0.66, 1, vest);
      A(j.torso, 0, bh - 0.3, 0, bw + 1, 1.6, bd + 1.6, vestD);
      A(j.torso, -bw / 2 - 0.3, bh * 0.56, 0, 0.6, bh * 0.6, bd + 1, vestD); A(j.torso, bw / 2 + 0.3, bh * 0.56, 0, 0.6, bh * 0.6, bd + 1, vestD);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const y = bh - 2.4 - i * 2.1, x = sx * (bw / 2 - 1.6);
          A(j.torso, x, y, -(bd / 2 + 1.7), 2.6, 1.6, 1.6, 0x6a6c6e);
          A(j.torso, x + sx * 1.6, y, -(bd / 2 + 1.7), 0.8, 1.4, 1.4, 0xe8a030);
        }
      }
      A(j.torso, 0, 0.9, 0, bw + 1, 1.3, bd + 1.4, 0x232323);
      A(j.torso, 0, 0.6, -(bd / 2 + 1.2), 4.6, 2.6, 1.4, 0x55585c); A(j.torso, -1.1, 1.5, -(bd / 2 + 1.95), 1.6, 0.8, 0.1, 0x45484c); A(j.torso, 1.1, 1.5, -(bd / 2 + 1.95), 1.6, 0.8, 0.1, 0x45484c);
      A(j.torso, 0, -2.2, -(bd / 2 + 0.7), 4.4, 3.6, 0.5, vest); A(j.torso, 0, -3.9, -(bd / 2 + 0.7), 3.2, 0.6, 0.5, vest);
      break;
    }
    default:
  }
  return hat;
}

// Placeholder "weapon" for gloves (nothing in the hand, but a muzzle anchor for effects).
function emptyWeapon() {
  const g = new THREE.Group();
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.1, 0); g.add(muzzle);
  g.userData = { muzzle, spin: null, def: null };
  return g;
}

// ---------------------------------------------------------------- boxing gloves (melee weapon)
// A(x, y, z, w, h, d, colour) adds a box in arm space (pixels); arm = [w, len, d]; inner = side of the thumb.
const GLOVE_RED = 0xc4282a, GLOVE_DARK = 0x941c1e, GLOVE_CUFF = 0xefe8d8;
function boxingGlove(A, arm, inner, col = GLOVE_RED) {
  const [aw, al, ad] = arm;
  const end = -(al - aw / 2);           // bottom of the arm
  const cy = end + 1.0;                 // glove centre: sits over the fist, past the end of the arm
  const dark = (col & 0xfefefe) >> 1 | 0;
  A(0, cy, -0.3, aw + 2, 5.2, ad + 2.6, col);                     // fist
  A(0, cy - 1.2, -(ad / 2 + 1.25), aw + 1.4, 2.2, 0.4, col === GLOVE_RED ? GLOVE_DARK : dark); // knuckle pad
  A(inner * (aw / 2 + 1.3), cy + 0.6, -1.2, 1.4, 3.2, 2.6, col);  // thumb
  A(0, cy + 3.1, 0, aw + 1.4, 1.4, ad + 1.4, GLOVE_CUFF);          // cuff
  A(0, cy + 3.1, -(ad / 2 + 0.75), 0.6, 1.5, 0.1, 0x3a3a3a);      // lace
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
    this.classHat = accessories(this.classId, this.team, j, s, prop, this.opts.cosmetics);
    const hatOn = !!getItem(this.opts.cosmetics?.hat);
    const hairGeo = hairVoxels(this.classId, this.team, s, hatOn);
    if (hairGeo) {
      const hair = new THREE.Mesh(hairGeo, VOXEL_MATERIAL);
      hair.castShadow = true;
      j.head.add(hair);
    }
    const worn = attachCosmetics(j, s, this.opts.cosmetics, this.team);
    if (worn.hat) for (const h of this.classHat) h.visible = false;
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
    const def = WEAPON_MODELS[weaponId];
    // boxing gloves are worn on both hands instead of held
    this.setBoxing(!!def?.boxing);
    const w = def?.boxing ? emptyWeapon() : buildWeapon(weaponId, { team: this.team, skin });
    this.melee = !!def?.melee;
    this.twoHand = !!(def && !def.melee && Math.abs(def.muzzle3[2]) > 0.35);
    if (this.melee) { w.rotation.x = -Math.PI / 2; w.position.set(0, 0, 0); }
    else { w.rotation.x = -Math.PI / 2; w.position.set(0, 0, 0.02); }
    const sc = (this.classId === 'juggernaut' ? 1.15 : 1) * 1.3;
    w.scale.setScalar(sc);
    this.weapon = w;
    this.j.handR.add(w);
  }

  setBoxing(on) {
    if (on && !this.gloves) {
      const s = this.scale;
      this.gloves = [this.j.armR, this.j.armL].map((arm, i) => {
        const g = new THREE.Group();
        boxingGlove((x, y, z, w, h, d, c) => {
          const m = new THREE.Mesh(boxGeo(w * s, h * s, d * s), colorMat(c));
          m.position.set(x * s, y * s, z * s);
          m.castShadow = true;
          g.add(m);
        }, this.prop.arm, i === 0 ? -1 : 1);
        arm.add(g);
        return g;
      });
    }
    if (this.gloves) for (const g of this.gloves) g.visible = on;
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
    j.head.rotation.y = 0;

    // arms
    a.kick = Math.max(0, a.kick - dt * 6);
    a.hurt = Math.max(0, a.hurt - dt * 5);
    const pitch = (st.pitch || 0) - a.torsoX;
    let rx, lx, ly, lz = 0, rz = 0, ry = 0;
    if (st.dead) { rx = 0; lx = 0; ly = 0; }
    else if (a.pose) {
      const P = poseAngles(a.pose, performance.now() / 1000);
      [rx, lx, rz, lz] = P;
      ly = P.ly || 0; ry = P.ry || 0;
      if (P.torso) j.torso.rotation.x = P.torso;
      if (P.hop) j.hips.position.y += P.hop * this.scale;
      j.head.rotation.y = P.headY || 0;
      if (P.headX) j.head.rotation.x = P.headX;
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

// Victory poses: [rightArmX, leftArmX, rightArmZ, leftArmZ] plus optional extras
// (ly/ry arm yaw, torso lean, hop in skin pixels, head yaw/pitch). Accepts a catalog id or a bare shape.
const pose = (rx, lx, rz, lz, extra) => Object.assign([rx, lx, rz, lz], extra || {});
function poseAngles(id, t) {
  const key = typeof id === 'string' && id.includes(':') ? (getItem(id)?.shape || 'flex') : id;
  const sn = Math.sin, hopAbs = (f, a) => Math.abs(sn(t * f)) * a;
  switch (key) {
    case 'flex': return pose(2.8 + sn(t * 3) * 0.1, 2.8 - sn(t * 3) * 0.1, 0.6, -0.6);
    case 'salute': return pose(2.6, 0.1, 0.9, 0);
    case 'wave': return pose(2.9, 0.1, 0.4 + sn(t * 9) * 0.45, -0.05, { headY: -0.2 });
    case 'point': return pose(1.65, 0.15, -0.1, -0.1, { torso: 0.08 });
    case 'shrug': return pose(0.7, 0.7, 0.9 + sn(t * 4) * 0.1, -0.9 - sn(t * 4) * 0.1, { hop: hopAbs(4, 0.4), headX: 0.2 });
    case 'cheer': return pose(3.0 + sn(t * 8) * 0.3, 3.0 + Math.cos(t * 8) * 0.3, 0.3, -0.3, { hop: hopAbs(5, 1.2) });
    case 'think': return pose(2.3, 1.2, -0.65, 0.55, { headX: 0.25, headY: 0.2 });
    case 'clap': { const c = sn(t * 14) * 0.22; return pose(1.45, 1.45, -0.3 + c, 0.3 - c); }
    case 'champion': return pose(3.1, 3.1, 0.15, -0.15, { hop: hopAbs(3, 1.6), headX: -0.3 });
    case 'dab': return pose(2.9, 1.2, 0.2, -1.2, { headX: 0.35, headY: 0.4 });
    case 'starjump': { const o = (sn(t * 6) * 0.5 + 0.5); return pose(0.2, 0.2, 0.2 + o * 2.6, -0.2 - o * 2.6, { hop: o * 2.4 }); }
    case 'robot': { const k = Math.floor(t * 2.5) % 4; return pose(k < 2 ? 1.57 : 0.3, k < 2 ? 0.3 : 1.57, 0, 0, { headY: (k % 2 ? 0.5 : -0.5) }); }
    case 'airguitar': return pose(0.9 + sn(t * 18) * 0.35, 1.5, -0.4, 0.55, { torso: 0.15, headX: 0.3 + sn(t * 9) * 0.15 });
    case 'guard': return pose(1.25, 1.45, -0.15, 0.4, { torso: 0.15 });
    case 'heart': return pose(2.6, 2.6, -0.5, 0.5, { headY: sn(t * 2) * 0.15 });
    case 'facepalm': return pose(2.4, 0.1, -0.95, -0.05, { headX: 0.45 });
    case 'victory': return pose(2.8, 2.8, 0.8, -0.8, { hop: hopAbs(4, 1.4) });
    case 'meditate': return pose(0.9, 0.9, 0.35, -0.35, { hop: 1.6 + sn(t * 2) * 0.6, headX: 0.1 });
    case 'bow': return pose(1.1, -0.4, -0.7, -0.1, { torso: 0.75, headX: 0.2 });
    case 'legend': return pose(3.05, 0.55, 0.1, -0.7, { torso: -0.12, headX: -0.25, headY: 0.2 });
    case 'bunt': return pose(1.2, 1.25, -0.35, 0.35, { torso: 0.2 });
    case 'tiptoe': return pose(1.35, -0.35, -0.5, -0.1, { hop: 0.6, headX: -0.15 });
    case 'scan': return pose(2.55, 0.1, -0.7, -0.05, { headY: sn(t * 1.2) * 0.6 });
    case 'wrenchtwirl': return pose(1.6, 0.2, 0, 0, { ry: (t * 6) % (Math.PI * 2) - Math.PI });
    case 'diagnose': return pose(1.6, 1.05, -0.1, 0.35, { headX: 0.3, headY: -0.25 });
    case 'beast': { const p = hopAbs(5, 1); return pose(1.2 + p * 0.4, 1.2 + (1 - p) * 0.4, 1.15, -1.15, { torso: 0.3 }); }
    case 'warm': { const r = sn(t * 10) * 0.12; return pose(1.3 + r, 1.3 - r, -0.35, 0.35, { torso: 0.12, headX: 0.25 }); }
    case 'detonate': { const d = (sn(t * 3) * 0.5 + 0.5); return pose(0.6 + d * 0.6, 0.6 + d * 0.6, -0.2, 0.2, { torso: 0.2 + d * 0.3, hop: (1 - d) * 0.8 }); }
    default: return pose(0.2, 0.2, 0, 0);
  }
}

// First-person arm: same painted skin and sleeve overlay as the third-person model.
// Hand end at the origin, sleeve extends toward +Z (toward the camera).
export function buildArmMesh(classId, team, gloves, len, boxing = false) {
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
  if (boxing) {
    // boxing glove (weapon), parented to the arm mesh so it uses the same space as the third-person arm
    // (offset by the mesh centre); widened to undo the slimmer first-person cross-section.
    // positions stay true (so the glove sits on the fist); only the box sizes are slimmed
    const gp = new THREE.Group();
    const off = dims[1] / 2 - dims[0] / 2;
    boxingGlove((x, y, z, w, h, d, c) => {
      const mm = new THREE.Mesh(boxGeo(w * s * 0.8, h * s * 0.6, d * s * 0.8), colorMat(c));
      mm.position.set(x * s * 0.8, (y + off) * s, z * s * 0.8);
      gp.add(mm);
    }, dims, -1);
    m.add(gp);
  }
  g.userData.thick = dims[0] * s * 0.5;
  return g;
}

export { PROPORTIONS };
