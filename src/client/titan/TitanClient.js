// Client side of the Titan (admin /titan): gem keys, gem-power visuals and sounds, portals, Reality
// illusions, the gauntlet HUD, the Soul tracker, status overlays for affected players, and the third-person
// camera while the Mind gem controls someone. All decisions are the server's; this only shows them.
import * as THREE from 'three';
import { STONES, STONE_INFO, TITAN, TFX, hasStone, ALL_STONES } from '../../shared/config/titan.js';
import { getTexture, materialRecipe } from '../render/textures.js';
import { dirFromAngles, damp, wrapAngle } from '../../shared/math.js';
import { TEAM_NAMES } from '../../shared/constants.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEYS = { Digit1: 'time', Digit2: 'mind', Digit3: 'soul', KeyR: 'reality', KeyF: 'space', KeyP: 'punch', KeyG: 'grab', KeyE: 'snap' };
const ACTION_STONE = { time: 'time', mind: 'mind', soul: 'soul', reality: 'reality', space: 'space', punch: 'power', grab: 'power' };
const C = (s) => STONE_INFO[s].color;
const tmp = new THREE.Vector3();

// A box textured like the map's own material (world-scale UVs), for Reality illusions.
function illusionMesh(mat, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const tile = materialRecipe(mat)?.tile || 2;
  const uv = g.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * faces[f][0] / tile, uv.getY(i) * faces[f][1] / tile); }
  const m = new THREE.MeshLambertMaterial({ map: getTexture(mat), emissive: 0x000000 });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

// Swirling dark-blue portal ring (entrance: deep blue, exit: lighter, with a white rim).
function portalMesh(kind) {
  const g = new THREE.Group();
  const deep = kind === 0 ? 0x1a2cff : 0x3a8cff;
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshBasicMaterial({ color: kind === 0 ? 0x050a3a : 0x0a2a6a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  g.add(core);
  const arms = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Mesh(new THREE.RingGeometry(0.25 + i * 0.17, 0.33 + i * 0.17, 24, 1, i * 1.3, Math.PI * 1.1), new THREE.MeshBasicMaterial({ color: i % 2 ? deep : 0x6aa8ff, transparent: true, opacity: 0.75 - i * 0.1, side: THREE.DoubleSide, depthWrite: false }));
    arm.position.z = 0.01 * (i + 1);
    arms.add(arm);
  }
  g.add(arms);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 40), new THREE.MeshBasicMaterial({ color: kind === 0 ? deep : 0xcfe4ff }));
  g.add(rim);
  const light = new THREE.PointLight(deep, 2.2, 6, 2);
  light.position.z = 0.4;
  g.add(light);
  g.userData = { arms, core, rim };
  return g;
}

