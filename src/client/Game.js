// Client match orchestrator: binds the network session (prediction + interpolation) to the renderer,
// characters, viewmodel, effects, audio and HUD. One Game instance per joined match.
import * as THREE from 'three';
import { NetClient } from './net/NetClient.js';
import { MapRenderer } from './render/MapRenderer.js';
import { Effects } from './render/Effects.js';
import { CharacterRig } from './render/CharacterModel.js';
import { buildWeapon } from './render/WeaponModels.js';
import { bx, cyl, colorMat } from './render/blocks.js';
import { textTexture } from './render/textures.js';
import { PROJECTILE_KINDS, projectileOrigin } from '../server/projectiles.js';
import { CLASSES, CLASS_IDS, getClass } from '../shared/config/classes.js';
import { WEAPONS, ABILITY_SOURCES } from '../shared/config/weapons.js';
import { MODES } from '../shared/config/modes.js';
import { PF, MATCH_STATE, TEAM_COLORS_HEX, TEAM_NAMES, FLAG_STATE, EYE_HEIGHT, CROUCH_EYE_HEIGHT, otherTeam } from '../shared/constants.js';
import { shotDirections } from '../shared/weaponLogic.js';
import { dirFromAngles, damp, clamp, wrapAngle } from '../shared/math.js';

