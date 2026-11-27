// Soul heads: the Soul-Stealer Shotgun's pellets. Each one is a see-through, orange-tinted copy of a class's
// head (picked at random per pellet by the server), flying face first. One template per class is built
// from the character model on first use; every pellet is a cheap clone sharing its geometry and materials.
import * as THREE from 'three';
import { CharacterRig } from './CharacterModel.js';
import { CLASS_IDS } from '../../shared/config/classes.js';

const SIZE = 0.42;          // head width in metres
const templates = new Map();
const mats = new Map();     // original material -> soul material

function soulMaterial(m) {
  if (Array.isArray(m)) return m.map(soulMaterial);
  let s = mats.get(m);
  if (!s) {
    s = new THREE.MeshBasicMaterial({
      map: m.map || null, vertexColors: !!m.vertexColors, color: 0xff8a2a,
      transparent: true, opacity: 0.62, depthWrite: false, alphaTest: m.alphaTest || 0,
    });
    mats.set(m, s);
  }
  return s;
}

function template(classId) {
  let t = templates.get(classId);
  if (t) return t;
  const rig = new CharacterRig(classId, 0, {});
  const head = rig.j.head.clone(true);
  head.position.set(0, 0, 0);
  head.rotation.set(0, 0, 0);
  head.traverse((o) => { if (o.isMesh) { o.material = soulMaterial(o.material); o.castShadow = false; o.receiveShadow = false; o.renderOrder = 6; } });
  const spin = new THREE.Group();
  spin.add(head);
  spin.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(spin);
  head.position.sub(box.getCenter(new THREE.Vector3()));
  const w = Math.max(1e-3, box.max.x - box.min.x);
  spin.scale.setScalar(SIZE / w);
  spin.rotation.y = Math.PI; // the model faces -Z; lookAt() points +Z along the flight path
  t = new THREE.Group();
  t.add(spin);
  t.userData.soulHead = true;
  templates.set(classId, t);
  return t;
}

export function soulHead(variant = 0) {
  return template(CLASS_IDS[Math.abs(variant | 0) % CLASS_IDS.length]).clone(true);
}
