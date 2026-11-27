// First-person viewmodel: blocky arms + weapon rendered in a separate overlay scene/camera so it never
// clips into world geometry. Procedural animation: equip/holster, idle sway, movement bob, sprint tilt,
// recoil kick per weapon, magazine & shell reloads, melee swings, rotary spin, ability gestures, scope.
import * as THREE from 'three';
import { buildWeapon, WEAPON_MODELS } from './WeaponModels.js';
import { buildArmMesh, FIST_MOVES, nextFistMove , buildGauntlet, setGauntletStones } from './CharacterModel.js';
import { TEAM_COLORS_HEX } from '../../shared/constants.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { damp } from '../../shared/math.js';

const SLEEVES = {
  scout: [0xd8d8d8, 0xe8b48a], spy: [0x2a2c33, 0x1a1a1a], marksman: [0x7a6a48, 0xc98d68], mechanic: [0x7b6a3f, 0x6a4a2a],
  doctor: [0xe8ecef, 0xa8d8e8], juggernaut: [0xd09a74, 0xd09a74], incinerator: [0xc9a14a, 0x3a3a3a], demolitionist: [0x545c3c, 0x8d5a3c],
};

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.01, 10);
    this.scene.add(this.camera);
    const amb = new THREE.HemisphereLight(0xffffff, 0x777777, 1.9);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(0.5, 1, 0.3);
    const fill = new THREE.DirectionalLight(0xffffff, 1.3);
    fill.position.set(-0.6, 0.4, 1);
    this.scene.add(amb, dir, fill);
    this.light = amb;
    this.rig = new THREE.Group();       // animated root
    this.camera.add(this.rig);
    this.st = { bobT: 0, kick: 0, kickRot: 0, swing: -1, reload: -1, reloadDur: 1, equip: 1, swayX: 0, swayY: 0, tilt: 0, land: 0, ability: 0, spin: 0, abilityKind: '' };
    this.visible = true;
  }

  setStones(mask) { if (this.gauntlet) setGauntletStones(this.gauntlet, mask, 0.5); }

  setLoadout(classId, team, weaponId, skin, gloves) {
    const key = `${classId}|${team}|${weaponId}|${skin}|${gloves}`;
    if (key === this.key) return;
    this.key = key;
    this.classId = classId;
    this.weaponId = weaponId;
    this.def = WEAPONS[weaponId];
    this.rig.clear();
    const md = WEAPON_MODELS[weaponId];
    const w = buildWeapon(weaponId, { team, skin, shadow: false });
    const worn = !!md.fists; // bare fists: nothing is held
    if (worn) w.visible = false;
    const fp = worn ? { pos: [0.22, -0.2, -0.58], scale: 1, rot: [0, 0, 0] } : (md.fp || { pos: [0.2, -0.2, -0.4], scale: 1 });
    this.base = new THREE.Vector3(...fp.pos);
    this.baseRot = new THREE.Euler(...(fp.rot || [0, 0, 0]));
    if (!md.melee) {
      // angle guns so their pixel-art side profile faces the camera
      this.baseRot.y += 0.34; this.baseRot.z += 0.05; this.baseRot.x += 0.03;
      this.base.x += 0.05; this.base.z -= 0.12; this.base.y -= 0.01;
    }
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(0.58);
    this.holder.add(w);
    this.weapon = w;
    w.scale.setScalar(fp.scale || 1);
    this.rig.add(this.holder);
    // arms
    const arm = () => buildArmMesh(classId, team, gloves, 0.75);
    this.armR = arm();
    this.armR.position.set(0, -0.03, 0.06);
    this.armR.rotation.set(0.35, 0.25, 0);
    this.holder.add(this.armR);
    this.armL = arm();
    if (worn) {
      // second fist mirrors the right one (same size, position and angle), held up in a guard
      this.armL.position.set(-this.base.x, this.base.y - 0.017, this.base.z + 0.035);
      this.armL.scale.multiplyScalar(0.58); // keep the arm mesh's first-person slimming
      this.armL.rotation.set(0.35, -0.25, 0);
      this.rig.add(this.armL);
      this.armL.userData.free = true;
    } else if (md.melee) {
      this.armL.position.set(-0.22, -0.2, -0.05);
      this.armL.scale.multiplyScalar(0.58); // keep the arm mesh's first-person slimming
      this.armL.rotation.set(0.5, -0.3, 0);
      this.rig.add(this.armL);
      this.armL.userData.free = true;
    } else {
      const twoHand = (md.muzzle3 && Math.abs(md.muzzle3[2]) > 0.35) || !!this.def?.spinUp;
      if (twoHand) { this.armL.position.set(-0.01, -0.04, md.muzzle3[2] * 0.45); this.armL.rotation.set(0.45, -0.7, 0); }
      else { this.armL.position.set(-0.03, -0.08, 0.04); this.armL.rotation.set(0.35, -0.35, 0); }
      this.holder.add(this.armL);
    }
    // the Titan wears the gem gauntlet on his left fist
    this.gauntlet = null;
    if (classId === 'titan') {
      const sv = 0.75 / 14;
      const gt = buildGauntlet(sv);
      gt.group.position.y = -(14 / 2 - 1.8) * sv;
      this.armL.children[0].add(gt.group);
      this.gauntlet = gt;
      gt.light.distance = 1.2;
    }
    this.armLBase = this.armL.userData.free ? this.armL.position.clone() : null;
    this.armLRot = this.armL.rotation.clone();
    this.meleeKind = md.fists ? 'punch' : this.def?.melee?.backstab ? 'stab' : 'slash';
    this.st.equip = 0;
    this.st.reload = -1;
    this.st.swing = -1;
  }

  muzzleWorld(mainCamera, out = new THREE.Vector3()) {
    if (!this.weapon) return out.set(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    const p = this.weapon.userData.muzzle.getWorldPosition(new THREE.Vector3()); // vm camera space (camera at origin)
    const dist = p.length();
    // project with the viewmodel camera, unproject with the main camera -> same screen point in the world
    const ndc = p.clone().project(this.camera);
    const camPos = new THREE.Vector3().setFromMatrixPosition(mainCamera.matrixWorld);
    const q = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(mainCamera).sub(camPos).normalize();
    return out.copy(camPos).addScaledVector(q, Math.max(0.3, dist));
  }

  onFire(def) {
    const k = def ? def.kick ?? 0.6 : 0.6;
    this.st.kick = Math.min(1.6, this.st.kick + k * 0.6);
    this.st.kickRot = Math.min(1.6, this.st.kickRot + k * 0.6);
  }
  onSwing() {
    this.st.swing = 0;
    if (this.meleeKind === 'punch') { this.st.combo ||= {}; this.st.fistMove = nextFistMove(this.st.combo, performance.now() / 1000); }
  }
  onReload(dur, mode) { this.st.reload = 0; this.st.reloadDur = dur; this.st.reloadMode = mode; }
  onReloadDone() { this.st.reload = -1; }
  onEquip() { this.st.equip = 0; }
  onLand(impact) { this.st.land = Math.min(1, impact / 14); }
  onAbility(kind) { this.st.ability = 1; this.st.abilityKind = kind; }

  /**
   * s: { speed, grounded, sprint, crouch, scoped, spun, firing, lookDX, lookDY, bobScale, aspect, reloading, beamTarget }
   */
  update(dt, s) {
    const st = this.st;
    if (!this.holder) return;
    this.camera.aspect = s.aspect || 1;
    this.camera.updateProjectionMatrix();
    st.equip = Math.min(1, st.equip + dt / 0.3);
    const eq = 1 - Math.pow(1 - st.equip, 3);
    // bob
    const moving = s.grounded && s.speed > 0.5;
    st.bobT += dt * (moving ? s.speed * (s.sprint ? 1.6 : 1.25) : 0.8);
    const bobAmt = (moving ? Math.min(1, s.speed / 7) : 0.15) * (s.bobScale ?? 1);
    const bx = Math.cos(st.bobT) * 0.012 * bobAmt;
    const by = -Math.abs(Math.sin(st.bobT)) * 0.016 * bobAmt;
    // sway from mouse
    st.swayX = damp(st.swayX, Math.max(-0.05, Math.min(0.05, -(s.lookDX || 0) * 0.0009)), 10, dt);
    st.swayY = damp(st.swayY, Math.max(-0.05, Math.min(0.05, (s.lookDY || 0) * 0.0009)), 10, dt);
    st.tilt = damp(st.tilt, s.sprint ? 1 : 0, 8, dt);
    st.kick = damp(st.kick, 0, 14, dt);
    st.kickRot = damp(st.kickRot, 0, 10, dt);
    st.land = damp(st.land, 0, 8, dt);
    st.ability = Math.max(0, st.ability - dt * 1.6);
    // strafe roll, jump float (the weapon lags behind vertical motion) and idle breathing
    st.strafe = damp(st.strafe || 0, s.strafe || 0, 8, dt);
    st.air = damp(st.air || 0, s.grounded === false ? Math.max(-1, Math.min(1, (s.vy || 0) / 8)) : 0, 6, dt);
    st.breathT = (st.breathT || 0) + dt;
    const breath = moving ? 0 : 1;
    const p = this.holder.position, r = this.holder.rotation;
    p.copy(this.base);
    r.copy(this.baseRot);
    p.x += bx + st.swayX + st.tilt * 0.05;
    p.y += by + st.swayY - (1 - eq) * 0.35 - st.land * 0.05 - st.tilt * 0.04 - (s.crouch ? 0.01 : 0);
    p.z += st.kick * 0.06;
    r.x += st.kickRot * 0.12 - st.tilt * 0.35;
    r.y += st.tilt * 0.6;
    r.z += st.tilt * 0.25 + Math.cos(st.bobT) * 0.01 * bobAmt;
    p.x -= st.strafe * 0.012; r.z -= st.strafe * 0.07;
    p.y -= st.air * 0.025; r.x += st.air * 0.06;
    p.y += Math.sin(st.breathT * 1.6) * 0.003 * breath; r.z += Math.sin(st.breathT * 0.8) * 0.006 * breath; r.x += Math.sin(st.breathT * 1.1) * 0.004 * breath;
    // reload animation: dip & roll
    if (st.reload >= 0) {
      st.reload += dt;
      const t = Math.min(1, st.reload / Math.max(0.2, st.reloadDur));
      const env = Math.sin(Math.min(1, t) * Math.PI);
      if (st.reloadMode === 'single') {
        p.y -= 0.05; r.z += 0.25; r.x += 0.12 + Math.sin(st.reload * 12) * 0.05;
      } else {
        p.y -= env * 0.12; r.x += env * 0.5; r.z += env * 0.45;
        if (this.armL && !this.armL.userData.free) this.armL.position.y = -0.02 - env * 0.18;
      }
      if (t >= 1 && st.reloadMode !== 'single') st.reload = -1;
    } else if (this.armL && !this.armL.userData.free) {
      this.armL.position.y = -0.02;
    }
    // melee swing: anticipation (windup), a fast accelerating strike, then an eased recovery.
    // slash = high right to low left across the screen; stab = pull back and thrust; punch = alternating jabs.
    if (this.armL?.userData.free && this.armLBase) { this.armL.position.copy(this.armLBase); this.armL.rotation.copy(this.armLRot); }
    if (st.swing >= 0) {
      st.swing += dt;
      const kind = this.meleeKind;
      const windup = this.def?.melee?.windup ?? 0.12;
      const mv = kind === 'punch' ? (FIST_MOVES[st.fistMove] || FIST_MOVES.jabL) : null;
      const d = mv ? mv.dur : kind === 'stab' ? 0.34 : Math.max(0.4, windup + 0.3);
      const t = Math.min(1, st.swing / d);
      const wEnd = mv ? mv.w : kind === 'stab' ? 0.35 : Math.min(0.4, Math.max(0.22, windup / d));
      const sEnd = mv ? mv.s : wEnd + 0.22;
      // key poses as offsets [x, y, z, rotX, rotY, rotZ]
      const POSES = {
        // raise to the upper right with the head tilted right, then sweep down-left across the view
        slash: [[0.1, 0.12, 0.03, -0.12, 0.1, -0.6], [-0.27, -0.17, -0.06, 0.55, -0.2, 1.15]],
        // draw back and down a little, then thrust forward toward the crosshair
        stab: [[0.03, -0.05, 0.06, 0.1, 0.05, 0.05], [-0.07, 0.05, -0.2, -0.12, -0.1, -0.05]],
        // cock back, then a straight jab toward the crosshair
        punch: [[0.02, -0.03, 0.05, 0, 0, 0], [-0.08, 0.06, -0.22, 0.05, -0.15, 0]],
      };
      const [W, E] = mv ? [mv.fp.W, mv.fp.E] : POSES[kind] || POSES.slash;
      const easeOut = (x) => 1 - (1 - x) * (1 - x), easeIn = (x) => x * x, easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      let P;
      if (t < wEnd) { const x = easeOut(t / wEnd); P = W.map((w) => w * x); }
      else if (t < sEnd) { const x = easeIn((t - wEnd) / (sEnd - wEnd)); P = W.map((w, i) => w + (E[i] - w) * x); }
      else { const x = easeIO((t - sEnd) / (1 - sEnd)); P = E.map((e) => e * (1 - x)); }
      if (mv && mv.arm === 'L' && this.armL?.userData.free) {
        // left-hand punch: move the free left fist; the right fist pulls back into guard
        this.armL.position.set(this.armLBase.x + P[0], this.armLBase.y + P[1], this.armLBase.z + P[2]);
        this.armL.rotation.set(this.armLRot.x + P[3], this.armLRot.y + P[4], this.armLRot.z + P[5]);
        const g = Math.sin(t * Math.PI);
        p.z += g * 0.04; p.y -= g * 0.015;
      } else {
        if (mv && this.armL?.userData.free) { const g = Math.sin(t * Math.PI); this.armL.position.z += g * 0.04; this.armL.position.y -= g * 0.015; }
        p.x += P[0]; p.y += P[1]; p.z += P[2];
        r.x += P[3]; r.y += P[4]; r.z += P[5];
      }
      if (t >= 1) st.swing = -1;
    }
    // ability gesture (left hand throw / raise)
    if (st.ability > 0 && this.armL) {
      const a = Math.sin(st.ability * Math.PI);
      p.y -= a * 0.08;
      if (this.armL.userData.free) this.armL.position.y = -0.2 + a * 0.12;
    }
    // rotary spin
    if (this.weapon.userData.spin) {
      st.spin = damp(st.spin, s.spun ? (s.firing ? 32 : 14) : 0, 5, dt);
      this.weapon.userData.spin.rotation.z += st.spin * dt;
    }
    this.rig.visible = this.visible && !s.scoped;
  }
}