const CLASS_BY_INDEX = CLASS_IDS.reduce((a, id) => { a[CLASSES[id].index] = id; return a; }, {});
const tmpV = new THREE.Vector3();
const shadeHex = (c, f) => (Math.min(255, ((c >> 16) & 255) * f) << 16) | (Math.min(255, ((c >> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f);
const tmpV2 = new THREE.Vector3();

export class Game {
  constructor(app, transport, hello, meta = {}) {
    this.app = app;
    this.r = app.renderer;
    this.audio = app.audio;
    this.ui = app.ui;
    this.settings = app.settings;
    this.input = app.input;
    this.meta = meta;
    this.net = new NetClient(transport, hello);
    this.rigs = new Map();
    this.projMeshes = new Map();
    this.predicted = new Map();
    this.turrets = new Map();
    this.pickupMeshes = [];
    this.flagObjs = [null, null];
    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.shake = 0;
    this.fov = this.settings.fov;
    this.eye = EYE_HEIGHT;
    this.footDist = 0;
    this.prevSlot = 0;
    this.lastSlot = 0;
    this.time = 0;
    this.streak = 0;
    this.playedClasses = new Set();
    this.deathInfo = null;
    this.running = true;
    this.mapObjects = new THREE.Group();
    this.r.scene.add(this.mapObjects);
    this.bindNet();
  }

  bindNet() {
    const n = this.net;
    n.on('welcome', (m) => this.onWelcome(m))
      .on('mapchange', (m) => this.onWelcome(m))
      .on('events', (e) => this.onEvents(e))
      .on('roster', (r) => this.ui.hud.setRoster(r, n.myId))
      .on('results', (r) => this.onResults(r))
      .on('chat', (m) => this.ui.hud.chatMessage(m))
      .on('notice', (m) => this.ui.hud.notify(m.text, m.short ? 'short' : 'info'))
      .on('spawned', (me) => this.onSpawned(me))
      .on('died', () => this.onDied())
      .on('matchstate', (st, prev) => this.onMatchState(st, prev))
      .on('error', (reason) => this.app.onSessionError(reason))
      .on('close', (reason) => { if (this.running) this.app.onSessionError(reason || 'Disconnected'); });
    n.start();
  }

  // ---------------------------------------------------------------- map load
  onWelcome(m) {
    this.clearWorld();
    const map = this.net.map;
    this.map = map;
    this.mapRenderer = new MapRenderer(this.r.scene, this.r.quality).build(map);
    this.effects = this.effects || new Effects(this.r.scene, this.r.quality, this.net.world);
    this.effects.setWorld(this.net.world);
    this.effects.clear();
    this.buildPickups(map);
    if (m.mode === 'ctf') this.buildFlags(map);
    this.audio.startAmbience(map.env.ambience);
    this.ui.hud.setup({ mode: m.mode, map, room: m.room, isHost: m.isHost, net: this.net });
    this.ui.onGameReady(this);
    const sp = map.spawns[0];
    this.yaw = sp ? sp.yaw : 0;
  }

  clearWorld() {
    if (this.mapRenderer) { this.mapRenderer.dispose(); this.mapRenderer = null; }
    for (const r of this.rigs.values()) this.removeRig(r);
    this.rigs.clear();
    for (const m of this.projMeshes.values()) this.mapObjects.remove(m);
    this.projMeshes.clear();
    for (const p of this.predicted.values()) this.mapObjects.remove(p.mesh);
    this.predicted.clear();
    for (const t of this.turrets.values()) this.mapObjects.remove(t.g);
    this.turrets.clear();
    for (const p of this.pickupMeshes) this.mapObjects.remove(p);
    this.pickupMeshes = [];
    for (const f of this.flagObjs) if (f) this.mapObjects.remove(f.g);
    this.flagObjs = [null, null];
    this.audio.stopLoops();
  }

  buildPickups(map) {
    map.pickups.forEach((p) => {
      const g = new THREE.Group();
      const s = p.size === 'small' ? 0.6 : p.size === 'medium' ? 0.8 : 1.0;
      if (p.kind === 'health') {
        bx(g, 0, 0, 0, 0.7 * s, 0.45 * s, 0.5 * s, 0xf2f2f2);
        bx(g, 0, 0.12 * s, -0.255 * s, 0.4 * s, 0.12 * s, 0.02, 0xd83a2a, { basic: true });
        bx(g, 0, 0.02 * s, -0.255 * s, 0.12 * s, 0.32 * s, 0.02, 0xd83a2a, { basic: true });
        bx(g, 0, 0.45 * s, 0, 0.3 * s, 0.06 * s, 0.1 * s, 0x777777);
      } else {
        bx(g, 0, 0, 0, 0.7 * s, 0.4 * s, 0.45 * s, 0x5e6a3a);
        bx(g, 0, 0.4 * s, 0, 0.72 * s, 0.06 * s, 0.47 * s, 0x3f4626);
        for (let i = 0; i < 3; i++) bx(g, -0.2 * s + i * 0.2 * s, 0.46 * s, 0, 0.08 * s, 0.18 * s, 0.08 * s, 0xc9a14a);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.45 * s, 0.55 * s, 16), new THREE.MeshBasicMaterial({ color: p.kind === 'health' ? 0x7dff6a : 0xffd04a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      const base = new THREE.Group();
      base.position.set(...p.pos);
      g.position.y = 0.25;
      base.add(g, ring);
      base.userData = { item: g, ring, idx: p.idx };
      this.mapObjects.add(base);
      this.pickupMeshes.push(base);
    });
  }

  buildFlags(map) {
    for (const team of [0, 1]) {
      const g = new THREE.Group();
      const col = TEAM_COLORS_HEX[team];
      const pole = bx(g, 0, 0, 0, 0.08, 2.2, 0.08, 0x666666);
      const cloth = new THREE.Group();
      cloth.position.set(0, 1.5, 0);
      bx(cloth, 0.45, 0, 0, 0.9, 0.6, 0.04, col);
      bx(cloth, 0.45, 0.2, 0, 0.3, 0.2, 0.05, 0xffffff, { basic: true });
      g.add(cloth);
      // intel briefcase marker
      const brief = bx(g, 0, 0.0, 0, 0.6, 0.4, 0.2, col);
      bx(g, 0, 0.4, 0, 0.25, 0.08, 0.05, 0x333333);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.y = 15;
      g.add(beacon);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 24, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false;
      g.add(ring);
      g.position.set(...map.flags[team]);
      this.mapObjects.add(g);
      this.flagObjs[team] = { g, cloth, beacon, ring, pole, brief };
    }
  }

  // ---------------------------------------------------------------- local life cycle
  onSpawned(me) {
    this.yaw = this.net.ms.yaw;
    this.pitch = 0;
    this.recoil = 0;
    this.deathInfo = null;
    this.playedClasses.add(me.cls);
    this.ui.hud.onSpawn(me);
    this.updateViewmodel(true);
    this.audio.equip();
    this.streak = 0;
  }

  onDied() {
    this.ui.hud.onDeath(this.deathInfo);
    this.r.vm.visible = false;
  }

  onMatchState(st, prev) {
    this.ui.hud.matchState(st, prev);
    if (st === MATCH_STATE.OVERTIME) { this.audio.jingle('overtime'); this.audio.announce('Overtime!'); }
  }

  onResults(r) {
    const me = r.players.find((p) => p.id === this.net.myId);
    const won = me && r.winner === me.team;
    this.audio.jingle(r.winner === -1 ? 'defeat' : won ? 'victory' : 'defeat');
    this.audio.announce(r.winner === -1 ? 'Stalemate' : `${TEAM_NAMES[r.winner]} team wins!`);
    const summary = this.app.profile.applyMatch(r, this.net.myId, [...this.playedClasses]);
    this.playedClasses.clear();
    this.input.exitLock();
    this.ui.showResults(r, summary, this.net.myId);
  }

  updateViewmodel(force) {
    const me = this.net.me;
    if (!me || !this.net.ws) return;
    const slot = this.net.ws.slot;
    const wid = this.net.ws.w[slot].id;
    const cos = this.app.profile.cosmetics(me.cls);
    this.r.vm.setLoadout(me.cls, me.team, wid, cos.weaponSkin, cos.gloves);
    if (force) this.r.vm.onEquip();
  }

  // ---------------------------------------------------------------- frame
  frame(dt) {
    if (!this.running) return;
    this.time += dt;
    const n = this.net;
    const inp = this.input.sample();
    const ui = this.ui;
    const chatting = ui.hud.chatOpen;
    // look
    const me = n.me;
    const scoped = !!(n.ws && n.ws.scoped);
    const scopeMul = scoped ? 0.35 : 1;
    const sens = 0.0022 * this.settings.sensitivity * scopeMul;
    if (!chatting) {
      this.yaw = wrapAngle(this.yaw - inp.lookDX * sens * this.settings.sensX);
      this.pitch = clamp(this.pitch - inp.lookDY * sens * this.settings.sensY * (this.settings.invertY ? -1 : 1), -1.5, 1.5);
    }
    // actions
    for (const a of inp.actions) this.handleAction(a);
    const buttons = chatting || ui.menuOpen ? 0 : inp.buttons;
    this.lastButtons = buttons;
    this.lastDt = dt;
    // recoil recovery
    this.recoil = damp(this.recoil, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);
    const aimPitch = clamp(this.pitch + this.recoil, -1.55, 1.55);
    const aimYaw = this.yaw + this.recoilYaw;
    const outs = n.update(dt, { buttons, yaw: aimYaw, pitch: aimPitch });
    for (const o of outs) this.handleLocalStep(o);
    if (n.ws && n.ws.slot !== this.prevSlot) { this.lastSlot = this.prevSlot; this.prevSlot = n.ws.slot; this.updateViewmodel(true); }
    if (!this.map) return;

    this.updateCamera(dt, aimYaw, aimPitch);
    this.updateRemotePlayers(dt);
    this.updateProjectiles(dt);
    this.updateTurrets(dt);
    this.updateFlags(dt);
    this.updatePickups(dt);
    this.updateBeamsAndLoops(dt);
    this.effects.update(dt);
    this.mapRenderer.update(dt, this.r.camera.position);
    this.updateAudioListener();
    // viewmodel
    const ws = n.ws;
    if (ws && me && me.alive) {
      const w = ws.w[ws.slot];
      const def = WEAPONS[w.id];
      this.r.vm.visible = !ui.thirdPerson;
      this.r.vm.update(dt, {
        speed: Math.hypot(n.ms.vx, n.ms.vz), grounded: n.ms.grounded, sprint: n.ms.sprinting, crouch: n.ms.crouch,
        scoped, spun: def.spinUp ? w.spin > 0 : false, firing: !!(buttons & 128), lookDX: inp.lookDX, lookDY: inp.lookDY,
        bobScale: this.settings.reduceMotion ? 0.2 : this.settings.viewBob, aspect: this.r.aspect,
      });
    }
    ui.hud.update(this.hudState());
    this.r.renderGame(!!(me && me.alive) && !scoped);
  }

  handleAction(a) {
    const n = this.net;
    switch (a.type) {
      case 'slot': n.selectSlot(a.slot); break;
      case 'lastslot': n.selectSlot(this.lastSlot); break;
      case 'cycle': if (n.ws) n.selectSlot((n.desiredSlot + (a.dir > 0 ? 1 : 2)) % 3); break;
      case 'scoreboard': this.ui.hud.showScoreboard(a.toggle ? !this.ui.hud.sbVisible : a.on); break;
      case 'pause': this.ui.openPause(); break;
      case 'classmenu': this.ui.openClassMenu(true); break;
      case 'teammenu': this.ui.openTeamMenu(); break;
      case 'chat': this.ui.hud.openChat(a.team); break;
      default:
    }
  }

  // Effects for locally-predicted weapon events (instant feedback).
  handleLocalStep(o) {
    const n = this.net;
    if (o.jumped) this.audio.jump(true, null, false);
    if (o.doubleJumped) { this.audio.jump(true, null, true); this.effects.burst(n.ms.x, n.ms.y + 0.1, n.ms.z, 10, { color: [0xffffff, 0xd8e8ff], speed: 2, life: 0.4, size: 0.08, g: 2 }); this.r.vm.onAbility('jump'); }
    if (o.impact > 9) { this.audio.land(true, o.impact); this.r.vm.onLand(o.impact); if (o.impact > 14) this.shake = Math.max(this.shake, 0.25); }
    for (const ev of o.events) {
      const def = ev.weaponId ? WEAPONS[ev.weaponId] : null;
      switch (ev.type) {
        case 'fire': this.localFire(ev, def, o.cmd); break;
        case 'swing': this.r.vm.onSwing(); this.audio.swing(null, true, def && def.damage >= 55); break;
        case 'reload_start': {
          const w = n.ws.w[n.ws.slot]; const d = WEAPONS[w.id];
          const cls = getClass(n.classId);
          const dur = (d.reloadMode === 'mag' ? d.reloadTime : d.reloadStart) / cls.reloadSpeed;
          this.r.vm.onReload(d.reloadMode === 'mag' ? dur : 9, d.reloadMode);
          this.audio.reload(d.reloadMode, null, true);
          break;
        }
        case 'reload_shell': this.audio.shellIn(true); break;
        case 'reload_done': case 'reload_cancel': this.r.vm.onReloadDone(); break;
        case 'switch': this.audio.equip(); break;
        case 'empty': this.audio.dryFire(true); break;
        case 'scope': this.ui.hud.setScope(ev.on); break;
        case 'spinup': this.audio.loop('localspin', 'spin', null, true); break;
        case 'spindown': this.audio.loop('localspin', 'spin', null, false); break;
        default:
      }
    }
  }

  localFire(ev, def, cmd) {
    const n = this.net;
    this.r.vm.onFire(def);
    const rp = def.recoil || { pitch: 0.01, yaw: 0 };
    const supp = n.abilityActive('suppression') ? 0.5 : 1;
    this.recoil += rp.pitch * supp;
    this.recoilYaw += (Math.random() - 0.5) * rp.yaw * 2 * supp;
    if (def.type === 'flame' || def.type === 'beam') return;
    this.audio.weaponFire(def.id, null, true);
    const cam = this.r.camera;
    const muzzle = this.r.vm.muzzleWorld(cam, new THREE.Vector3());
    const eye = [n.ms.x, n.ms.y + (n.ms.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), n.ms.z];
    if (def.type === 'hitscan' || def.type === 'repair') {
      const dirs = shotDirections(ev.y, ev.p, ev.spread, def.pellets, ev.seed);
      for (const d of dirs) {
        const range = def.type === 'repair' ? def.repair.range : def.range;
        const h = n.world.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], range);
        const t = h ? h.t : range;
        const end = [eye[0] + d[0] * t, eye[1] + d[1] * t, eye[2] + d[2] * t];
        if (def.type === 'hitscan' && (def.pellets === 1 || Math.random() < 0.5)) this.effects.tracer([muzzle.x, muzzle.y, muzzle.z], end, def.tracer, def.scope ? 0.035 : 0.02);
        if (h && def.type === 'hitscan') { this.effects.impact(end, h.normal, 'world'); if (def.pellets === 1 || Math.random() < 0.3) this.audio.impact('world', end); }
      }
      this.effects.muzzle(muzzle, dirFromAngles(ev.y, ev.p), def.type);
    } else if (def.type === 'projectile') {
      this.effects.muzzle(muzzle, dirFromAngles(ev.y, ev.p), def.type, 0xffb060);
      const pr = def.projectile;
      const dirs = shotDirections(ev.y, ev.p, ev.spread, def.pellets, ev.seed);
      const origin = projectileOrigin(eye, ev.y, ev.p);
      for (const d of dirs) {
        const key = `${n.myId}:${ev.shot}`;
        const mesh = this.projectileMesh(pr.kind, n.me.team);
        mesh.position.set(muzzle.x, muzzle.y, muzzle.z);
        this.mapObjects.add(mesh);
        this.predicted.set(key, {
          mesh, x: origin[0], y: origin[1], z: origin[2], vx: d[0] * pr.speed, vy: d[1] * pr.speed + (pr.gravity > 8 ? 2.2 : 0), vz: d[2] * pr.speed,
          g: pr.gravity, life: pr.lifetime, bounce: pr.bounce || 0, blend: 0, mx: muzzle.x, my: muzzle.y, mz: muzzle.z, dead: false,
        });
      }
    }
    void cmd;
  }

  projectileMesh(kind, team) {
    const g = new THREE.Group();
    const col = TEAM_COLORS_HEX[team];
    switch (kind) {
      case 'rivet': bx(g, 0, -0.03, 0, 0.05, 0.05, 0.28, 0xffc060, { basic: true }); break;
      case 'arrow': bx(g, 0, -0.02, 0, 0.03, 0.03, 0.7, 0x6e4220); bx(g, 0, -0.025, -0.36, 0.06, 0.06, 0.08, 0xc8cdd2); bx(g, 0, -0.02, 0.3, 0.02, 0.1, 0.12, col); break;
      case 'bolt': bx(g, 0, -0.02, 0, 0.04, 0.04, 0.45, 0x34373d); bx(g, 0, -0.025, -0.24, 0.07, 0.07, 0.06, 0xc8cdd2); bx(g, 0, -0.02, 0.2, 0.02, 0.08, 0.08, col); break;
      case 'syringe': bx(g, 0, -0.03, 0, 0.05, 0.05, 0.25, 0x7fffb0, { basic: true }); bx(g, 0, -0.02, 0.12, 0.08, 0.04, 0.04, 0xffffff); break;
      case 'flare': bx(g, 0, -0.08, 0, 0.16, 0.16, 0.16, 0xffa030, { basic: true }); break;
      case 'shell': bx(g, 0, -0.1, 0, 0.2, 0.2, 0.5, 0x5e6a3a); bx(g, 0, -0.06, -0.27, 0.12, 0.12, 0.08, col); bx(g, 0, -0.07, 0.27, 0.14, 0.14, 0.06, 0xffa030, { basic: true }); break;
      case 'charge': bx(g, 0, -0.13, 0, 0.26, 0.26, 0.26, 0x3a3a3a); bx(g, 0, -0.05, 0, 0.28, 0.08, 0.28, col); break;
      case 'detcharge': bx(g, 0, -0.1, 0, 0.36, 0.2, 0.36, 0x545c3c); bx(g, 0, 0.1, 0, 0.12, 0.06, 0.12, 0xff3030, { basic: true, name: 'blink' }); break;
      default: bx(g, 0, -0.05, 0, 0.1, 0.1, 0.1, 0xffffff, { basic: true });
    }
    g.userData.kind = kind;
    return g;
  }

  // ---------------------------------------------------------------- camera
  updateCamera(dt, aimYaw, aimPitch) {
    const n = this.net;
    const cam = this.r.camera;
    const me = n.me;
    const alive = me && me.alive;
    if (alive) {
      const p = n.renderPos();
      const targetEye = n.ms.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
      this.eye = damp(this.eye, targetEye, 14, dt);
      cam.position.set(p[0], p[1] + this.eye, p[2]);
      cam.rotation.set(aimPitch, aimYaw, 0);
      this.deathCam = null;
    } else if (me) {
      // death cam: orbit the death spot looking at the killer
      if (!this.deathCam) this.deathCam = { x: n.ms.x, y: n.ms.y + 1.2, z: n.ms.z, t: 0 };
      const dc = this.deathCam;
      dc.t += dt;
      let target = null;
      if (this.deathInfo && this.deathInfo.killer >= 0) target = this.rigs.get(this.deathInfo.killer);
      const back = Math.min(4, 1 + dc.t * 3);
      const ang = this.yaw + dc.t * 0.2;
      cam.position.set(dc.x + Math.sin(ang) * back, dc.y + 1 + Math.min(1.5, dc.t), dc.z + Math.cos(ang) * back);
      if (target && target.root.visible) cam.lookAt(target.root.position.x, target.root.position.y + 1.2, target.root.position.z);
      else cam.lookAt(dc.x, dc.y, dc.z);
    }
    // FOV: sprint widen, scope zoom
    let fov = this.settings.fov;
    const ws = n.ws;
    if (ws && ws.scoped && alive) fov = WEAPONS[ws.w[ws.slot].id].scope?.fov || 30;
    else if (alive && n.ms.sprinting && !this.settings.reduceMotion) fov += 5;
    this.fov = damp(this.fov, fov, 12, dt);
    // camera shake
    if (this.shake > 0) {
      const s = this.shake * this.settings.cameraShake * (this.settings.reduceMotion ? 0.25 : 1) * 0.04;
      cam.rotation.x += (Math.random() - 0.5) * s;
      cam.rotation.y += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    // vertical FOV from horizontal-ish preference (keep consistent across aspect ratios)
    const aspect = this.r.aspect;
    // Adrenaline Rush widens the view a little for a sense of speed
    this.fovBoost = damp(this.fovBoost || 0, this.net.abilityActive?.('adrenaline') ? 8 : 0, 6, dt);
    const fovH = this.fov + this.fovBoost;
    const vfov = aspect >= 4 / 3 ? 2 * Math.atan(Math.tan((fovH * Math.PI) / 360) / (4 / 3)) * 180 / Math.PI : fovH * 0.82;
    if (Math.abs(cam.fov - vfov) > 0.01) { cam.fov = vfov; cam.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------------- remote players
  appearanceFor(a, rosterEntry) {
    // a = snapshot array; returns { classId, team }
    const myTeam = this.net.me ? this.net.me.team : 0;
    const realTeam = rosterEntry ? rosterEntry.team : 0;
    const realClass = CLASS_BY_INDEX[a[9]] || 'scout';
    const flags = a[7];
    if ((flags & PF.DISGUISED) && a[11] >= 0 && realTeam !== myTeam) {
      return { classId: CLASS_BY_INDEX[a[11] % 16] || realClass, team: Math.floor(a[11] / 16), disguised: true };
    }
    return { classId: realClass, team: realTeam, disguised: !!(flags & PF.DISGUISED) };
  }

  ensureRig(id, ap, entry) {
    let R = this.rigs.get(id);
    const key = `${ap.classId}|${ap.team}|${JSON.stringify(entry?.cos || {})}`;
    if (R && R.key === key) return R;
    if (R) this.removeRig(R);
    const rig = new CharacterRig(ap.classId, ap.team, { cosmetics: entry?.cos });
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = this.r.quality.shadows; });
    this.mapObjects.add(rig.root);
    R = { id, rig, root: rig.root, key, classId: ap.classId, team: ap.team, lastPos: null, foot: 0, alive: true, nameTag: null, nameKey: '', slot: -1, flags: 0 };
    // x-ray silhouette for revealed enemies / teammates through walls
    const xr = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.8, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }));
    xr.position.y = 0.95;
    xr.renderOrder = 20;
    xr.visible = false;
    rig.root.add(xr);
    R.xray = xr;
    this.rigs.set(id, R);
    return R;
  }

  removeRig(R) {
    this.mapObjects.remove(R.root);
    if (R.nameTag) R.nameTag.material.map?.dispose();
    R.rig.dispose();
  }

  nameTag(R, entry, hp, maxHp, isTeammate, ap) {
    const name = ap.disguised && !isTeammate ? (this.net.roster.get(R.fakeId)?.name || entry?.name) : entry?.name || '?';
    const pct = Math.round(clamp(hp / Math.max(1, maxHp), 0, 1.5) * 20);
    const key = `${name}|${pct}|${ap.team}|${ap.disguised ? 1 : 0}`;
    if (key === R.nameKey) return;
    R.nameKey = key;
    const c = document.createElement('canvas');
    c.width = 160; c.height = 40;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 14px Verdana, "DejaVu Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const tw = Math.min(156, ctx.measureText(name).width + 12);
    ctx.fillRect(80 - tw / 2, 2, tw, 20);
    ctx.fillStyle = ap.team === 1 ? '#8fb8ff' : '#ff9a8a';
    ctx.fillText(name + (ap.disguised && isTeammate ? ' 🎭' : ''), 80, 17);
    if (isTeammate) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(30, 27, 100, 7);
      ctx.fillStyle = pct > 20 ? '#6af0ff' : pct > 10 ? '#7dff6a' : pct > 5 ? '#ffd04a' : '#ff5a4a';
      ctx.fillRect(31, 28, Math.min(98, 98 * pct / 20), 5);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (!R.nameTag) {
      R.nameTag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      R.nameTag.scale.set(1.6, 0.4, 1);
      R.nameTag.renderOrder = 30;
      this.mapObjects.add(R.nameTag);
    } else { R.nameTag.material.map.dispose(); R.nameTag.material.map = tex; }
  }

  updateRemotePlayers(dt) {
    const n = this.net;
    const seen = new Set();
    const myTeam = n.me ? n.me.team : 0;
    const cam = this.r.camera;
    const camFwd = cam.getWorldDirection(tmpV2);
    for (const [id] of n.history) {
      if (id === n.myId) continue;
      const s = n.sample(id);
      if (!s) continue;
      const entry = n.roster.get(id);
      if (!entry) continue;
      const a = s.a;
      seen.add(id);
      const alive = !!(a[7] & PF.ALIVE);
      const ap = this.appearanceFor(a, entry);
      const R = this.ensureRig(id, ap, entry);
      R.fakeId = a[12];
      R.flags = a[7];
      R.realTeam = entry.team;
      R.hp = a[6];
      if (!alive || s.stale > 1.5) {
        R.root.visible = false;
        if (R.nameTag) R.nameTag.visible = false;
        R.alive = false;
        continue;
      }
      if (!R.alive) { R.alive = true; R.lastPos = null; }
      R.root.visible = true;
      R.root.position.set(s.x, s.y, s.z);
      R.root.rotation.y = s.yaw;
      const slot = a[8];
      const cls = getClass(CLASS_BY_INDEX[a[9]]);
      const weaponId = (entry.cls === cls.id && entry.wp?.[slot]) || cls.weapons[slot] || cls.weapons[0];
      const shownWeapon = ap.disguised && ap.classId !== cls.id && entry.team !== myTeam ? getClass(ap.classId).weapons[Math.min(slot, 2)] : weaponId;
      R.rig.setWeapon(shownWeapon, entry.cos?.weaponSkin);
      R.weaponId = weaponId;
      // speed estimate for animation
      let speed = 0;
      if (R.lastPos) {
        const dx = s.x - R.lastPos[0], dz = s.z - R.lastPos[2];
        speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
        R.foot += Math.hypot(dx, dz);
        const stride = cls.id === 'juggernaut' ? 2.6 : 2.1;
        if (R.foot > stride && (a[7] & PF.GROUNDED)) {
          R.foot = 0;
          const mat = this.net.world.groundBox(s.x, s.y, s.z, 0.3)?.mat;
          const quiet = cls.passive.footstepVolume || 1;
          this.audio.footstep(mat, [s.x, s.y, s.z], false, quiet, cls.id === 'juggernaut');
        }
        R.vy = (s.y - R.lastPos[1]) / Math.max(dt, 1e-3);
      }
      R.speed = damp(R.speed || 0, speed, 10, dt);
      R.lastPos = [s.x, s.y, s.z];
      R.rig.update(dt, {
        speed: R.speed, grounded: !!(a[7] & PF.GROUNDED), crouch: !!(a[7] & PF.CROUCH), pitch: s.pitch,
        firing: !!(a[7] & PF.FIRING), reloading: !!(a[7] & PF.RELOADING), spun: !!(a[7] & PF.SPUN), vy: R.vy || 0,
      });
      // x-ray: revealed enemies (recon), carriers, and teammates behind walls
      const isMate = entry.team === myTeam;
      const revealed = !isMate && (a[7] & PF.REVEALED);
      R.xray.visible = !!revealed || (isMate && this.settings.showNames && cam.position.distanceTo(R.root.position) > 25);
      if (R.xray.visible) R.xray.material.color.setHex(revealed ? 0xffd04a : TEAM_COLORS_HEX[entry.team]);
      // spawn protection shimmer / overcharge glow
      const oc = !!(a[7] & PF.OVERCHARGED);
      if (oc !== R.oc) { R.oc = oc; for (const m of R.rig.materials) m.emissive.setHex(oc ? (entry.team ? 0x1a3a8a : 0x8a1a1a) : 0); }
      // name tags: teammates always; enemies only when aimed at and close
      let showName = false;
      if (this.settings.showNames) {
        if (isMate) showName = true;
        else {
          tmpV.set(s.x - cam.position.x, s.y + 1.2 - cam.position.y, s.z - cam.position.z);
          const d = tmpV.length();
          if (d < 30 && tmpV.normalize().dot(camFwd) > 0.995 - 0.004 * (30 - d) / 30) showName = this.net.world.los([cam.position.x, cam.position.y, cam.position.z], [s.x, s.y + 1.2, s.z]);
        }
      }
      if (showName) {
        this.nameTag(R, entry, a[6], cls.health, isMate, ap);
        R.nameTag.visible = true;
        R.nameTag.position.set(s.x, s.y + (cls.id === 'juggernaut' ? 2.6 : 2.35), s.z);
      } else if (R.nameTag) R.nameTag.visible = false;
    }
    for (const [id, R] of this.rigs) {
      if (!seen.has(id)) { R.root.visible = false; if (R.nameTag) R.nameTag.visible = false; if (!n.roster.has(id)) { this.removeRig(R); this.rigs.delete(id); } }
    }
  }

  // Continuous weapon visuals: flames, healing beams, repair arcs, rotary loops.
  updateBeamsAndLoops(dt) {
    const fx = this.effects;
    const n = this.net;
    fx.beginBeams();
    const t = this.time;
    const localAlive = n.me && n.me.alive;
    // local player continuous effects
    if (localAlive && n.ws) {
      const w = n.ws.w[n.ws.slot];
      const def = WEAPONS[w.id];
      const firing = (this.input.frameButtons ?? 0);
      void firing;
      const latestMe = n.latest?.p?.find((p) => p[0] === n.myId);
      const flags = latestMe ? latestMe[7] : 0;
      const muzzle = this.r.vm.muzzleWorld(this.r.camera, tmpV);
      const fwd = this.r.camera.getWorldDirection(tmpV2);
      const holding = this.input.locked || this.input.touchActive() ? (this.lastButtons & 128) : 0;
      if (def.type === 'flame' && holding && w.clip > 0 && w.rel === 0) {
        fx.flame(muzzle, fwd, [n.ms.vx, 0, n.ms.vz]);
        this.audio.loop('local-flame', 'flame', null, true);
      } else this.audio.loop('local-flame', null, null, false);
      if (def.type === 'beam' && latestMe && latestMe[10] >= 0) {
        const tr = this.rigs.get(latestMe[10]);
        if (tr && tr.root.visible) {
          const oc = !!(flags & PF.OVERCHARGED);
          fx.beam(muzzle, tmpV.clone().copy(tr.root.position).setY(tr.root.position.y + 1.1), oc ? 0xffffff : (n.me.team ? 0x6ab8ff : 0xff7a6a), t, 0.25);
          this.audio.loop('local-beam', 'beam', null, true);
          this.ui.hud.setHealTarget(tr, this.net.roster.get(latestMe[10]));
        }
      } else { this.audio.loop('local-beam', null, null, false); this.ui.hud.setHealTarget(null); }
      if (def.type === 'repair' && holding && w.clip > 0) { fx.beam(muzzle, tmpV.clone().addScaledVector(fwd, 5), 0x8ef6ff, t, 0, 0.12); this.audio.loop('local-arc', 'arc', null, true); }
      else this.audio.loop('local-arc', null, null, false);
    } else {
      this.audio.loop('local-flame', null, null, false); this.audio.loop('local-beam', null, null, false); this.audio.loop('local-arc', null, null, false);
      this.audio.loop('localspin', null, null, false);
    }
    for (const [id, R] of this.rigs) {
      if (!R.root.visible) { this.audio.loop(`f${id}`, null, null, false); this.audio.loop(`b${id}`, null, null, false); this.audio.loop(`s${id}`, null, null, false); continue; }
      const def = WEAPONS[R.weaponId];
      const pos = [R.root.position.x, R.root.position.y + 1.2, R.root.position.z];
      const firing = R.flags & PF.FIRING;
      if (def && def.type === 'flame' && firing) {
        const m = R.rig.muzzleWorld(tmpV);
        const d = dirFromAngles(R.root.rotation.y, R.rig.anim.armRx - Math.PI / 2);
        fx.flame(m, tmpV2.set(d[0], d[1], d[2]));
        this.audio.loop(`f${id}`, 'flame', pos, true);
      } else this.audio.loop(`f${id}`, null, null, false);
      const snapP = this.net.latest?.p?.find((p) => p[0] === id);
      if (def && def.type === 'beam' && snapP && snapP[10] >= 0) {
        const target = snapP[10] === this.net.myId ? null : this.rigs.get(snapP[10]);
        const m = R.rig.muzzleWorld(tmpV);
        const healingMe = snapP[10] === this.net.myId;
        const end = target ? target.root.position.clone().setY(target.root.position.y + 1.1) : healingMe ? new THREE.Vector3(this.net.ms.x, this.net.ms.y + 0.9, this.net.ms.z) : null;
        if (end) { fx.beam(m, end, (R.flags & PF.OVERCHARGED) ? 0xffffff : (R.realTeam ? 0x6ab8ff : 0xff7a6a), t, 0.25, 0, healingMe ? 0.7 : 1); this.audio.loop(`b${id}`, 'beam', pos, true); }
      } else this.audio.loop(`b${id}`, null, null, false);
      if (def && def.type === 'repair' && firing) {
        const m = R.rig.muzzleWorld(tmpV);
        const d = dirFromAngles(R.root.rotation.y, 0);
        fx.beam(m, m.clone().add(tmpV2.set(d[0] * 4, 0, d[2] * 4)), 0x8ef6ff, t, 0, 0.12);
      }
      if (def && def.spinUp && (R.flags & PF.SPUN)) this.audio.loop(`s${id}`, 'spin', pos, true);
      else this.audio.loop(`s${id}`, null, null, false);
      if (R.flags & PF.ABILITY) this.abilityAura(R, dt);
    }
    fx.endBeams();
  }

  // Continuous effects while another player's ability is active, so it is readable at a glance.
  abilityAura(R, dt) {
    const fx = this.effects;
    const p = R.root.position;
    const team = R.realTeam ? 0x6ab8ff : 0xff7a6a;
    const chance = (rate) => Math.random() < rate * dt;
    const trueCls = this.net.roster.get(R.id)?.cls;
    if (!trueCls || (R.flags & PF.DISGUISED)) return;
    switch (getClass(trueCls).ability.id) {
      case 'adrenaline':
        if (chance(30)) fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + 0.3 + Math.random() * 1.4, z: p.z + (Math.random() - 0.5) * 0.6, life: 0.35, size: 0.06, end: 0.2, color: 0xffffff, g: 0, drag: 4 });
        break;
      case 'esp': {
        // amber glint at the eyes
        if (chance(12)) { const fwd = dirFromAngles(R.root.rotation.y, 0); fx.spawn({ x: p.x + fwd[0] * 0.3, y: p.y + 1.62, z: p.z + fwd[2] * 0.3, life: 0.25, size: 0.07, end: 0.1, color: 0xffb030, g: 0, drag: 6 }); }
        break;
      }
      case 'suppression':
        if (chance(26)) { const a = Math.random() * Math.PI * 2; fx.spawn({ x: p.x + Math.cos(a) * 0.9, y: p.y + 0.08, z: p.z + Math.sin(a) * 0.9, vy: 0.6, life: 0.4, size: 0.08, end: 0.3, color: team, g: 0, drag: 2 }); }
        break;
      case 'overcharge':
        if (chance(22)) fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.9, y: p.y + Math.random() * 2, z: p.z + (Math.random() - 0.5) * 0.9, vy: 0.8, life: 0.6, size: 0.07, end: 0.2, color: Math.random() < 0.5 ? 0xfff28a : 0xffffff, g: -0.5, drag: 1 });
        break;
      default:
    }
  }

  // Expanding ring of heat for Thermal Burst.
  heatRing(x, y, z) {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      this.effects.spawn({ x, y, z, vx: Math.cos(a) * 11, vy: 0.4, vz: Math.sin(a) * 11, life: 0.45, size: 0.16, end: 0.4, color: i % 3 ? 0xff9a30 : 0xffe070, g: 0, drag: 3 });
    }
  }

  // ---------------------------------------------------------------- projectiles
  updateProjectiles(dt) {
    const n = this.net;
    const snap = n.latest;
    const now = n.serverNow();
    const live = new Set();
    if (snap) {
      const age = Math.max(0, Math.min(0.25, now - snap.st));
      for (const p of snap.pr) {
        const [id, ki, x, y, z, vx, vy, vz, owner, key, team, g] = p;
        const kind = PROJECTILE_KINDS[ki];
        const pkey = `${owner}:${key}`;
        if (owner === n.myId && this.predicted.has(pkey) && kind !== 'detcharge') {
          const pr = this.predicted.get(pkey);
          pr.server = [x + vx * age, y + vy * age - 0.5 * g * age * age, z + vz * age];
          pr.seenSnap = snap;
          continue;
        }
        live.add(id);
        let m = this.projMeshes.get(id);
        if (!m) { m = this.projectileMesh(kind, team); this.mapObjects.add(m); this.projMeshes.set(id, m); }
        const stuck = vx === 0 && vy === 0 && vz === 0;
        m.position.set(x + vx * age, y + vy * age - 0.5 * g * age * age, z + vz * age);
        if (!stuck) m.lookAt(m.position.x + vx, m.position.y + vy - g * age, m.position.z + vz);
        if (kind === 'flare' || kind === 'shell') { if (Math.random() < 0.6) this.effects.spawn({ x: m.position.x, y: m.position.y, z: m.position.z, life: 0.5, size: 0.12, end: 0.6, color: kind === 'flare' ? 0xffa030 : 0x888888, g: -0.5, drag: 2 }); }
        if (kind === 'detcharge') { const b = m.getObjectByName('blink'); if (b) b.visible = Math.sin(this.time * 10) > 0; }
      }
    }
    for (const [id, m] of this.projMeshes) if (!live.has(id)) { this.mapObjects.remove(m); this.projMeshes.delete(id); }
    // predicted local projectiles (client-side simulation, blended to server position)
    for (const [key, p] of this.predicted) {
      p.life -= dt;
      p.vy -= p.g * dt;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (!p.dead) {
        const dx = nx - p.x, dy = ny - p.y, dz = nz - p.z;
        const len = Math.hypot(dx, dy, dz);
        const h = len > 0 ? n.world.raycast(p.x, p.y, p.z, dx / len, dy / len, dz / len, len) : null;
        if (h) {
          if (p.bounce > 0) {
            const nn = h.normal; const d = p.vx * nn[0] + p.vy * nn[1] + p.vz * nn[2];
            p.vx = (p.vx - (1 + p.bounce) * d * nn[0]) * 0.8; p.vy = p.vy - (1 + p.bounce) * d * nn[1]; p.vz = (p.vz - (1 + p.bounce) * d * nn[2]) * 0.8;
          } else { p.dead = true; p.mesh.visible = false; }
        } else { p.x = nx; p.y = ny; p.z = nz; }
      }
      p.blend = Math.min(1, p.blend + dt * 6);
      const vx0 = p.mx + (p.x - p.mx) * p.blend, vy0 = p.my + (p.y - p.my) * p.blend, vz0 = p.mz + (p.z - p.mz) * p.blend;
      p.mesh.position.set(vx0, vy0, vz0);
      if (p.server) { p.mesh.position.lerp(tmpV.set(...p.server), 0.15); }
      p.mesh.lookAt(p.mesh.position.x + p.vx, p.mesh.position.y + p.vy, p.mesh.position.z + p.vz);
      // the server stopped reporting it (exploded / removed) even if the event was missed: drop it now
      p.age = (p.age || 0) + dt;
      const gone = snap && p.seenSnap && p.seenSnap !== snap && !snap.pr.some((q) => q[8] === n.myId && `${q[8]}:${q[9]}` === key);
      if (gone || (!p.seenSnap && p.age > 0.6 && !p.dead && p.bounce === 0 && p.life < 0) || p.life < -0.5) { this.mapObjects.remove(p.mesh); this.predicted.delete(key); }
    }
  }

  removePredicted(key) {
    const p = this.predicted.get(key);
    if (p) { this.mapObjects.remove(p.mesh); this.predicted.delete(key); }
  }

  // ---------------------------------------------------------------- turrets
  // Tripod sentry: angled legs, swivel yoke, boxy team-coloured head with a round gun housing, checkered
  // side panels, side ammo box and a siren light on top. Animated in updateTurrets().
  turretModel(team) {
    const g = new THREE.Group();
    const col = TEAM_COLORS_HEX[team];
    const dark = 0x2c2e30, metal = 0x4a4d50;
    const strut = (parent, a, b, w, color) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, len), colorMat(color));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.lookAt(b);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const cyl = (parent, x, y, z, r, len, color, opts = {}) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), opts.basic ? colorMat(color, { basic: true }) : colorMat(color));
      m.position.set(x, y, z);
      if (opts.forward) m.rotation.x = Math.PI / 2;
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    // tripod
    const legs = new THREE.Group();
    g.add(legs);
    const hub = new THREE.Vector3(0, 0.46, 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const knee = new THREE.Vector3(Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2);
      const foot = new THREE.Vector3(Math.cos(a) * 0.42, 0.03, Math.sin(a) * 0.42);
      strut(legs, hub, knee, 0.075, dark);
      strut(legs, knee, foot, 0.065, dark);
      bx(legs, foot.x, 0, foot.z, 0.16, 0.04, 0.16, 0x1c1d1e);
      bx(legs, knee.x, knee.y - 0.03, knee.z, 0.09, 0.06, 0.09, metal);
    }
    bx(legs, 0, 0.4, 0, 0.16, 0.12, 0.16, metal);
    bx(legs, 0, 0.52, 0, 0.09, 0.2, 0.09, dark);
    // swivel (yaw) + yoke
    const yawG = new THREE.Group(); yawG.position.y = 0.7; g.add(yawG);
    bx(yawG, 0, 0, 0, 0.5, 0.05, 0.16, dark);
    for (const sx of [-1, 1]) bx(yawG, sx * 0.27, 0, 0, 0.05, 0.24, 0.09, dark);
    // head (pitch)
    const head = new THREE.Group(); head.position.y = 0.21; yawG.add(head);
    bx(head, 0, -0.17, 0, 0.5, 0.36, 0.48, col);
    bx(head, 0, -0.17, -0.245, 0.46, 0.3, 0.03, 0x232426);
    bx(head, 0, 0.19, 0, 0.42, 0.03, 0.4, shadeHex(col, 0.75));
    // checkered side panels
    for (const sx of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      bx(head, sx * 0.252, 0.0 - r * 0.1, -0.14 + c * 0.09, 0.012, 0.085, 0.085, (r + c) % 2 ? 0xf2efe6 : shadeHex(col, 0.9));
    }
    // gun housing, lens and barrel
    cyl(head, 0.03, -0.01, -0.27, 0.11, 0.06, 0x1a1b1c, { forward: true });
    cyl(head, 0.03, -0.01, -0.3, 0.075, 0.03, 0x3a3c3e, { forward: true });
    const barrel = new THREE.Group(); head.add(barrel);
    cyl(barrel, 0.03, -0.01, -0.38, 0.04, 0.18, 0x2a2b2c, { forward: true });
    cyl(barrel, 0.03, -0.01, -0.47, 0.05, 0.03, 0x111111, { forward: true });
    const muzzle = new THREE.Object3D(); muzzle.position.set(0.03, -0.01, -0.5); barrel.add(muzzle);
    const eye = bx(head, -0.16, 0.08, -0.262, 0.07, 0.05, 0.01, 0xff3a2a, { basic: true });
    // side ammo box with belt
    bx(head, 0.32, -0.22, 0.02, 0.13, 0.18, 0.26, 0x3a3c3a);
    bx(head, 0.32, -0.13, 0.02, 0.135, 0.02, 0.265, 0xc9a14a);
    bx(head, 0.27, -0.2, -0.13, 0.05, 0.04, 0.1, 0xc9a14a);
    // siren light on top
    cyl(head, 0, 0.225, 0, 0.075, 0.05, 0x151515);
    const sirenMat = new THREE.MeshBasicMaterial({ color: col });
    const siren = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.1, 10), sirenMat);
    siren.position.set(0, 0.3, 0); head.add(siren);
    const sirenCap = bx(head, 0, 0.35, 0, 0.05, 0.02, 0.05, 0xffffff, { basic: true });
    const blade = bx(siren, 0.035, -0.05, 0, 0.012, 0.08, 0.05, 0xffffff, { basic: true });
    g.userData = { legs, yawG, head, barrel, muzzle, siren, sirenMat, eye, sirenCap, blade, col, recoil: 0, buildT: 0 };
    return g;
  }

  updateTurrets(dt) {
    const snap = this.net.latest;
    const live = new Set();
    if (snap) for (const t of snap.tu) {
      const [id, team, x, y, z, yaw, hp, maxHp, owner, ammo, building, target] = t;
      live.add(id);
      let T = this.turrets.get(id);
      if (!T) { const g = this.turretModel(team); this.mapObjects.add(g); T = { g, yaw, pitch: 0, sweep: Math.random() * 6 }; this.turrets.set(id, T); }
      const U = T.g.userData;
      T.g.position.set(x, y, z);
      // unfold while building: legs spread, head rises and grows
      U.buildT = building ? Math.min(1.2, U.buildT + dt) : 1.2;
      const bp = U.buildT / 1.2;
      U.legs.scale.set(0.4 + 0.6 * bp, 0.5 + 0.5 * bp, 0.4 + 0.6 * bp);
      U.yawG.position.y = 0.35 + 0.35 * bp;
      U.head.scale.setScalar(0.5 + 0.5 * bp);
      // aim: server yaw, plus an idle sweep when nothing is targeted; pitch toward the target
      const tgt = target >= 0 ? (target === this.net.myId ? new THREE.Vector3(this.net.ms.x, this.net.ms.y, this.net.ms.z) : this.rigs.get(target)?.root.position) : null;
      T.sweep += dt;
      const idle = !building && !tgt;
      const wantYaw = yaw + (idle ? Math.sin(T.sweep * 0.9) * 0.55 : 0);
      T.yaw = T.yaw + wrapAngle(wantYaw - T.yaw) * Math.min(1, dt * (idle ? 3 : 12));
      U.yawG.rotation.y = T.yaw;
      let wantPitch = 0;
      if (tgt) { const dx = tgt.x - x, dz = tgt.z - z; wantPitch = Math.atan2((tgt.y + 1.0) - (y + 0.9), Math.hypot(dx, dz)); }
      T.pitch = damp(T.pitch, Math.max(-0.6, Math.min(0.6, wantPitch)), 8, dt);
      U.head.rotation.x = T.pitch;
      // barrel recoil
      U.recoil = Math.max(0, U.recoil - dt * 8);
      U.barrel.position.z = U.recoil * 0.06;
      // siren: slow pulse when idle, spinning fast flash when it has a target
      if (tgt) { U.siren.rotation.y += dt * 14; U.sirenMat.color.setHex(Math.sin(this.time * 18) > 0 ? 0xffffff : U.col); }
      else { U.sirenMat.color.setHex(U.col).multiplyScalar(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 2.5))); }
      U.eye.visible = !building && (tgt ? true : Math.sin(this.time * 3) > -0.6);
      // damaged: smoke
      if (hp < maxHp * 0.35 && Math.random() < dt * 8) {
        const hpw = U.head.getWorldPosition(tmpV);
        this.effects.spawn({ x: hpw.x + (Math.random() - 0.5) * 0.2, y: hpw.y, z: hpw.z + (Math.random() - 0.5) * 0.2, vy: 1, life: 1, size: 0.14, end: 0.8, color: 0x3a3a3a, g: -0.5, drag: 1 });
      }
      T.hp = hp; T.maxHp = maxHp; T.ammo = ammo; T.owner = owner; T.team = team;
    }
    for (const [id, T] of this.turrets) if (!live.has(id)) { this.mapObjects.remove(T.g); this.turrets.delete(id); }
  }

  // ---------------------------------------------------------------- flags & pickups
  updateFlags(dt) {
    const snap = this.net.latest;
    if (!snap || !snap.fl || !this.flagObjs[0]) return;
    for (const f of snap.fl) {
      const [team, state, x, y, z, carrier, prog] = f;
      const F = this.flagObjs[team];
      if (!F) continue;
      if (state === FLAG_STATE.CARRIED) {
        if (carrier === this.net.myId) { F.g.visible = false; continue; }
        const R = this.rigs.get(carrier);
        F.g.visible = true;
        if (R && R.root.visible) {
          F.g.position.copy(R.root.position).add(tmpV.set(Math.sin(R.root.rotation.y) * 0.45, 1.0, Math.cos(R.root.rotation.y) * 0.45));
        } else F.g.position.set(x, y + 1, z);
        F.g.rotation.y = R ? R.root.rotation.y : 0;
        F.beacon.visible = true;
        F.ring.visible = false;
      } else {
        F.g.visible = true;
        F.g.position.set(x, y + (state === FLAG_STATE.AT_BASE ? 0 : 0.1 + Math.abs(Math.sin(this.time * 2)) * 0.2), z);
        F.g.rotation.y += dt * (state === FLAG_STATE.AT_BASE ? 0.5 : 1.5);
        F.beacon.visible = state !== FLAG_STATE.AT_BASE;
        F.ring.visible = state === FLAG_STATE.RETURNING || state === FLAG_STATE.DROPPED;
        if (F.ring.visible) F.ring.scale.setScalar(0.4 + prog * 0.6);
      }
      F.cloth.rotation.y = Math.sin(this.time * 3 + team) * 0.25;
    }
  }

  updatePickups(dt) {
    const taken = new Set(this.net.latest?.pk || []);
    for (const p of this.pickupMeshes) {
      const on = !taken.has(p.userData.idx);
      p.userData.item.visible = on;
      p.userData.ring.material.opacity = on ? 0.6 : 0.15;
      p.userData.item.rotation.y += dt * 1.6;
      p.userData.item.position.y = 0.25 + Math.sin(this.time * 2 + p.userData.idx) * 0.08;
    }
  }

  updateAudioListener() {
    const cam = this.r.camera;
    this.audio.setListener(cam.position, cam.getWorldDirection(tmpV));
    // interior acoustics
    let inside = false;
    const p = cam.position;
    for (const z of this.map.soundZones) {
      if (p.x > z.min[0] && p.x < z.max[0] && p.y > z.min[1] && p.y < z.max[1] && p.z > z.min[2] && p.z < z.max[2]) { inside = true; break; }
    }
    if (inside !== this.inside) { this.inside = inside; this.audio.setInterior(inside); }
    // local footsteps
    const n = this.net;
    if (n.me && n.me.alive && n.ms.grounded) {
      const sp = Math.hypot(n.ms.vx, n.ms.vz);
      this.footDist += sp * (1 / 60) * 0;
      this.footAcc = (this.footAcc || 0) + sp * this.lastDt;
      const cls = getClass(n.classId);
      if (this.footAcc > (cls.id === 'juggernaut' ? 2.6 : 2.2)) {
        this.footAcc = 0;
        this.audio.footstep(n.ms.groundMat, null, true, cls.passive.footstepVolume || 1, cls.id === 'juggernaut');
      }
    }
  }

  // ---------------------------------------------------------------- server events
  rigPos(id) {
    const R = this.rigs.get(id);
    if (R && R.root.visible) return [R.root.position.x, R.root.position.y + 1.2, R.root.position.z];
    if (id === this.net.myId) return [this.net.ms.x, this.net.ms.y + 1.2, this.net.ms.z];
    return null;
  }

  onEvents(list) {
    const n = this.net;
    const me = n.myId;
    for (const e of list) {
      switch (e[0]) {
        case 'f': {
          const [, pid, wid, , ox, oy, oz, ends] = e;
          if (pid === me) break;
          const def = WEAPONS[wid];
          const R = this.rigs.get(pid);
          const m = R && R.root.visible ? R.rig.muzzleWorld(new THREE.Vector3()) : new THREE.Vector3(ox, oy - 0.2, oz);
          if (R) R.rig.onFire();
          this.audio.weaponFire(wid, [m.x, m.y, m.z], false);
          if (def.type === 'repair') break;
          this.effects.muzzle(m, null, def.type);
          for (const end of ends) {
            if (def.pellets === 1 || Math.random() < 0.5) this.effects.tracer([m.x, m.y, m.z], end, def.tracer, 0.02);
            if (end[3] === 0) this.effects.impact(end, null, 'world');
            else if (end[3] === 1) this.effects.impact(end, null, 'flesh');
            else if (end[3] === 3) this.effects.impact(end, null, 'turret');
          }
          break;
        }
        case 'sw': { const R = this.rigs.get(e[1]); if (R) { R.rig.onSwing(); this.audio.swing(this.rigPos(e[1]), false, WEAPONS[e[2]]?.damage >= 55); } break; }
        case 'mh': {
          const [, pid, kind, x, y, z] = e;
          if (kind > 0) { this.audio.meleeHit(kind, [x, y, z]); this.effects.impact([x, y, z], null, kind === 2 ? 'flesh' : 'world'); }
          void pid;
          break;
        }
        case 'rl': { if (e[1] !== me) this.audio.reload('mag', this.rigPos(e[1]), false); break; }
        case 'd': this.onDamageEvent(e); break;
        case 'k': this.onKillEvent(e); break;
        case 'x': {
          const [, x, y, z, radius, key] = e;
          this.removePredicted(key);
          this.effects.explosion(x, y, z, radius);
          this.audio.explosion([x, y, z], radius);
          const cam = this.r.camera.position;
          const d = Math.hypot(cam.x - x, cam.y - y, cam.z - z);
          if (d < radius * 4) this.shake = Math.max(this.shake, (1 - d / (radius * 4)) * 1.2);
          break;
        }
        case 'i': {
          const [, kind, x, y, z, nx, ny, nz, key, hit] = e;
          if (kind !== 'detcharge' || hit !== 3) this.removePredicted(key);
          if (hit === 1) { this.effects.burst(x, y, z, 12, { color: [0xff9a30, 0xffffff], speed: 4, life: 0.4, size: 0.08 }); break; }
          if (hit === 3) break;
          this.effects.impact([x, y, z], [nx, ny, nz], hit === 2 ? 'flesh' : 'world');
          if (kind === 'flare') this.effects.burst(x, y, z, 10, { color: [0xffa030, 0xffe070], speed: 3, life: 0.5, size: 0.08 });
          break;
        }
        case 'sp': {
          const [, pid, x, y, z] = e;
          const entry = n.roster.get(pid);
          this.effects.spawnColumn(x, y, z, entry ? entry.team : 0);
          break;
        }
        case 'dj': { if (e[1] !== me) { const p = this.rigPos(e[1]); if (p) { this.audio.jump(false, p, true); this.effects.burst(p[0], p[1] - 1.1, p[2], 8, { color: [0xffffff], speed: 2, life: 0.35, size: 0.07, g: 2 }); } } break; }
        case 'ab': this.onAbilityEvent(e); break;
        case 'tf': {
          const [, tid, x, y, z, hit] = e;
          const T = this.turrets.get(tid);
          if (T) {
            const m = T.g.userData.muzzle.getWorldPosition(new THREE.Vector3());
            T.g.userData.recoil = 1;
            this.effects.tracer([m.x, m.y, m.z], [x, y, z], 0xffe07a, 0.025);
            this.effects.muzzle(m, null, 'hitscan');
            this.audio.turretFire([m.x, m.y, m.z]);
            if (hit) this.effects.impact([x, y, z], null, 'flesh');
          }
          break;
        }
        case 'tb': { const [, , owner, x, y, z] = e; this.audio.ability('turret', [x, y, z], owner === me); this.effects.burst(x, y + 0.3, z, 14, { color: [0xffd040, 0xffffff], speed: 3, life: 0.5, size: 0.08 }); break; }
        case 'td': { const [, , x, y, z] = e; this.effects.explosion(x, y + 0.5, z, 2.5); this.audio.explosion([x, y, z], 2.5); break; }
        case 'fl': this.onFlagEvent(e); break;
        case 'h': if (e[1] === me && e[2] > 0) { this.audio.pickup('health'); this.ui.hud.healNumber(e[2]); } break;
        case 'pk': if (e[3] === me) this.audio.pickup(n.map.pickups[e[1]]?.kind || 'ammo'); break;
        case 'ann': this.onAnnounce(e); break;
        case 'beam': break;
        default:
      }
    }
  }

  onDamageEvent(e) {
    const [, attacker, victim, amount, x, y, z, flags, weaponId] = e;
    const me = this.net.myId;
    if (attacker === me && victim !== me) {
      const crit = !!(flags & 2), head = !!(flags & 1);
      this.ui.hud.hitmarker(crit || head ? 'crit' : 'hit');
      this.audio.hitmarker(crit, head, false);
      if (this.settings.damageNumbers) {
        const v = new THREE.Vector3(x, y + 0.3, z).project(this.r.camera);
        if (v.z < 1) this.ui.hud.damageNumber((v.x + 1) / 2 * window.innerWidth, (1 - v.y) / 2 * window.innerHeight, amount, crit || head, head ? 'HEADSHOT' : (flags & 4) ? 'BACKSTAB' : crit ? 'CRITICAL' : '');
      }
    }
    if (victim === me) {
      this.audio.hurt();
      let ang = null;
      const src = attacker >= 0 && attacker !== me ? this.rigPos(attacker) : null;
      if (src) {
        const dx = src[0] - this.net.ms.x, dz = src[2] - this.net.ms.z;
        ang = Math.atan2(-dx, -dz) - this.yaw;
      }
      this.ui.hud.damageTaken(amount, ang, weaponId);
      this.shake = Math.max(this.shake, Math.min(0.6, amount / 80));
    } else if (victim >= 0) {
      const R = this.rigs.get(victim);
      if (R) R.rig.onHurt();
    }
  }

  onKillEvent(e) {
    const [, killer, victim, weaponId, flags, assister, x, y, z, victimClass] = e;
    const n = this.net;
    const me = n.myId;
    const kEntry = n.roster.get(killer), vEntry = n.roster.get(victim), aEntry = n.roster.get(assister);
    this.ui.hud.killfeed({
      killer: kEntry ? { name: kEntry.name, team: kEntry.team, cls: kEntry.cls } : null,
      victim: vEntry ? { name: vEntry.name, team: vEntry.team, cls: victimClass || vEntry.cls } : { name: '?', team: 0, cls: victimClass },
      assister: aEntry ? { name: aEntry.name, team: aEntry.team } : null,
      weaponId, flags, involvesMe: killer === me || victim === me || assister === me,
    });
    // gibs
    const R = this.rigs.get(victim);
    const effect = kEntry?.cos?.elimEffect || 'pixels';
    if (R && R.root.visible) {
      const vel = R.lastPos ? [0, 0, 0] : [0, 0, 0];
      this.effects.gib(R.rig.partMeshes(), vel, effect, R.team);
      R.root.visible = false;
      this.audio.voice(R.classId, 'death', [x, y + 1, z], false);
    } else if (victim !== me) this.effects.burst(x, y + 1, z, 12, { color: [0xc8402f, 0xffffff], speed: 4, life: 0.6, size: 0.08 });
    if (victim === me) {
      this.deathInfo = { killer, killerName: kEntry?.name, killerClass: kEntry?.cls, weaponId, flags, killerHp: this.net.latest?.p?.find((p) => p[0] === killer)?.[6] };
      this.audio.voice(n.classId, 'death', null, true);
      this.ui.hud.onDeath(this.deathInfo);
    }
    if (killer === me && victim !== me) {
      this.streak++;
      this.audio.hitmarker(false, false, true);
      this.ui.hud.killConfirm(vEntry?.name, flags, this.streak);
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) { this.audio.jingle('killstreak'); this.audio.announce(this.streak === 3 ? 'Triple threat' : this.streak === 5 ? 'Unstoppable' : 'Rampage'); }
    } else if (assister === me) this.ui.hud.notify(`Assist on ${vEntry?.name || '?'}`, 'short');
  }

  onAbilityEvent(e) {
    const [, pid, id, on, extra] = e;
    const me = this.net.myId;
    const pos = this.rigPos(pid);
    if (pid === me) {
      if (on) { this.r.vm.onAbility(id); this.audio.ability(id, null, true); this.ui.hud.abilityFlash(id); }
      if (id === 'thermalburst') { this.heatRing(this.net.ms.x, this.net.ms.y + 0.9, this.net.ms.z); this.shake = Math.max(this.shake, 0.4); }
      if (id === 'esp' && on) this.ui.hud.notify('Recon Sweep: all enemies marked for 5s', 'short');
      if (id === 'disguise') this.ui.hud.notify(on ? 'Disguised — attack or heavy damage reveals you' : 'Disguise removed', 'short');
      return;
    }
    const R = this.rigs.get(pid);
    if (R && on) R.rig.onAbility();
    if (!pos) return;
    if (on) this.audio.ability(id, pos, false);
    switch (id) {
      case 'disguise': this.effects.burst(pos[0], pos[1], pos[2], 24, { color: [0x555555, 0x888888, 0x333333], speed: 2, life: 0.8, size: 0.2, g: -1 }); break;
      case 'thermalburst': this.heatRing(pos[0], pos[1] - 0.3, pos[2]); if (extra) this.ui.hud.notify(`${extra} projectile(s) incinerated`, 'short'); break;
      case 'overcharge': if (on) this.effects.burst(pos[0], pos[1], pos[2], 30, { color: [0xffffff, 0xfff28a], speed: 4, life: 0.8, size: 0.1, g: -2 }); break;
      case 'suppression': if (on) this.effects.burst(pos[0], pos[1] - 1, pos[2], 16, { color: [0x8a8070, 0x5a5040], speed: 3, life: 0.5, size: 0.12, g: 6 }); break;
      case 'adrenaline': if (on) this.effects.burst(pos[0], pos[1] - 0.8, pos[2], 14, { color: [0xffffff, 0xd8f0ff], speed: 4, life: 0.4, size: 0.08, g: 2 }); break;
      case 'esp': if (on) this.effects.burst(pos[0], pos[1] + 0.5, pos[2], 10, { color: [0xffb030, 0xffe070], speed: 1.5, life: 0.5, size: 0.06, g: -1 }); break;
      default:
    }
  }

  onFlagEvent(e) {
    const [, type, team, pid] = e;
    const n = this.net;
    const myTeam = n.me ? n.me.team : 0;
    const p = n.roster.get(pid);
    const who = p ? p.name : 'Someone';
    const ours = team === myTeam;
    let text = '', jingle = null, kind = ours ? 'bad' : 'good';
    switch (type) {
      case 'pickup': text = ours ? `${who} has taken YOUR flag!` : `${who} picked up the ${TEAM_NAMES[team]} flag`; jingle = ours ? 'enemyPickup' : 'pickup'; break;
      case 'drop': text = `The ${TEAM_NAMES[team]} flag was dropped`; jingle = 'drop'; kind = ours ? 'good' : 'bad'; break;
      case 'return': text = `The ${TEAM_NAMES[team]} flag has returned to base`; jingle = 'return'; kind = ours ? 'good' : 'bad'; break;
      case 'capture': text = `${who} CAPTURED the ${TEAM_NAMES[team]} flag!`; jingle = ours ? 'enemyCapture' : 'capture'; {
        const base = n.map.flags[otherTeam(team)];
        this.effects.confetti(base[0], base[1], base[2], [TEAM_COLORS_HEX[otherTeam(team)], 0xffffff, 0xffe03f]);
      } break;
      default:
    }
    if (text) this.ui.hud.flagNotice(text, kind);
    if (jingle) this.audio.jingle(jingle);
    if (type === 'capture') this.audio.announce(ours ? 'Your flag was captured' : 'Flag captured!');
    else if (type === 'pickup' && ours) this.audio.announce('Your flag has been taken');
  }

  onAnnounce(e) {
    const [, key, a, b] = e;
    switch (key) {
      case 'preround': this.ui.hud.bigText('GET READY', `Match begins in ${a}s`); break;
      case 'start': this.ui.hud.bigText('FIGHT!', MODES[this.net.mode]?.name || ''); this.audio.jingle('start'); this.audio.announce(this.net.mode === 'ctf' ? 'Capture the enemy flag!' : 'Eliminate the enemy team!'); break;
      case 'min1': this.ui.hud.notify('One minute remaining!', 'warn'); this.audio.announce('One minute remaining'); break;
      case 'overtime': this.ui.hud.bigText('OVERTIME', 'Next score wins'); break;
      case 'end': break;
      case 'join': this.ui.hud.notify(`${a} joined ${TEAM_NAMES[b] ?? ''}`, 'short'); break;
      case 'leave': this.ui.hud.notify(`${a} left the match`, 'short'); break;
      default:
    }
  }

  // ---------------------------------------------------------------- HUD data
  hudState() {
    const n = this.net;
    const me = n.me;
    const snap = n.latest;
    const ws = n.ws;
    let weapon = null;
    if (ws && me) {
      const w = ws.w[ws.slot];
      const def = WEAPONS[w.id];
      weapon = { id: w.id, def, clip: w.clip, reserve: w.reserve, reloading: w.rel > 0, charge: w.charge, spin: def.spinUp ? w.spin / def.spinUp : 0, slot: ws.slot, scoped: ws.scoped, slots: ws.w.map((x) => ({ id: x.id, clip: x.clip, reserve: x.reserve })) };
    }
    const turret = me && me.cls === 'mechanic' ? [...this.turrets.values()].find((t) => t.owner === n.myId) : null;
    return {
      me, weapon, snap, myId: n.myId, mode: n.mode, roster: n.roster, ms: n.ms, yaw: this.yaw,
      ping: n.roster.get(n.myId)?.ping ?? 0, turret, camera: this.r.camera, flags: snap?.fl, map: this.map,
      rigs: this.rigs,
    };
  }

  setLastButtons(b) { this.lastButtons = b; }

  dispose() {
    this.running = false;
    this.net.close();
    this.clearWorld();
    this.audio.stopAmbience();
    this.audio.stopLoops();
    if (this.effects) this.effects.clear();
    this.r.scene.remove(this.mapObjects);
  }
}

export { ABILITY_SOURCES, cyl, colorMat, textTexture, buildWeapon };
