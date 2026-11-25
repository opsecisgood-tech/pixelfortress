// WebGL renderer setup: world scene + camera, viewmodel overlay pass, menu showcase scene, quality
// presets, resize handling, and offscreen generation of class portraits & weapon icons.
import * as THREE from 'three';
import { Viewmodel } from './Viewmodel.js';
import { CharacterRig } from './CharacterModel.js';
import { buildWeapon } from './WeaponModels.js';
import { bx, colorMat } from './blocks.js';
import { getPlainMaterial as getWorldMaterial } from './textures.js';
import { CLASS_IDS, getClass } from '../../shared/config/classes.js';
import { WEAPON_IDS } from '../../shared/config/weapons.js';
import { TEAM_COLORS_HEX } from '../../shared/constants.js';

export class Renderer {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !!quality.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = !!quality.shadows;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(90, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.vm = new Viewmodel();
    this.showcase = new Showcase();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }

  setQuality(q) {
    this.quality = q;
    this.gl.shadowMap.enabled = !!q.shadows;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setPixelRatio(this.quality.pixelRatio || 1);
    this.gl.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.showcase.camera.aspect = w / h;
    this.showcase.camera.updateProjectionMatrix();
    this.aspect = w / h;
  }

  renderGame(showViewmodel) {
    const gl = this.gl;
    gl.setRenderTarget(null);
    gl.clear();
    gl.render(this.scene, this.camera);
    if (showViewmodel) {
      gl.clearDepth();
      gl.render(this.vm.scene, this.vm.camera);
    }
  }

  renderMenu(dt) {
    this.showcase.update(dt, this.aspect);
    this.gl.setRenderTarget(null);
    this.gl.clear();
    this.gl.render(this.showcase.scene, this.showcase.camera);
  }

  // Render small images of each class and weapon for the UI.
  generateIcons() {
    const out = { portraits: {}, weapons: {} };
    const size = 160;
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x555566, 2.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(-1, 2, -3); scene.add(d);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const buf = new Uint8Array(size * size * 4);
    const toURL = (w, h, target = rt) => {
      this.gl.readRenderTargetPixels(target, 0, 0, w, h, buf);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      ctx.putImageData(img, 0, 0);
      return c.toDataURL();
    };
    const prevClear = this.gl.getClearAlpha();
    this.gl.setClearColor(0x000000, 0);
    for (const team of [0, 1]) {
      for (const id of CLASS_IDS) {
        const rig = new CharacterRig(id, team);
        rig.setWeapon(getClass(id).weapons[0]);
        rig.update(0.016, { speed: 0, grounded: true, pitch: 0 });
        rig.root.rotation.y = -0.45;
        scene.add(rig.root);
        const hgt = id === 'juggernaut' ? 1.9 : 1.75;
        cam.position.set(0, hgt, -2.1);
        cam.lookAt(0, hgt - 0.12, 0);
        this.gl.setRenderTarget(rt);
        this.gl.clear();
        this.gl.render(scene, cam);
        out.portraits[`${id}_${team}`] = toURL(size, size);
        scene.remove(rig.root);
        rig.dispose();
      }
    }
    // weapons: side view, orthographic
    const wrt = new THREE.WebGLRenderTarget(size, size / 2, { colorSpace: THREE.SRGBColorSpace });
    const ocam = new THREE.OrthographicCamera(-0.6, 0.6, 0.3, -0.3, 0.1, 10);
    const iconLight = new THREE.DirectionalLight(0xffffff, 2.5); iconLight.position.set(3, 2, 1); scene.add(iconLight);
    for (const id of WEAPON_IDS) {
      const w = buildWeapon(id, { team: 0 });
      const g = new THREE.Group(); g.add(w);
      if (w.userData.def.melee) g.rotation.x = -Math.PI / 2;
      g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g);
      const c = box.getCenter(new THREE.Vector3());
      const sz = box.getSize(new THREE.Vector3());
      const span = Math.max(sz.z, sz.y * 2.1, 0.12) * 0.56;
      ocam.left = -span; ocam.right = span; ocam.top = span / 2; ocam.bottom = -span / 2;
      ocam.updateProjectionMatrix();
      g.position.sub(c);
      scene.add(g);
      ocam.position.set(3, 0, 0); ocam.lookAt(0, 0, 0);
      this.gl.setRenderTarget(wrt);
      this.gl.clear();
      this.gl.render(scene, ocam);
      out.weapons[id] = toURL(size, size / 2, wrt);
      scene.remove(g);
    }
    this.gl.setRenderTarget(null);
    this.gl.setClearColor(0x000000, prevClear);
    scene.remove(iconLight);
    rt.dispose();
    wrt.dispose();
    this.resize();
    return out;
  }
}

