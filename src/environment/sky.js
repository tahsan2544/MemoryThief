import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { createRng } from '../core/rng.js';

/**
 * Night sky for Eidolon City.
 *
 * A vertex-coloured sphere (no custom shader — the palette stays predictable
 * and it can never fail to compile), a star field and a hazy moon. The whole
 * rig follows the camera so the horizon never breaks.
 *
 * A second copy of the sky sphere is baked into a PMREM environment map so
 * wet streets, glass facades and water have something believable to reflect.
 */

const RADIUS = 4000;

export function createSky(renderer) {
  const group = new THREE.Group();
  group.name = 'sky';

  const geo = new THREE.SphereGeometry(RADIUS, 48, 32);
  const colors = new Float32Array(geo.attributes.position.count * 3);

  const zenith = new THREE.Color(PALETTE.skyZenith);
  const upper = new THREE.Color(PALETTE.skyUpper);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const glow = new THREE.Color(PALETTE.skyGlow);
  const below = new THREE.Color(PALETTE.fog).multiplyScalar(0.55);

  const dir = new THREE.Vector3();
  const tmp = new THREE.Color();
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    dir.fromBufferAttribute(pos, i).normalize();
    const t = dir.y;

    if (t >= 0) {
      const k = Math.pow(t, 0.7);
      tmp.copy(horizon).lerp(upper, Math.min(1, k * 2.2));
      if (t > 0.35) tmp.lerp(zenith, Math.min(1, (t - 0.35) / 0.55));
    } else {
      tmp.copy(horizon).lerp(below, Math.min(1, -t * 2.4));
    }

    // low warm band on the horizon — city glow bouncing off the haze
    const band = Math.exp(-Math.pow((t - 0.015) * 9, 2));
    tmp.lerp(glow, band * 0.42);

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: true,
  });

  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  group.add(dome);

  // ---- stars --------------------------------------------------------------
  const rng = createRng('stars');
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = rng.next() * 2 - 1;
    const a = rng.next() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const r = RADIUS * 0.94;
    starPos[i * 3] = Math.cos(a) * s * r;
    starPos[i * 3 + 1] = Math.abs(u) * r * 0.98 + 40;
    starPos[i * 3 + 2] = Math.sin(a) * s * r;
    const b = rng.range(0.35, 1);
    starCol[i * 3] = b * 0.85;
    starCol[i * 3 + 1] = b * 0.9;
    starCol[i * 3 + 2] = b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      size: 2.4,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  stars.frustumCulled = false;
  stars.renderOrder = -999;
  group.add(stars);

  // ---- moon ---------------------------------------------------------------
  const moonGeo = new THREE.CircleGeometry(70, 40);
  const moon = new THREE.Mesh(
    moonGeo,
    new THREE.MeshBasicMaterial({ color: PALETTE.moon, fog: false, transparent: true, opacity: 0.92, toneMapped: true }),
  );
  moon.position.set(-RADIUS * 0.55, RADIUS * 0.5, -RADIUS * 0.66);
  moon.lookAt(0, 0, 0);
  moon.frustumCulled = false;
  moon.renderOrder = -998;
  group.add(moon);

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(190, 40),
    new THREE.MeshBasicMaterial({ color: 0x9ab6e8, fog: false, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: true }),
  );
  halo.position.copy(moon.position);
  halo.lookAt(0, 0, 0);
  halo.frustumCulled = false;
  halo.renderOrder = -999;
  group.add(halo);

  // ---- environment map ----------------------------------------------------
  let envTexture = null;
  if (renderer) {
    try {
      const envScene = new THREE.Scene();
      const envDome = new THREE.Mesh(geo, mat);
      envScene.add(envDome);
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader?.();
      envTexture = pmrem.fromScene(envScene, 0, 1, RADIUS * 1.5).texture;
      pmrem.dispose();
    } catch (err) {
      console.warn('[sky] environment bake failed:', err);
      envTexture = null;
    }
  }

  const disposables = [geo, starGeo, moonGeo];

  return {
    group,
    envTexture,
    update(cameraPosition) {
      group.position.copy(cameraPosition);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      mat.dispose();
      envTexture?.dispose();
    },
  };
}