export class TitanClient {
  constructor(game) {
    this.g = game;
    this.root = new THREE.Group();
    game.r.scene.add(this.root);
    this.illusions = new Map();
    this.portals = new Map();
    this.waves = [];
    this.rigFx = new Map();   // id -> { ring, halo }
    this.poses = new Map();   // id -> { pose, until }
    this.dusted = new Set();
    this.buildHud();
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey, true);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey, true);
    this.g.r.scene.remove(this.root);
    for (const el of [this.hud, this.track, this.tint, this.banner, this.label]) el?.remove();
  }

  get net() { return this.g.net; }
  get me() { return this.g.net.me; }
  isTitan() { return this.me?.cls === 'titan'; }
  send(a, extra = {}) { this.net.t.send({ t: 'titan', a, ...extra }); }

  // ---------------------------------------------------------------- input
  key(e) {
    if (!this.isTitan() || e.repeat) return;
    const ui = this.g.ui;
    if (ui.hud.chatOpen || ui.menuOpen || this.g.app.state !== 'game') return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const tt = this.me?.tt;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      const n = TITAN.time.steps.length;
      const cur = tt?.ts ?? TITAN.time.defaultStep;
      const next = Math.max(0, Math.min(n - 1, cur + (e.code === 'KeyX' ? 1 : -1)));
      this.send('timeval', { v: next });
      if (tt) tt.ts = next;
      this.g.audio.uiClick();
      return;
    }
    const a = KEYS[e.code];
    if (!a) return;
    this.trigger(a);
  }
  trigger(a) {
    const tt = this.me?.tt;
    const st = ACTION_STONE[a];
    if (st && !(tt && hasStone(tt.s, st))) { this.g.ui.hud.notify(`Claim the ${STONE_INFO[st].name} gem first (one gem per kill).`, 'short'); return; }
    if (a === 'snap' && tt?.snap !== 1) { this.g.ui.hud.notify(tt?.snap === 2 ? 'The Snap is spent for this match.' : `The Snap needs all six gems (${STONES.filter((s) => hasStone(tt?.s || 0, s)).length}/6).`, 'short'); return; }
    this.send(a);
    // local cast flourish: the gauntlet glows in the gem's colour
    if (st) this.flashGauntlet(C(st));
  }

  flashGauntlet(color) {
    const cam = this.g.r.camera;
    const f = dirFromAngles(this.g.yaw, this.g.pitch);
    const x = cam.position.x + f[0] * 0.6 - Math.cos(this.g.yaw) * 0.25, y = cam.position.y + f[1] * 0.6 - 0.25, z = cam.position.z + f[2] * 0.6 + Math.sin(this.g.yaw) * 0.25;
    this.g.effects.burst(x, y, z, 10, { color: [color, 0xffffff], speed: 1.4, life: 0.35, size: 0.035, g: 0, drag: 3 });
  }

  // ---------------------------------------------------------------- server events
  onEvent(e) {
    const [, kind] = e;
    const fx = this.g.effects, au = this.g.audio, hud = this.g.ui.hud, myId = this.net.myId;
    const nameOf = (id) => this.net.roster.get(id)?.name || '?';
    const posOf = (id) => this.g.rigPos(id);
    switch (kind) {
      case 'on': case 'off': {
        const [, , pid, x, y, z] = e;
        fx.burst(x, y + 1.2, z, 60, { color: kind === 'on' ? [0x9a7cc0, 0xd2a63c, 0xffffff] : [0x888888, 0xcccccc], speed: 6, life: 1.1, size: 0.12, up: 0.4 });
        fx.flashLight(x, y + 1.5, z, kind === 'on' ? 0xb48cff : 0xffffff, 6, 14, 0.5);
        au.titan(kind === 'on' ? 'transform' : 'revert', [x, y, z]);
        if (pid === myId && kind === 'on') this.showBanner('THE TITAN', 'Every kill claims a gem for your gauntlet.', '#c9a2ff');
        break;
      }
      case 'stone': {
        const [, , pid, idx, count] = e;
        const s = STONES[idx], info = STONE_INFO[s];
        const p = pid === myId ? this.selfGauntlet() : this.rigGauntlet(pid);
        if (p) {
          fx.burst(p[0], p[1], p[2], 50, { color: [info.color, 0xffffff], speed: 4, life: 0.9, size: 0.07, g: -1 });
          for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; fx.spawn({ x: p[0] + Math.cos(a) * 1.2, y: p[1] + Math.sin(a * 3) * 0.3, z: p[2] + Math.sin(a) * 1.2, vx: -Math.cos(a) * 2.2, vy: 0, vz: -Math.sin(a) * 2.2, life: 0.55, size: 0.06, end: 0.01, color: info.color, g: 0, drag: 0 }); }
          fx.flashLight(p[0], p[1], p[2], info.color, 8, 10, 0.6);
        }
        au.titan('stone', pid === myId ? null : p, { idx });
        if (pid === myId) { this.showBanner(`${info.name.toUpperCase()} GEM`, info.power, info.css); this.screenFlash(info.css, 0.35); }
        else hud.notify(`${nameOf(pid)} claimed the ${info.name} gem (${count}/6)`, 'short');
        break;
      }
      case 'time': {
        const [, , pid, tid, val] = e;
        this.beam(pid, tid, C('time'), 26);
        au.titan('time', posOf(tid), { val });
        if (tid === myId) hud.notify(`Your time is ${val < 1 ? 'slowed' : 'sped up'} to ×${val}`, 'warn');
        break;
      }
      case 'mind': {
        const [, , pid, tid, on] = e;
        if (on) { this.beam(pid, tid, C('mind'), 30); au.titan('mind', posOf(tid)); }
        if (tid === myId) { if (on) this.showBanner('MIND TAKEN', `${nameOf(pid)} controls your body`, STONE_INFO.mind.css); else hud.notify('Your mind is your own again.', 'short'); }
        if (pid === myId && !on) hud.notify('You release their mind.', 'short');
        break;
      }
      case 'punch': {
        const [, , pid, tid, x, y, z] = e;
        if (tid < 0) { au.swing(posOf(pid), pid === myId, true); break; }
        fx.burst(x, y, z, 40, { color: [C('power'), 0xe8c8ff, 0xffffff], speed: 7, life: 0.6, size: 0.09 });
        this.wave(x, y, z, C('power'), 3.2, 0.5);
        fx.flashLight(x, y, z, C('power'), 9, 10, 0.25);
        au.titan('punch', [x, y, z]);
        if (tid === myId || pid === myId) this.g.shake = Math.max(this.g.shake, 0.7);
        if (tid === myId) this.screenFlash(STONE_INFO.power.css, 0.4);
        this.pose(pid, 'cast', 0.35);
        break;
      }
      case 'grab': {
        const [, , pid, tid, mode] = e;
        const p = posOf(tid);
        if (p) fx.burst(p[0], p[1] + 1, p[2], mode === 0 ? 40 : 24, { color: [C('power'), 0xffffff], speed: mode === 0 ? 6 : 3, life: 0.5, size: 0.07 });
        au.titan(mode === 1 ? 'grab' : mode === 0 ? 'throw' : 'drop', p);
        if (tid === myId && mode === 1) this.showBanner('GRABBED', `${nameOf(pid)} has you in their grip`, STONE_INFO.power.css);
        if (mode === 1) this.pose(pid, 'cast', TITAN.grab.hold);
        else this.pose(pid, null, 0);
        break;
      }
      case 'sample': {
        const [, , pid, x, y, z] = e;
        fx.burst(x, y, z, 18, { color: [C('reality'), 0xffb0b0], speed: 2, life: 0.5, size: 0.05, g: 0 });
        au.titan('sample', [x, y, z]);
        break;
      }
      case 'ill': {
        const [, , pid, x, y, z] = e;
        fx.burst(x, y + 0.5, z, 26, { color: [C('reality'), 0x7a0010], speed: 2.5, life: 0.6, size: 0.06, up: 0.5, g: 1 });
        au.titan('illusion', [x, y, z]);
        this.pose(pid, 'cast', 0.4);
        break;
      }
      case 'illhit': {
        const [, , vid, x, y, z] = e;
        fx.burst(x, y, z, 50, { color: [C('reality'), 0xff8080, 0x400000], speed: 6, life: 0.8, size: 0.09 });
        this.wave(x, y, z, C('reality'), 2.6, 0.45);
        au.titan('shatter', [x, y, z]);
        if (vid === myId) { this.screenFlash('#ff2020', 0.6, 'pulse'); this.g.shake = Math.max(this.g.shake, 0.6); hud.notify('It was an illusion!', 'warn'); }
        break;
      }
      case 'portal': {
        const [, , pid, kindP, x, y, z] = e;
        fx.burst(x, y, z, 36, { color: [0x2f5cff, 0x9ac4ff, 0x0a1440], speed: 3, life: 0.7, size: 0.07, g: 0 });
        au.titan('portal', [x, y, z]);
        this.pose(pid, 'cast', 0.4);
        if (pid === myId) hud.notify(kindP === 0 ? 'Entrance portal opened (dark blue).' : 'Exit portal opened (light blue).', 'short');
        break;
      }
      case 'warp': {
        const [, , pid, x1, y1, z1, x2, y2, z2, yaw] = e;
        for (const [x, y, z] of [[x1, y1, z1], [x2, y2, z2]]) { fx.burst(x, y + 1, z, 30, { color: [0x2f5cff, 0xcfe4ff], speed: 4, life: 0.5, size: 0.07, g: 0 }); fx.flashLight(x, y + 1, z, 0x3a6cff, 6, 8, 0.3); }
        au.titan('warp', [x2, y2, z2]);
        if (pid === myId) { this.g.yaw = wrapAngle(yaw); this.screenFlash('#2f5cff', 0.35); }
        break;
      }
      case 'soul': {
        const [, , pid, x, y, z, sapped] = e;
        this.wave(x, y, z, C('soul'), TITAN.soul.sapRadius, 1.1, true);
        fx.burst(x, y, z, 70, { color: [C('soul'), 0xffd090, 0xffffff], speed: 8, life: 1, size: 0.08, g: 0 });
        fx.flashLight(x, y, z, C('soul'), 10, 24, 0.8);
        au.titan('soul', [x, y, z]);
        this.pose(pid, 'cast', 0.6);
        if (pid === myId) { this.screenFlash(STONE_INFO.soul.css, 0.35); hud.notify(`Every soul revealed${sapped ? ` · ${sapped} sapped` : ''}`, 'short'); }
        break;
      }
      case 'snapwind': {
        const [, , pid, x, y, z] = e;
        this.pose(pid, 'snap', TITAN.snap.windup + 0.5);
        au.titan('snapwind', [x, y, z]);
        this.screenFlash('#fff2c0', TITAN.snap.windup, 'dim');
        hud.notify(`${nameOf(pid)} raises the complete gauntlet…`, 'warn');
        if (pid === myId) this.showBanner('SNAP', 'Half of everyone else will turn to dust', '#fff0c0');
        break;
      }
      case 'snap': {
        const [, , pid, total, ids] = e;
        for (const id of ids) this.dusted.add(id);
        setTimeout(() => { for (const id of ids) this.dusted.delete(id); }, 4000);
        au.titan('snap', null);
        this.screenFlash('#ffffff', 0.9);
        const mine = ids.includes(myId);
        this.showBanner(mine ? 'YOU TURNED TO DUST' : 'THE SNAP', `${ids.length} of ${total} turned to dust`, mine ? '#d8c8a8' : '#fff0c0');
        break;
      }
      default:
    }
  }

  // Dust instead of the usual elimination burst for Snap victims.
  dust(id, x, y, z) {
    const R = this.g.rigs.get(id);
    const cols = [0x8a7a68, 0x5a4e42, 0xb0a08a, 0x3a3028];
    const n = Math.round(160 * this.g.r.quality.particleMult);
    for (let i = 0; i < n; i++) {
      const h = Math.random() * 1.9;
      this.g.effects.spawn({ x: x + (Math.random() - 0.5) * 0.7, y: y + h, z: z + (Math.random() - 0.5) * 0.5, vx: 0.6 + Math.random() * 0.9, vy: 0.3 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.8, life: 1.2 + Math.random() * 1.6 + h * 0.4, size: 0.04 + Math.random() * 0.05, end: 0.01, color: cols[i % 4], g: -0.15, drag: 0.6 });
    }
    if (R) R.root.visible = false;
    this.g.audio.titan('dust', [x, y + 1, z]);
  }
  isDusted(id) { return this.dusted.has(id); }

  pose(id, pose, dur) {
    if (!pose) { this.poses.delete(id); const R = this.g.rigs.get(id); if (R) R.rig.anim.pose = null; return; }
    this.poses.set(id, { pose, until: this.g.time + dur });
  }

  beam(fromId, toId, color, n) {
    const a = this.g.rigPos(fromId), b = this.g.rigPos(toId);
    if (!a || !b) return;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + 1.5 + (b[1] - a[1]) * t + Math.sin(t * Math.PI) * 0.6, z = a[2] + (b[2] - a[2]) * t;
      this.g.effects.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, life: 0.35 + t * 0.35, size: 0.06, end: 0.01, color, g: 0, drag: 2 });
    }
  }

  // Expanding shock sphere / ring.
  wave(x, y, z, color, radius, life, sphere = false) {
    const geo = sphere ? new THREE.SphereGeometry(1, 24, 12) : new THREE.TorusGeometry(1, 0.06, 6, 40);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, z);
    if (!sphere) m.rotation.x = Math.PI / 2;
    this.root.add(m);
    this.waves.push({ m, t: 0, life, radius });
  }

  selfGauntlet() {
    const cam = this.g.r.camera;
    const f = dirFromAngles(this.g.yaw, this.g.pitch);
    return [cam.position.x + f[0] * 0.7 - Math.cos(this.g.yaw) * 0.25, cam.position.y - 0.25, cam.position.z + f[2] * 0.7 + Math.sin(this.g.yaw) * 0.25];
  }
  rigGauntlet(id) {
    const R = this.g.rigs.get(id);
    if (!R || !R.root.visible) return this.g.rigPos(id);
    R.rig.gauntletWorld(tmp);
    return [tmp.x, tmp.y, tmp.z];
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const n = this.net, me = n.me, t = this.g.time;
    const tt = me?.tt;
    const titan = this.isTitan();
    // gauntlet on my viewmodel
    if (titan) this.g.r.vm.setStones?.(tt?.s ?? 0);
    // rigs: gems, poses, status visuals
    const myTeam = me?.team ?? 0;
    const camPos = this.g.r.camera.position;
    for (const [id, R] of this.g.rigs) {
      if (R.classId === 'titan') {
        const mask = Math.max(0, (R.tm || 1) - 1);
        R.rig.setStones(mask);
        if (R.root.visible && mask && Math.random() < dt * (2 + this.countBits(mask) * 2)) {
          const st = STONES.filter((s, i) => mask & (1 << i));
          R.rig.gauntletWorld(tmp);
          this.g.effects.spawn({ x: tmp.x + (Math.random() - 0.5) * 0.3, y: tmp.y + (Math.random() - 0.5) * 0.3, z: tmp.z + (Math.random() - 0.5) * 0.3, vy: 0.4, life: 0.6, size: 0.035, end: 0, color: C(st[(Math.random() * st.length) | 0]), g: -0.3, drag: 1 });
        }
      }
      const ps = this.poses.get(id);
      if (ps) { if (ps.until > t) R.rig.anim.pose = ps.pose; else { R.rig.anim.pose = null; this.poses.delete(id); } }
      this.statusFx(R, dt, R.tfx || 0, myTeam, titan, camPos);
    }
    for (const [id, f] of this.rigFx) if (!this.g.rigs.has(id)) { this.removeRigFx(f); this.rigFx.delete(id); }
    this.syncWorld(n.latest?.ti || null, dt);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      const k = w.t / w.life;
      w.m.scale.setScalar(0.2 + w.radius * Math.sqrt(k));
      w.m.material.opacity = 0.55 * (1 - k);
      if (k >= 1) { this.root.remove(w.m); w.m.geometry.dispose(); w.m.material.dispose(); this.waves.splice(i, 1); }
    }
    this.updateHud(dt, me, tt, titan);
    this.updateTint(dt, me);
    this.updateTracker(me, tt, titan);
  }

  countBits(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

  statusFx(R, dt, f, myTeam, titan, camPos) {
    let fx = this.rigFx.get(R.id);
    const need = f & (TFX.TIME | TFX.MIND | TFX.SAP);
    if (!fx && need) { fx = this.makeRigFx(); this.rigFx.set(R.id, fx); }
    const vis = R.root.visible;
    const p = R.root.position;
    if (fx) {
      fx.ring.visible = vis && !!(f & TFX.TIME);
      fx.halo.visible = vis && !!(f & TFX.MIND);
      if (fx.ring.visible) { fx.ring.position.set(p.x, p.y + 0.08, p.z); fx.ring.rotation.z += dt * 4 * ((R.ts || 100) / 100); }
      if (fx.halo.visible) { fx.halo.position.set(p.x, p.y + 2.45, p.z); fx.halo.rotation.z += dt * 3; }
    }
    if (!vis) return;
    const fxE = this.g.effects;
    if ((f & TFX.TIME) && Math.random() < dt * 14) fxE.spawn({ x: p.x + (Math.random() - 0.5) * 1, y: p.y + Math.random() * 2, z: p.z + (Math.random() - 0.5) * 1, vy: (R.ts || 100) > 100 ? 1.2 : 0.2, life: 0.6, size: 0.04, end: 0, color: C('time'), g: 0, drag: 1 });
    if ((f & TFX.SAP) && Math.random() < dt * 18) fxE.spawn({ x: p.x + (Math.random() - 0.5) * 0.9, y: p.y + Math.random() * 1.9, z: p.z + (Math.random() - 0.5) * 0.9, vy: 0.8, life: 0.7, size: 0.05, end: 0, color: Math.random() < 0.5 ? C('soul') : 0xffd090, g: -0.4, drag: 1 });
    if ((f & TFX.MIND) && Math.random() < dt * 10) fxE.spawn({ x: p.x, y: p.y + 2.4, z: p.z, vx: (Math.random() - 0.5), vy: 0.5, vz: (Math.random() - 0.5), life: 0.5, size: 0.04, end: 0, color: C('mind'), g: 0, drag: 2 });
    if ((f & TFX.GRAB) && Math.random() < dt * 16) fxE.spawn({ x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + Math.random() * 1.8, z: p.z + (Math.random() - 0.5) * 0.8, life: 0.4, size: 0.05, end: 0, color: C('power'), g: 0, drag: 3 });
    // ragdoll tumble while stunned by a Power Punch or a throw; recover smoothly afterwards
    const stun = !!(f & TFX.STUN);
    R.tumble = damp(R.tumble || 0, stun ? 1 : 0, stun ? 9 : 5, dt);
    if (stun || R.tumble > 0.01) {
      R.tumbleT = (R.tumbleT || 0) + dt * (stun ? 1 : 0.3);
      R.root.rotation.x = -R.tumble * (1.25 + Math.sin(R.tumbleT * 7) * 0.25);
      R.root.rotation.z = R.tumble * Math.sin(R.tumbleT * 5) * 0.5;
      R.rig.anim.pose = stun ? 'held' : R.rig.anim.pose === 'held' ? null : R.rig.anim.pose;
    } else if (R.root.rotation.x || R.root.rotation.z) { R.root.rotation.x = 0; R.root.rotation.z = 0; }
    if (f & TFX.GRAB) R.rig.anim.pose = 'held';
    else if (R.rig.anim.pose === 'held' && !stun) R.rig.anim.pose = null;
    // Soul gem: spectral orange silhouettes through walls for the Titan's side; passive sense up close
    const enemy = R.realTeam !== myTeam;
    const soul = enemy && !!(f & TFX.SOUL);
    const near = titan && enemy && Math.hypot(p.x - camPos.x, p.z - camPos.z) < TITAN.soul.passiveRadius;
    if (soul || near) {
      R.xray.visible = true;
      R.xray.material.color.setHex(0xff8a1a);
      R.xray.material.opacity = soul ? 0.42 + Math.sin(this.g.time * 6) * 0.08 : 0.22;
    } else if (R.xray.material.opacity !== 0.28) R.xray.material.opacity = 0.28;
  }
  makeRigFx() {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 24, 1, 0, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: C('time'), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: C('mind') }));
    halo.rotation.x = Math.PI / 2;
    ring.visible = halo.visible = false;
    this.root.add(ring, halo);
    return { ring, halo };
  }
  removeRigFx(f) { this.root.remove(f.ring, f.halo); }

  // Illusions and portals from the snapshot (added / moved / removed by id).
  syncWorld(ti, dt) {
    const seenI = new Set(), seenP = new Set();
    for (const a of ti?.il || []) {
      const [id, mat, x0, y0, z0, x1, y1, z1] = a;
      seenI.add(id);
      let m = this.illusions.get(id);
      if (!m) {
        m = illusionMesh(mat, x1 - x0, y1 - y0, z1 - z0);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        this.root.add(m);
        this.illusions.set(id, m);
      }
      // a faint red shimmer gives the illusion away to anyone who looks closely
      const k = Math.max(0, Math.sin(this.g.time * 2.3 + id) - 0.75) * 4;
      m.material.emissive.setRGB(0.35 * k, 0, 0);
      if (Math.random() < dt * 0.8) this.g.effects.spawn({ x: m.position.x + (Math.random() - 0.5) * (x1 - x0), y: y1, z: m.position.z + (Math.random() - 0.5) * (z1 - z0), vy: 0.3, life: 0.6, size: 0.03, end: 0, color: C('reality'), g: -0.2, drag: 1 });
    }
    for (const [id, m] of this.illusions) if (!seenI.has(id)) { this.root.remove(m); m.geometry.dispose(); m.material.dispose(); this.illusions.delete(id); }
    for (const a of ti?.po || []) {
      const [id, owner, kind, x, y, z, yaw] = a;
      seenP.add(id);
      let m = this.portals.get(id);
      if (!m) { m = portalMesh(kind); this.root.add(m); this.portals.set(id, m); }
      m.position.set(x, y, z);
      m.rotation.y = yaw;
      m.userData.arms.rotation.z += dt * (kind === 0 ? 2.6 : -2.6);
      m.userData.rim.scale.setScalar(1 + Math.sin(this.g.time * 4 + id) * 0.03);
      if (Math.random() < dt * 20) {
        const a2 = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 0.3;
        const lx = Math.cos(a2) * r, ly = Math.sin(a2) * r;
        this.g.effects.spawn({ x: x + Math.cos(yaw) * lx, y: y + ly, z: z - Math.sin(yaw) * lx, vx: -Math.cos(yaw) * lx * 0.8, vy: -ly * 0.8, vz: Math.sin(yaw) * lx * 0.8, life: 0.5, size: 0.04, end: 0, color: kind === 0 ? 0x2f5cff : 0x9ac4ff, g: 0, drag: 0 });
      }
      void owner;
    }
    for (const [id, m] of this.portals) if (!seenP.has(id)) { this.root.remove(m); this.portals.delete(id); }
  }

  // While the Mind gem controls someone, the camera rides behind them.
  cameraOverride(cam, aimYaw, aimPitch, dt) {
    const tt = this.me?.tt;
    if (!tt || tt.ctl < 0) { this.ctlCam = null; return false; }
    const R = this.g.rigs.get(tt.ctl);
    if (!R) return false;
    const p = R.root.position;
    const f = dirFromAngles(aimYaw, 0);
    const want = new THREE.Vector3(p.x - f[0] * 3.6 + Math.cos(aimYaw) * 0.7, p.y + 2.5 - aimPitch * 1.2, p.z - f[2] * 3.6 - Math.sin(aimYaw) * 0.7);
    if (!this.ctlCam) this.ctlCam = want.clone();
    this.ctlCam.lerp(want, 1 - Math.exp(-dt * 10));
    cam.position.copy(this.ctlCam);
    cam.rotation.set(aimPitch * 0.85 - 0.12, aimYaw, 0);
    this.g.r.vm.visible = false;
    return true;
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const root = this.g.ui.root;
    const mk = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
    this.hud = mk('titan-hud', `
      <div class="th-gems">${STONES.map((s) => `<button class="th-gem" data-s="${s}" style="--gc:${STONE_INFO[s].css}"><i></i><b>${STONE_INFO[s].name}</b><kbd>${STONE_INFO[s].key}</kbd><em class="cd"></em></button>`).join('')}
        <button class="th-gem th-snap" data-s="snap"><i></i><b>Snap</b><kbd>E</kbd><em class="cd"></em></button></div>
      <div class="th-info"><span class="th-time"></span><span class="th-status"></span></div>`);
    this.hud.style.display = 'none';
    this.hud.querySelectorAll('.th-gem').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const s = b.dataset.s;
      this.trigger(s === 'power' ? 'punch' : s);
    }));
    this.track = mk('titan-track');
    this.track.style.display = 'none';
    this.tint = mk('titan-tint');
    this.banner = mk('titan-banner');
    this.label = mk('titan-label');
  }

  updateHud(dt, me, tt, titan) {
    this.hud.style.display = titan && me?.alive ? '' : 'none';
    if (!titan || !tt) return;
    const t = this.g.time;
    for (const b of this.hud.querySelectorAll('.th-gem')) {
      const s = b.dataset.s;
      let owned, cd = 0, active = false;
      if (s === 'snap') { owned = tt.snap === 1 || tt.snap === 3; b.classList.toggle('spent', tt.snap === 2); active = tt.snap === 3; }
      else {
        owned = hasStone(tt.s, s);
        const key = s === 'power' ? 'punch' : s;
        cd = tt.cd?.[key] || 0;
        active = (s === 'mind' && tt.ctl >= 0) || (s === 'soul' && tt.soul > 0) || (s === 'power' && tt.gr >= 0);
      }
      b.classList.toggle('owned', !!owned);
      b.classList.toggle('active', !!active);
      const em = b.querySelector('.cd');
      const txt = owned && cd > 0.05 ? Math.ceil(cd) : '';
      if (em.textContent !== String(txt)) em.textContent = txt;
      b.classList.toggle('cooling', !!txt);
    }
    const val = TITAN.time.steps[tt.ts ?? TITAN.time.defaultStep];
    const timeEl = this.hud.querySelector('.th-time');
    const tTxt = hasStone(tt.s, 'time') ? `Time strength ×${val} ${val < 1 ? '(slow)' : '(fast)'} · Z / X` : 'Kill to claim gems · each gem is a new power';
    if (timeEl.textContent !== tTxt) timeEl.textContent = tTxt;
    const st = [];
    const nm = (id) => this.net.roster.get(id)?.name || '?';
    if (tt.ctl >= 0) st.push(`<b style="color:${STONE_INFO.mind.css}">Controlling ${esc(nm(tt.ctl))} · ${Math.ceil(tt.ctlT)}s</b> (2 to release)`);
    if (tt.gr >= 0) st.push(`<b style="color:${STONE_INFO.power.css}">Holding ${esc(nm(tt.gr))}</b> (G to throw)`);
    if (tt.soul > 0) st.push(`<b style="color:${STONE_INFO.soul.css}">Souls revealed · ${Math.ceil(tt.soul)}s</b>`);
    if (tt.sm && hasStone(tt.s, 'reality')) st.push(`<span style="color:${STONE_INFO.reality.css}">Copied: ${esc(tt.sm.replace(/_/g, ' '))}</span>`);
    const sEl = this.hud.querySelector('.th-status');
    const html = st.join(' · ');
    if (sEl.innerHTML !== html) sEl.innerHTML = html;
    void t; void dt;
  }

  // Screen tints for whoever is affected (time, mind, soul sap, stun, grab).
  updateTint(dt, me) {
    const f = me?.alive ? (me.fx || 0) : 0;
    let col = null, label = '';
    if (f & TFX.MIND) { col = 'rgba(255,224,58,.28)'; label = 'MIND CONTROLLED'; }
    else if (f & TFX.GRAB) { col = 'rgba(180,76,255,.28)'; label = 'HELD'; }
    else if (f & TFX.STUN) { col = 'rgba(180,76,255,.2)'; label = 'STUNNED'; }
    else if (f & TFX.SAP) { col = 'rgba(255,138,26,.22)'; label = 'SOUL SAPPED · slowed, weaker attacks'; }
    else if (f & TFX.TIME) { const ts = me.ts ?? 1; col = 'rgba(60,255,114,.18)'; label = `TIME ×${ts.toFixed(2)}`; }
    if (this.flashT > 0) { this.flashT -= dt; }
    const flashing = this.flashT > 0;
    if (!flashing) this.tint.style.background = col ? `radial-gradient(ellipse at center, transparent 45%, ${col} 100%)` : 'none';
    if (this.label.textContent !== label) this.label.textContent = label;
    this.label.style.display = label ? '' : 'none';
    if (f & TFX.STUN) this.g.shake = Math.max(this.g.shake, 0.25);
  }
  screenFlash(css, dur, mode = 'flash') {
    this.flashT = dur;
    const bg = mode === 'dim' ? `radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,.55) 100%)` : mode === 'pulse' ? `radial-gradient(ellipse at center, transparent 30%, ${css} 100%)` : css;
    this.tint.style.transition = 'none';
    this.tint.style.background = bg;
    this.tint.style.opacity = mode === 'flash' ? '0.55' : '1';
    requestAnimationFrame(() => { this.tint.style.transition = `opacity ${dur}s ease-out`; this.tint.style.opacity = '0'; });
    setTimeout(() => { this.tint.style.transition = 'none'; this.tint.style.opacity = '1'; this.flashT = 0; }, dur * 1000 + 30);
  }
  showBanner(title, sub, css) {
    this.banner.innerHTML = `<b style="color:${css};text-shadow:0 0 18px ${css}">${esc(title)}</b><span>${esc(sub)}</span>`;
    this.banner.classList.remove('show'); void this.banner.offsetWidth; this.banner.classList.add('show');
  }

  // Soul gem tracker: every enemy's name, status, distance and direction while the reveal lasts.
  updateTracker(me, tt, titan) {
    const on = titan && tt?.soul > 0;
    this.track.style.display = on ? '' : 'none';
    if (!on) return;
    const n = this.net, cam = this.g.r.camera;
    const rows = [];
    for (const r of n.roster.values()) {
      if (r.team === me.team) continue;
      const R = this.g.rigs.get(r.id);
      const s = R?.root;
      let dist = '', arrow = '';
      if (s && R.alive) {
        const dx = s.position.x - cam.position.x, dz = s.position.z - cam.position.z;
        dist = `${Math.round(Math.hypot(dx, dz))}m`;
        const ang = wrapAngle(Math.atan2(-dx, -dz) - this.g.yaw);
        arrow = `<i class="arr" style="transform:rotate(${(-ang).toFixed(2)}rad)">▲</i>`;
      }
      const status = !r.alive ? 'eliminated' : (R?.flags & 512) ? 'just respawned' : (R?.tfx & TFX.SAP) ? 'sapped' : 'alive';
      rows.push(`<div class="${r.alive ? '' : 'dead'}">${arrow}<b>${esc(r.name)}</b><span>${status}</span><em>${dist}</em></div>`);
    }
    const html = `<h4>Souls · ${TEAM_NAMES[1 - me.team] || ''}</h4>${rows.join('') || '<div><span>No enemies</span></div>'}`;
    if (this.track.innerHTML !== html) this.track.innerHTML = html;
  }
}

export { ALL_STONES };
