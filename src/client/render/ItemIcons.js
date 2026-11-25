// Lazily rendered inventory thumbnails for catalog items. 3D items (hats, masks, accessories, weapon
// skins, poses) are rendered offscreen a few per frame and cached; gloves, effects and banners are 2D.
import * as THREE from 'three';
import { CharacterRig } from './CharacterModel.js';
import { buildWeapon } from './WeaponModels.js';
import { attachCosmetics, resolveColors, tickCosmeticFx } from './CosmeticModels.js';
import { colorMat, boxGeo } from './blocks.js';
import { getClass } from '../../shared/config/classes.js';
import { RARITIES } from '../../shared/config/cosmetics.js';

const BACK_ITEMS = new Set(['backpack', 'antenna', 'guitar', 'cape', 'sword', 'jetpack', 'wings', 'pennant', 'quiver', 'fueltank', 'balloon']);
const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

// CSS background for a banner item (also used for profile cards).
export function bannerCSS(item) {
  if (!item) return 'linear-gradient(135deg,#3a4048,#23272d)';
  const [a, b] = item.colors;
  switch (item.shape) {
    case 'stripes': return `repeating-linear-gradient(90deg,${a} 0 14px,${b} 14px 28px)`;
    case 'diagonal': return `repeating-linear-gradient(-45deg,${a} 0 12px,${b} 12px 24px)`;
    case 'dots': return `radial-gradient(${b} 22%,transparent 24%) 0 0/14px 14px,${a}`;
    case 'checker': return `conic-gradient(${a} 25%,${b} 0 50%,${a} 0 75%,${b} 0) 0 0/20px 20px`;
    case 'chevron': return `linear-gradient(135deg,${b} 25%,transparent 25%) -10px 0/20px 20px,linear-gradient(225deg,${b} 25%,transparent 25%) -10px 0/20px 20px,${a}`;
    case 'rays': return `repeating-conic-gradient(from 0deg at 50% 110%,${a} 0 10deg,${b} 10deg 20deg)`;
    case 'grid': return `linear-gradient(90deg,${b} 0 2px,transparent 2px) 0 0/14px 14px,linear-gradient(${b} 0 2px,transparent 2px) 0 0/14px 14px,${a}`;
    case 'waves': return `radial-gradient(circle at 50% 0,transparent 9px,${b} 10px 13px,transparent 14px) 0 0/24px 14px,${a}`;
    case 'prism': return 'linear-gradient(120deg,#ff5a9a,#ffb35a,#fff27a,#7aff8a,#5adfff,#b07aff,#ff5a9a)';
    default: return `linear-gradient(135deg,${a},${b})`;
  }
}

function canvas2d(w = 128, h = 128) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function gloveIcon(item, team) {
  const [c, x] = canvas2d();
  const [main, cuff] = resolveColors(item, team);
  const px = (gx, gy, w, h, col) => { x.fillStyle = col; x.fillRect(gx * 8, gy * 8, w * 8, h * 8); };
  const m = hex(main), dark = hex(new THREE.Color(main).multiplyScalar(0.7).getHex());
  // blocky glove: palm + four fingers + thumb + cuff
  px(4, 5, 7, 6, m); for (let i = 0; i < 4; i++) px(4 + i * 2 - (i === 3 ? 1 : 0), 2 + (i === 0 || i === 3 ? 1 : 0), 1.6, 4, m);
  px(2, 6, 2, 3, m); px(4, 10, 7, 1, dark); px(10, 5, 1, 6, dark);
  const cc = item.shape === 'cuffed' ? hex(cuff) : dark;
  px(4, 11, 7, 3, cc);
  if (item.shape === 'striped') { px(4, 7, 7, 1, hex(cuff)); px(4, 12, 7, 1, hex(cuff)); }
  if (item.fx === 'rainbow') { const g = x.createLinearGradient(0, 0, 128, 128); ['#ff5a9a', '#fff27a', '#5adfff', '#b07aff'].forEach((s, i) => g.addColorStop(i / 3, s)); x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.globalAlpha = 0.65; x.fillRect(0, 0, 128, 128); }
  if (item.fx === 'shine') { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(32, 40, 16, 40); }
  return c.toDataURL();
}

function effectIcon(item, team) {
  const [c, x] = canvas2d();
  const cols = resolveColors(item, team).map(hex);
  let s = item.id.length * 977;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const n = 26 + item.rarity * 8;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * 54;
    const sz = 4 + rnd() * (6 + item.rarity);
    x.fillStyle = cols[i % cols.length];
    x.fillRect(64 + Math.cos(a) * r - sz / 2, 64 + Math.sin(a) * r * (item.g < 0 ? 1.2 : 0.9) - sz / 2, sz, sz);
  }
  return c.toDataURL();
}

