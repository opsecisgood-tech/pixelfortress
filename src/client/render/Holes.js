// Round holes burnt through the world by the Admin Gun. Map materials get a small shader patch that
// discards every fragment inside a hole's cylinder, so the hole is a perfect see-through circle; a
// glowing rim decal (hot white -> orange -> charred) marks each entry and exit.
import * as THREE from 'three';

export const MAX_HOLES = 48;
export const HOLE_UNIFORMS = {
  holeA: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, -1e5, 0, 0)) },
  holeB: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector3(0, -1e5, 0)) },
  holeCount: { value: 0 },
};

export function setHoleUniforms(list) {
  const L = list.slice(-MAX_HOLES);
  L.forEach((h, i) => { HOLE_UNIFORMS.holeA.value[i].set(h.a[0], h.a[1], h.a[2], h.r); HOLE_UNIFORMS.holeB.value[i].set(h.b[0], h.b[1], h.b[2]); });
  HOLE_UNIFORMS.holeCount.value = L.length;
}

const FRAG_HEAD = `uniform vec4 holeA[${MAX_HOLES}]; uniform vec3 holeB[${MAX_HOLES}]; uniform int holeCount; varying vec3 vHoleW;\n`;
const FRAG_CUT = `
  for (int hi = 0; hi < ${MAX_HOLES}; hi++) {
    if (hi >= holeCount) break;
    vec3 ha = holeA[hi].xyz; vec3 hab = holeB[hi] - ha;
    float ht = dot(vHoleW - ha, hab) / max(dot(hab, hab), 1e-5);
    if (ht > -0.05 && ht < 1.05 && distance(vHoleW, ha + hab * ht) < holeA[hi].w) discard;
  }`;

// Patch every standard map material under root (once per material).
export function patchHoles(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.userData.holes || m.isShaderMaterial || !(m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial)) continue;
      m.userData.holes = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        prev?.call(m, shader, r);
        shader.uniforms.holeA = HOLE_UNIFORMS.holeA; shader.uniforms.holeB = HOLE_UNIFORMS.holeB; shader.uniforms.holeCount = HOLE_UNIFORMS.holeCount;
        shader.vertexShader = 'varying vec3 vHoleW;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
          vec4 holeW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            holeW = instanceMatrix * holeW;
          #endif
          vHoleW = (modelMatrix * holeW).xyz;`);
        shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('void main() {', `void main() {${FRAG_CUT}`);
      };
      const key = m.customProgramCacheKey?.bind(m);
      m.customProgramCacheKey = () => `${key ? key() : ''}|holes`;
      m.needsUpdate = true;
    }
  });
}

// Glowing rims at hole entries and exits, cooling from white-hot through orange to charred.
export class HoleRims {
  constructor(scene) { this.scene = scene; this.list = []; this.geo = new THREE.RingGeometry(1, 1.22, 40); }
  add(point, normal, dir, r) {
    const n = new THREE.Vector3(...normal).normalize();
    const d = new THREE.Vector3(...dir);
    const cos = Math.abs(d.dot(n));
    let u = d.clone().addScaledVector(n, -d.dot(n));
    if (u.lengthSq() < 1e-6) u = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(n) : new THREE.Vector3(1, 0, 0).cross(n);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const stretch = Math.min(3, 1 / Math.max(0.33, cos)); // the hole's outline on a slanted surface is an ellipse
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(this.geo, mat);
    m.matrixAutoUpdate = false;
    const p = new THREE.Vector3(...point).addScaledVector(n, 0.012);
    m.matrix.makeBasis(u.multiplyScalar(r * stretch), v.multiplyScalar(r), n).setPosition(p);
    m.renderOrder = 3;
    this.scene.add(m);
    this.list.push({ m, t: 0 });
    while (this.list.length > MAX_HOLES * 2) { const o = this.list.shift(); this.scene.remove(o.m); o.m.material.dispose(); }
  }
  update(dt) {
    const hot = new THREE.Color(0xffffff), mid = new THREE.Color(0xff9a20), char = new THREE.Color(0x24180f);
    for (const o of this.list) {
      if (o.t > 6) continue;
      o.t += dt;
      const k = o.t;
      if (k < 0.6) o.m.material.color.copy(hot).lerp(mid, k / 0.6);
      else o.m.material.color.copy(mid).lerp(char, Math.min(1, (k - 0.6) / 4));
      o.m.material.opacity = k < 4.6 ? 1 : Math.max(0.75, 1 - (k - 4.6) * 0.2);
    }
  }
  clear() { for (const o of this.list) { this.scene.remove(o.m); o.m.material.dispose(); } this.list.length = 0; }
}
