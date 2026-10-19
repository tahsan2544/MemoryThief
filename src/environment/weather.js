import * as THREE from 'three';

/**
 * Rain — short line segments falling around the camera.
 *
 * Chosen over a points cloud because streaks read as rain at any speed, and
 * over a GPU shader because 4k line segments are trivial to update on the CPU
 * and keep the effect completely optional.
 */

const DROP_COUNT = 4200;
const BOX_X = 95;
const BOX_Y = 55;
const BOX_Z = 95;

export function createRain() {
  const positions = new Float32Array(DROP_COUNT * 6);
  const speeds = new Float32Array(DROP_COUNT);
  const lengths = new Float32Array(DROP_COUNT);

  const rngState = { s: 12345 };
  const rand = () => {
    rngState.s = (rngState.s * 1664525 + 1013904223) >>> 0;
    return rngState.s / 4294967296;
  };

  // seed the volume around the world origin; update() re-centres it later
  for (let i = 0; i < DROP_COUNT; i++) {
    const x = (rand() - 0.5) * BOX_X * 2;
    const y = (rand() - 0.5) * BOX_Y * 2;
    const z = (rand() - 0.5) * BOX_Z * 2;
    const len = 0.9 + rand() * 1.7;
    speeds[i] = 34 + rand() * 30;
    lengths[i] = len;
    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x - 0.42;
    positions[i * 6 + 4] = y + len;
    positions[i * 6 + 5] = z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x9ec2ff),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    fog: true,
  });

  const mesh = new THREE.LineSegments(geometry, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;

  let enabled = false;
  let intensity = 1; // 0..1 — the clock's weather schedule drives this
  const wind = 6.5;
  const BASE_OPACITY = 0.34;

  function setEnabled(v) {
    enabled = v;
    mesh.visible = v && intensity > 0.02;
  }

  /** Rain strength from the day/night weather schedule (0 = air clear). */
  function setIntensity(v) {
    intensity = Math.max(0, Math.min(1, v || 0));
    material.opacity = BASE_OPACITY * intensity;
    mesh.visible = enabled && intensity > 0.02;
  }

  function update(dt, cameraPosition) {
    if (!enabled || intensity <= 0.02 || dt <= 0) return;
    const p = geometry.attributes.position.array;
    const cx = cameraPosition.x;
    const cy = cameraPosition.y;
    const cz = cameraPosition.z;

    for (let i = 0; i < DROP_COUNT; i++) {
      const o = i * 6;
      let x = p[o];
      let y = p[o + 1] - speeds[i] * dt;
      let z = p[o + 2];

      x += wind * dt;
      if (y < cy - BOX_Y) y += BOX_Y * 2;
      else if (y > cy + BOX_Y) y -= BOX_Y * 2;
      if (x < cx - BOX_X) x += BOX_X * 2;
      else if (x > cx + BOX_X) x -= BOX_X * 2;
      if (z < cz - BOX_Z) z += BOX_Z * 2;
      else if (z > cz + BOX_Z) z -= BOX_Z * 2;

      p[o] = x;
      p[o + 1] = y;
      p[o + 2] = z;
      p[o + 3] = x - 0.42;
      p[o + 4] = y + lengths[i];
      p[o + 5] = z;
    }
    geometry.attributes.position.needsUpdate = true;
  }

  return {
    mesh,
    setEnabled,
    setIntensity,
    intensity: () => intensity,
    update,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