export class ItemIcons {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this.queue = [];
    this.size = 128;
    this.pumping = false;
  }

  key(item, classId, team) { return `${item.id}|${classId || ''}|${team}`; }

  // Returns a cached URL immediately, or null and calls cb(url) once rendered.
  get(item, classId, team = 0, cb) {
    const k = this.key(item, classId, team);
    if (this.cache.has(k)) return this.cache.get(k);
    if (item.slot === 'gloves') { const u = gloveIcon(item, team); this.cache.set(k, u); return u; }
    if (item.slot === 'elimEffect') { const u = effectIcon(item, team); this.cache.set(k, u); return u; }
    if (item.slot === 'banner') return null;
    this.queue.push({ item, classId, team, k, cb });
    if (!this.pumping) { this.pumping = true; requestAnimationFrame(() => this.pump()); }
    return null;
  }

  cancelPending() { this.queue.length = 0; }

  pump() {
    const t0 = performance.now();
    if (this.queue.length) {
      this.setup();
      const gl = this.renderer.gl;
      const vp = gl.getViewport(new THREE.Vector4());
      const prevAlpha = gl.getClearAlpha();
      const prevColor = gl.getClearColor(new THREE.Color());
      gl.setClearColor(0x000000, 0);
      while (this.queue.length && performance.now() - t0 < 12) {
        const job = this.queue.shift();
        if (this.cache.has(job.k)) { job.cb?.(this.cache.get(job.k)); continue; }
        let url = null;
        try { url = this.render3d(job.item, job.classId, job.team); } catch (e) { console.warn('icon', job.item.id, e); }
        this.cache.set(job.k, url);
        job.cb?.(url);
      }
      gl.setRenderTarget(null);
      gl.setClearColor(prevColor, prevAlpha);
      gl.setViewport(vp);
    }
    if (this.queue.length) requestAnimationFrame(() => this.pump());
    else this.pumping = false;
  }

  setup() {
    if (this.scene) return;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 2.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(-1.5, 2.5, -3); this.scene.add(d);
    const b = new THREE.DirectionalLight(0xffffff, 1.2); b.position.set(2, 1, 3); this.scene.add(b);
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { colorSpace: THREE.SRGBColorSpace });
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.buf = new Uint8Array(this.size * this.size * 4);
  }

  // Neutral mannequin (head + torso) the cosmetic is attached to.
  mannequin(team) {
    const s = 1 / 16;
    const root = new THREE.Group();
    const j = { torso: new THREE.Group(), head: new THREE.Group(), bodyW: 8, bodyH: 12, bodyD: 4 };
    root.add(j.torso);
    const body = new THREE.Mesh(boxGeo(8 * s, 12 * s, 4 * s), colorMat(0x8a8f96)); body.position.y = 6 * s; j.torso.add(body);
    j.head.position.y = 12 * s; j.torso.add(j.head);
    const head = new THREE.Mesh(boxGeo(8 * s, 8 * s, 8 * s), colorMat(0xd8b89a)); head.position.y = 4 * s; j.head.add(head);
    for (const ex of [-2, 2]) { const e = new THREE.Mesh(boxGeo(1.2 * s, 1.2 * s, 0.2 * s), colorMat(0x2a2a2e)); e.position.set(ex * s, 4.4 * s, -4.05 * s); j.head.add(e); }
    return { root, j, s };
  }

  frame(obj, yaw, pad = 1.15, lookUp = 0) {
    obj.rotation.y = yaw;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = (r * pad) / Math.tan((this.cam.fov * Math.PI) / 360);
    this.cam.position.set(c.x, c.y + r * 0.25 + lookUp, c.z - dist);
    this.cam.lookAt(c.x, c.y, c.z);
  }

  snap() {
    const gl = this.renderer.gl, S = this.size;
    tickCosmeticFx(1.3);
    gl.setRenderTarget(this.rt);
    gl.clear();
    gl.render(this.scene, this.cam);
    gl.readRenderTargetPixels(this.rt, 0, 0, S, S, this.buf);
    const [c, x] = canvas2d(S, S);
    const img = x.createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(this.buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    x.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  render3d(item, classId, team) {
    const scene = this.scene;
    let obj, cleanup = () => {};
    if (item.slot === 'hat' || item.slot === 'mask' || item.slot === 'accessory') {
      const { root, j, s } = this.mannequin(team);
      const before = new Set([...j.head.children, ...j.torso.children]);
      attachCosmetics(j, s, { [item.slot]: item.id }, team);
      if (item.slot === 'accessory') {
        obj = root;
        this.frame(obj, BACK_ITEMS.has(item.shape) ? Math.PI - 0.7 : -0.55, 1.05);
      } else {
        // frame on the head + the item only
        j.torso.children.filter((o) => before.has(o) && o !== j.head).forEach((o) => j.torso.remove(o));
        obj = root;
        this.frame(obj, -0.6, 0.92);
      }
      scene.add(obj);
      cleanup = () => scene.remove(obj);
    } else if (item.slot === 'weaponSkin') {
      const wid = item.classes ? getClass(item.classes[0]).weapons[0] : 'scattershot';
      const w = buildWeapon(wid, { team, skin: item.id, shadow: false });
      obj = new THREE.Group(); obj.add(w);
      if (w.userData.def.melee) w.rotation.x = -Math.PI / 2;
      scene.add(obj);
      this.frame(obj, -Math.PI / 2 - 0.35, 0.82);
      cleanup = () => scene.remove(obj);
    } else if (item.slot === 'victoryPose') {
      const cls = item.classes ? item.classes[0] : (classId || 'scout');
      const rig = new CharacterRig(cls, team, {});
      rig.setWeapon(getClass(cls).weapons[0]);
      rig.anim.pose = item.id;
      for (let i = 0; i < 20; i++) rig.update(1 / 30, { speed: 0, grounded: true, pitch: 0 });
      obj = rig.root;
      scene.add(obj);
      this.frame(obj, -0.4, 0.95);
      cleanup = () => { scene.remove(obj); rig.dispose(); };
    } else return null;
    const url = this.snap();
    cleanup();
    return url;
  }
}

export function rarityOf(item) { return RARITIES[item.rarity]; }
