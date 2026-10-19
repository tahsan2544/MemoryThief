import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { createRng } from '../core/rng.js';
import { paletteAt } from './dayNight.js';

/**
 * Sky for Eidolon City — driven by the day/night clock.
 *
 * A vertex-coloured sphere (no custom shader — the palette stays predictable
 * and it can never fail to compile), a star field, a moon and a sun. The
 * whole rig follows the camera so the horizon never breaks. `setTimeOfDay()`
 * repaints the dome from the blended time palette and fades the stars,
 * moon and sun in and out; the dome is also baked into a PMREM environment
 * map so wet streets, glass facades and water have something believable to
 * reflect (re-baked on the rare significant change of dayness).
 */

const RADIUS = 4000;

export function createSky(renderer) {
  const group = new THREE.Group();
  group.name = 'sky';

  const geo = new THREE.SphereGeometry(RADIUS, 48, 32);
  const colors = new Float32Array(geo.attributes.position.count * 3);

  const zenith = new THREE.Color();
  const upper = new THREE.Color();
  const horizon = new THREE.Color();
  const glow = new THREE.Color();
  const below = new THREE.Color();

  const dir = new THREE.Vector3();
  const tmp = new THREE.Color();
  const pos = geo.attributes.position;

  /** Repaint the dome from a time palette (hex fields, see dayNight.js). */
  function paint(p) {
    zenith.setHex(p.zenith);
    upper.setHex(p.upper);
    horizon.setHex(p.horizon);
    glow.setHex(p.glow);
    below.setHex(p.fog).multiplyScalar(0.55);

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

      // low warm band on the horizon — the sun (or the city glow) on the haze
      const band = Math.exp(-Math.pow((t - 0.015) * 9, 2));
      tmp.lerp(glow, band * 0.42);

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.attributes.color.needsUpdate = true;
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

  // ---- sun ----------------------------------------------------------------
  const sunGeo = new THREE.CircleGeometry(58, 40);
  const sun = new THREE.Mesh(
    sunGeo,
    new THREE.MeshBasicMaterial({ color: 0xffe8c0, fog: false, transparent: true, opacity: 0, toneMapped: true }),
  );
  sun.frustumCulled = false;
  sun.renderOrder = -998;
  group.add(sun);

  const sunHalo = new THREE.Mesh(
    new THREE.CircleGeometry(170, 40),
    new THREE.MeshBasicMaterial({ color: 0xffc98a, fog: false, transparent: true, opacity: 0, depthWrite: false, toneMapped: true }),
  );
  sunHalo.frustumCulled = false;
  sunHalo.renderOrder = -999;
  group.add(sunHalo);

  // ---- environment map ----------------------------------------------------
  const gl = renderer ?? null;
  function bakeEnvironment() {
    if (!gl) return null;
    try {
      const envScene = new THREE.Scene();
      const envDome = new THREE.Mesh(geo, mat);
      envScene.add(envDome);
      const pmrem = new THREE.PMREMGenerator(gl);
      pmrem.compileEquirectangularShader?.();
      const texture = pmrem.fromScene(envScene, 0, 1, RADIUS * 1.5).texture;
      pmrem.dispose();
      return texture;
    } catch (err) {
      console.warn('[sky] environment bake failed:', err);
      return null;
    }
  }
  const envTexture = bakeEnvironment();

  // ---- time of day --------------------------------------------------------
  let lastHour = 22;
  let lastPalette = paletteAt(22);
  paint(lastPalette);

  const ease = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // The group follows the camera, so the discs must face the group's LOCAL
  // origin (where the camera sits) — a world-space lookAt would skew them.
  const faceMatrix = new THREE.Matrix4();
  const localOrigin = new THREE.Vector3(0, 0, 0);
  const upVec = new THREE.Vector3(0, 1, 0);
  function faceCenter(mesh) {
    faceMatrix.lookAt(localOrigin, mesh.position, upVec);
    mesh.quaternion.setFromRotationMatrix(faceMatrix);
  }

  function setTimeOfDay(hour) {
    lastHour = hour;
    const p = paletteAt(hour);
    lastPalette = p;
    paint(p);

    const theta = ((hour - 6) / 12) * Math.PI;
    const e = Math.sin(theta);
    const sunUp = { x: Math.cos(theta), y: e, z: -0.42 };
    const len = Math.hypot(sunUp.x, sunUp.y, sunUp.z) || 1;
    sunUp.x = (sunUp.x / len) * RADIUS * 0.86;
    sunUp.y = (sunUp.y / len) * RADIUS * 0.86;
    sunUp.z = (sunUp.z / len) * RADIUS * 0.86;

    sun.position.set(sunUp.x, sunUp.y, sunUp.z);
    faceCenter(sun);
    sunHalo.position.copy(sun.position);
    faceCenter(sunHalo);
    moon.position.set(-sunUp.x, -sunUp.y, -sunUp.z);
    faceCenter(moon);
    halo.position.copy(moon.position);
    faceCenter(halo);

    const nightness = 1 - p.k;
    const dayness = ease(-0.12, 0.15, e);
    stars.material.opacity = 0.92 * nightness;
    stars.visible = stars.material.opacity > 0.01;
    moon.material.opacity = 0.92 * nightness;
    halo.material.opacity = 0.1 * nightness;
    sun.material.opacity = 0.95 * dayness;
    sunHalo.material.opacity = 0.14 * dayness;
    return p;
  }
  setTimeOfDay(22);

  const disposables = [geo, starGeo, moonGeo, sunGeo];

  return {
    group,
    envTexture, // initial bake (boot hour); swap in bakeEnvironment() results after re-bakes
    update(cameraPosition) {
      group.position.copy(cameraPosition);
    },
    setTimeOfDay,
    bakeEnvironment,
    /** Test/debug snapshot (window.__MT_SKY__). */
    snapshot() {
      const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
      return {
        hour: lastHour,
        zenith: css(lastPalette.zenith),
        horizon: css(lastPalette.horizon),
        fog: css(lastPalette.fog),
        dayness: Number(lastPalette.k.toFixed(3)),
        starOpacity: Number(stars.material.opacity.toFixed(3)),
        moonOpacity: Number(moon.material.opacity.toFixed(3)),
        sunOpacity: Number(sun.material.opacity.toFixed(3)),
      };
    },
    dispose() {
      for (const d of disposables) d.dispose();
      mat.dispose();
      envTexture?.dispose();
    },
  };
}