// Menu backdrop: a stylised depot hangar with a rotating character on a team pedestal.
class Showcase {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15171c);
    this.scene.fog = new THREE.Fog(0x15171c, 10, 40);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 1.6, -6.2);
    this.camera.lookAt(0, 1.05, 0);
    const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x3a2a20, 1.4);
    const key = new THREE.DirectionalLight(0xffe6c0, 2.6); key.position.set(-3, 5, -4);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const rim = new THREE.DirectionalLight(0x6aa0ff, 1.8); rim.position.set(4, 3, 4);
    this.teamLight = new THREE.PointLight(0xd8473b, 7, 6, 1.8); this.teamLight.position.set(0, 0.3, -1.4);
    this.scene.add(hemi, key, rim, this.teamLight);
    this.buildSet();
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.rigs = [];
    this.t = 0;
    this.mode = 'single';
    this.offsetX = 0;
  }

  buildSet() {
    const g = new THREE.Group();
    // floor & pedestal
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, 40), getWorldMaterial('metalfloor'));
    floor.position.y = -0.1; floor.receiveShadow = true;
    g.add(floor);
    this.pedestal = bx(g, 0, 0, 0, 2.6, 0.25, 2.6, 0x2b2e33);
    this.pedTrim = bx(g, 0, 0.25, 0, 2.2, 0.04, 2.2, 0xd8473b, { basic: true });
    // back wall: corrugated hangar with containers
    const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 0.5), getWorldMaterial('corrugated'));
    wall.position.set(0, 6, 9);
    g.add(wall);
    const cont = (x, z, mat, y = 0, ry = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4), getWorldMaterial(mat));
      m.position.set(x, y + 1.3, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m);
    };
    cont(-5.5, 6.5, 'container_blue'); cont(-5.5, 6.5, 'container_red', 2.6); cont(5.8, 6, 'container_yellow', 0, 0.3); cont(9, 3, 'container_green', 0, 1.2);
    const crate = (x, z, s, y = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), getWorldMaterial('crate')); m.position.set(x, y + s / 2, z); m.castShadow = true; g.add(m); };
    crate(3, 3.5, 1.2); crate(3.9, 3.2, 0.9); crate(3.3, 3.4, 0.8, 1.2); crate(-3.6, 3, 1.1);
    // hazard stripes & lamps
    const haz = new THREE.Mesh(new THREE.BoxGeometry(30, 0.02, 0.6), getWorldMaterial('hazard'));
    haz.position.set(0, 0.01, 4.5); g.add(haz);
    for (const x of [-7, 7]) { bx(g, x, 0, 8.4, 0.2, 7, 0.2, 0x2b2e33); bx(g, x, 6.6, 8, 0.8, 0.3, 0.8, 0xfff0c0, { basic: true }); }
    this.scene.add(g);
  }

  setCharacters(list) {
    // list: [{ classId, team, cosmetics, weaponId, skin, pose }]
    for (const r of this.rigs) { this.pivot.remove(r.root); r.dispose(); }
    this.rigs = [];
    list.forEach((c, i) => {
      const rig = new CharacterRig(c.classId, c.team, { cosmetics: c.cosmetics });
      rig.setWeapon(c.weaponId || getClass(c.classId).weapons[0], c.skin);
      rig.anim.pose = c.pose || null;
      rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const n = list.length;
      rig.root.position.x = n > 1 ? (i - (n - 1) / 2) * -1.6 : 0;
      if (n > 1) rig.root.position.z = i === 0 ? -0.3 : 0.2;
      rig.root.rotation.y = n > 1 ? (i - (n - 1) / 2) * 0.25 : 0;
      this.pivot.add(rig.root);
      this.rigs.push(rig);
    });
    const team = list[0]?.team ?? 0;
    this.teamLight.color.setHex(TEAM_COLORS_HEX[team]);
    this.pedTrim.material = colorMat(TEAM_COLORS_HEX[team], { basic: true });
    this.mode = list.length > 1 ? 'podium' : 'single';
  }

  update(dt, aspect) {
    this.t += dt;
    for (const r of this.rigs) r.update(dt, { speed: 0, grounded: true, pitch: -0.05 + Math.sin(this.t * 0.8) * 0.05 });
    if (this.mode === 'single') {
      this.pivot.rotation.y = Math.sin(this.t * 0.35) * 0.55 + (this.drag || 0);
      // keep character centred-ish; on narrow screens shift up
      const portrait = aspect < 0.9;
      this.camera.position.set(this.offsetX, portrait ? 1.9 : 1.55, portrait ? -8.5 : -6.2);
      this.camera.lookAt(this.offsetX, portrait ? 1.6 : 1.05, 0);
    } else {
      this.pivot.rotation.y = Math.sin(this.t * 0.3) * 0.12;
      this.camera.position.set(0, 1.7, -7.5);
      this.camera.lookAt(0, 1.1, 0);
    }
  }
}
