import * as THREE from 'three';

/**
 * Ambient environmental particles (Phase 7) — slow drifting dust and ash
 * motes that give the air weight near the camera.
 *
 * One additive `Points` cloud wrapped around the camera position: ~460
 * points cost one draw call and a trivial CPU update. Count is quality-preset
 * driven (Low = 0) and can be zeroed by the "reduce visual effects"
 * accessibility option without touching anything else.
 *
 * `desired` holds the quality-preset count; `effective()` reports what is
 * actually drawn — 0 while reduce-FX is on — so `count` / `stats().count`
 * honestly read 0 whenever the cloud is hidden.
 */

const MAX_MOTES = 460;
const BOX = 44; // metres — cloud is re-centred on the camera each frame

export function createMotes() {
  const positions = new Float32Array(MAX_MOTES * 3);
  const drift = new Float32Array(MAX_MOTES * 3); // per-mote velocity (m/s)

  const rngState = { s: 987654321 };
  const rand = () => {
    rngState.s = (rngState.s * 1664525 + 1013904223) >>> 0;
    return rngState.s / 4294967296;
  };

  for (let i = 0; i < MAX_MOTES; i++) {
    positions[i * 3] = (rand() - 0.5) * BOX;
    positions[i * 3 + 1] = (rand() - 0.5) * BOX;
    positions[i * 3 + 2] = (rand() - 0.5) * BOX;
    // mostly sideways drift with a slow sink; a few rise like embers
    drift[i * 3] = (rand() - 0.5) * 0.5;
    drift[i * 3 + 1] = rand() < 0.18 ? 0.25 + rand() * 0.2 : -(0.1 + rand() * 0.22);
    drift[i * 3 + 2] = (rand() - 0.5) * 0.5;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), BOX);

  const material = new THREE.PointsMaterial({
    color: 0x9fc4e8,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // we do our own wrap-around culling
  points.renderOrder = 4; // draw after opaque world geometry
  points.name = 'motes';

  let desired = 0; // quality-preset mote count
  let reduced = false;
  // Points actually drawn — 0 while reduce-FX hides the cloud, so callers
  // that ask "how many motes?" get an honest 0 when none are visible.
  const effective = () => (reduced ? 0 : desired);

  function applyRange() {
    const n = effective();
    geometry.setDrawRange(0, n);
    points.visible = n > 0;
  }

  function setCount(n) {
    desired = Math.max(0, Math.min(MAX_MOTES, Math.floor(n)));
    applyRange();
  }

  /** Accessibility: "reduce visual effects" hides the cloud entirely. */
  function setReduced(on) {
    reduced = !!on;
    applyRange();
    return reduced;
  }

  const camPrev = new THREE.Vector3();
  let seeded = false;

  function update(dt, cameraPosition) {
    const n = effective();
    if (!points.visible || n === 0) return;

    // wrap the whole cloud into the box around the camera; when the camera
    // jumps (teleport) re-centre instantly instead of smearing across it
    if (!seeded) {
      camPrev.copy(cameraPosition);
      seeded = true;
    }
    const movedX = cameraPosition.x - camPrev.x;
    const movedZ = cameraPosition.z - camPrev.z;
    camPrev.copy(cameraPosition);

    const half = BOX / 2;
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      pos[ix] += drift[ix] * dt + movedX;
      pos[ix + 1] += drift[ix + 1] * dt;
      pos[ix + 2] += drift[ix + 2] * dt + movedZ;

      // wrap into the box around the camera
      if (pos[ix] - cameraPosition.x > half) pos[ix] -= BOX;
      else if (pos[ix] - cameraPosition.x < -half) pos[ix] += BOX;
      if (pos[ix + 1] - cameraPosition.y > half) pos[ix + 1] -= BOX;
      else if (pos[ix + 1] - cameraPosition.y < -half) pos[ix + 1] += BOX;
      if (pos[ix + 2] - cameraPosition.z > half) pos[ix + 2] -= BOX;
      else if (pos[ix + 2] - cameraPosition.z < -half) pos[ix + 2] += BOX;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
    points.removeFromParent();
  }

  return {
    points,
    update,
    setCount,
    setReduced,
    dispose,
    get count() { return effective(); },
    get reduced() { return reduced; },
    stats() {
      return { enabled: points.visible, count: effective(), reduced, max: MAX_MOTES };
    },
  };
}
