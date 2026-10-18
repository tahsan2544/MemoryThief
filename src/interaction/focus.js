import * as THREE from 'three';

/**
 * Interaction focus (Phase 8).
 *
 * The prompt already told you *what* was in reach; it never told you *where*.
 * This draws a soft additive ring on the ground under the current prompt
 * target plus a small floating marker bobbing above it, both easing toward
 * the target so the highlight glides between neighbours instead of snapping.
 *
 * Purely presentational: it changes no keys, no prompt text and no priority
 * rules — it only makes the existing choices visible in the world. Two meshes,
 * two draw calls, one shared material pair.
 */
export function createFocus(scene) {
  const ringGeo = new THREE.RingGeometry(0.44, 0.62, 40);
  ringGeo.rotateX(-Math.PI / 2); // lie flat on the ground
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9a7bff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.visible = false;
  ring.renderOrder = 3;
  scene.add(ring);

  const markGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const markMat = new THREE.MeshBasicMaterial({
    color: 0xcdbcff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const mark = new THREE.Mesh(markGeo, markMat);
  mark.visible = false;
  mark.renderOrder = 4;
  scene.add(mark);

  const pos = new THREE.Vector3();
  const want = new THREE.Vector3();
  let hasTarget = false;
  let seeded = false;
  let shown = 0; // 0..1 fade

  /** @param {{x:number,y:number,z:number}|null} target */
  function set(target) {
    hasTarget = !!target;
    if (target) want.set(target.x, target.y, target.z);
  }

  function update(dt, camera, t) {
    if (hasTarget) {
      if (!seeded) {
        pos.copy(want);
        seeded = true;
      } else {
        pos.lerp(want, 1 - Math.exp(-14 * dt));
      }
    } else {
      seeded = false;
    }

    shown += ((hasTarget ? 1 : 0) - shown) * (1 - Math.exp(-9 * dt));
    const on = shown > 0.02;
    ring.visible = on;
    mark.visible = on;
    if (!on) return;

    const pulse = 1 + Math.sin(t * 3.2) * 0.06;
    ring.position.set(pos.x, pos.y + 0.04, pos.z);
    ring.scale.setScalar(pulse);
    ringMat.opacity = 0.5 * shown;

    mark.position.set(pos.x, pos.y + 1.15 + Math.sin(t * 2.4) * 0.06, pos.z);
    mark.quaternion.copy(camera.quaternion); // billboard
    markMat.opacity = 0.85 * shown;
  }

  function dispose() {
    scene.remove(ring);
    scene.remove(mark);
    ringGeo.dispose();
    ringMat.dispose();
    markGeo.dispose();
    markMat.dispose();
  }

  return { ring, mark, set, update, dispose };
}
