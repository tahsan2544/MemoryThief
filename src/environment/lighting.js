import * as THREE from 'three';
import { DISTRICT_ORDER, DISTRICTS } from '../config/districts.js';
import { PALETTE } from '../config/palette.js';
import { elevationAt, paletteAt } from './dayNight.js';

/**
 * Lighting rig.
 *
 * One cool directional key (which follows the camera so the shadow map can
 * stay small and sharp), a hemisphere fill, plus a handful of large, cheap
 * district accent lights that create the warm/cool contrast between
 * neighbourhoods without adding real-time lights to every street lamp.
 */

export function createLighting(scene, layout, settings, quality) {
  const group = new THREE.Group();
  group.name = 'lighting';

  const ambient = new THREE.AmbientLight(PALETTE.ambient, 1.05);
  group.add(ambient);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.3);
  group.add(hemi);

  const dir = new THREE.DirectionalLight(PALETTE.moonlight, 1.85);
  dir.castShadow = true;
  dir.shadow.bias = -0.0006;
  dir.shadow.normalBias = 0.05;
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 620;
  const radius = quality.shadowRadius;
  dir.shadow.camera.left = -radius;
  dir.shadow.camera.right = radius;
  dir.shadow.camera.top = radius;
  dir.shadow.camera.bottom = -radius;
  dir.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  dir.target.position.set(0, 0, 0);
  group.add(dir);
  group.add(dir.target);

  // Phase 8 — rim / back light. A dim, cool counter-directional that grazes
  // silhouettes so characters and kerbs separate from the dark background.
  // It casts no shadow (it exists only to catch edges) and costs nothing in
  // the point-light budget because it is directional, not a point light.
  const rim = new THREE.DirectionalLight(PALETTE.moonlight, 0.62);
  rim.castShadow = false;
  group.add(rim);
  group.add(rim.target);

  // ---- district accent lights -------------------------------------------
  const districtLights = [];
  for (const id of DISTRICT_ORDER) {
    const D = DISTRICTS[id];
    const info = layout.districtInfo[id];
    if (!info) continue;
    const light = new THREE.PointLight(D.fill, 0, 420, 1);
    const coreCell = info.cells.reduce((best, c) => {
      const d = Math.hypot(c.ix - info.coreIx, c.iz - info.coreIz);
      return d < best.d ? { c, d } : best;
    }, { c: info.cells[0], d: Infinity }).c;
    light.position.set(coreCell.cx, 95, coreCell.cz);
    group.add(light);
    districtLights.push(light);
  }

  // ---- landmark accent lights -------------------------------------------
  const landmarkLights = [];
  for (const lm of layout.landmarks) {
    const D = DISTRICTS[lm.cell.district];
    const light = new THREE.PointLight(D.emissive, 0, 400, 1);
    light.position.set(lm.x, lm.type === 'tower' ? 130 : 26, lm.z);
    group.add(light);
    landmarkLights.push(light);
  }

  scene.add(group);

  const offset = new THREE.Vector3(90, 170, 70);
  // behind and to the far side of the key: the rim reads as a backlight
  const rimOffset = new THREE.Vector3(-150, 95, -120);
  const target = new THREE.Vector3();

  // ---- day/night (Phase 11) ---------------------------------------------
  // The clock repaints ambient/hemi/key from the blended time palette, swings
  // the key light onto the sun's arc (moon by night), and dims the district
  // lamps by day — they are the city's night lighting, not its daylight.
  const lightDir = new THREE.Vector3(90, 170, 70).normalize();
  let nightScale = 1;

  /**
   * @param {number} hour game hour (0..24)
   * @param {{x:number,y:number,z:number}} dirVec unit key direction for that hour
   */
  function setTimeOfDay(hour, dirVec) {
    const p = paletteAt(hour);
    ambient.color.setHex(p.ambient);
    ambient.intensity = 1.05 + 0.4 * p.k;
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = 1.3 + 0.35 * p.k;
    dir.color.setHex(p.key);
    // twilight dips the key while the light changes hands at the horizon
    const e = elevationAt(hour);
    const dip = 1 - 0.35 * Math.exp(-Math.pow(e / 0.09, 2));
    dir.intensity = (1.85 + 0.55 * p.k) * dip;
    if (dirVec) lightDir.set(dirVec.x, dirVec.y, dirVec.z).normalize();
    offset.copy(lightDir).multiplyScalar(205);
    const nextScale = 1 - 0.82 * p.k;
    if (nextScale !== nightScale) {
      nightScale = nextScale;
      refreshLights(lastPos); // re-apply accent intensities at the new scale
    }
  }

  // ---- dynamic light budget (Phase 7) ------------------------------------
  // Forward rendering pays for every visible light on every material, so we
  // only show the *nearest* N district/landmark accent lights to the camera
  // (N comes from the quality preset). This both cuts fragment cost and fixes
  // an old quirk where the first districts by index always got their light
  // regardless of where the player stood.
  let budget = { district: 0, landmark: 0 };
  const lastPos = new THREE.Vector3(0, 0, 0);
  let lightTimer = 0;
  let visibleDistrict = 0;
  let visibleLandmark = 0;

  function nearestFirst(list, pos, n) {
    // sort by squared distance (lists are tiny: <= 5 entries)
    const ranked = list
      .map((l, i) => ({ i, d: l.position.distanceToSquared(pos) }))
      .sort((a, b) => a.d - b.d);
    const keep = new Set(ranked.slice(0, n).map((r) => r.i));
    list.forEach((l, i) => {
      const on = keep.has(i);
      l.visible = on;
      l.intensity = on ? (l.userData.baseIntensity ?? 1) * nightScale : 0;
    });
    return keep.size;
  }

  function refreshLights(pos) {
    lastPos.copy(pos);
    visibleDistrict = nearestFirst(districtLights, pos, budget.district);
    visibleLandmark = nearestFirst(landmarkLights, pos, budget.landmark);
  }

  function setShadowEnabled(enabled) {
    dir.castShadow = enabled;
    dir.shadow.needsUpdate = true;
  }

  function applyQuality(q) {
    dir.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    dir.shadow.camera.left = -q.shadowRadius;
    dir.shadow.camera.right = q.shadowRadius;
    dir.shadow.camera.top = q.shadowRadius;
    dir.shadow.camera.bottom = q.shadowRadius;
    dir.shadow.camera.updateProjectionMatrix();
    dir.shadow.map?.dispose();
    dir.shadow.map = null;
    setShadowEnabled(settings.shadows && q.shadows);

    districtLights.forEach((l) => { l.userData.baseIntensity = 280; });
    landmarkLights.forEach((l) => { l.userData.baseIntensity = 165; });
    budget = { district: q.districtLights ?? 0, landmark: q.landmarkLights ?? 0 };
    refreshLights(lastPos); // re-pick immediately at the new budget
  }

  function update(cameraPosition, dt = 0.016) {
    // keep the shadow frustum tight around wherever the player is looking
    target.copy(cameraPosition);
    dir.position.copy(target).add(offset);
    dir.target.position.copy(target);
    dir.target.updateMatrixWorld();
    dir.updateMatrixWorld();

    rim.position.copy(target).add(rimOffset);
    rim.target.position.copy(target);
    rim.target.updateMatrixWorld();
    rim.updateMatrixWorld();

    // re-pick the nearest accent lights twice a second (cheap: <= 10 lights)
    lightTimer -= dt;
    if (lightTimer <= 0) {
      lightTimer = 0.5;
      refreshLights(cameraPosition);
    }
  }

  applyQuality(quality);

  return {
    group,
    dir,
    ambient, // exposed for the reconstruction overlay (Phase 3)
    hemi,
    applyQuality,
    setShadowEnabled,
    setTimeOfDay,
    /** Accent-lamp scale by clock (1 at night, ~0.18 at noon) — for tests/HUD. */
    nightScale: () => nightScale,
    update,
    /** { total, visible } for the stats HUD / test hooks. */
    counts() {
      return {
        total: districtLights.length + landmarkLights.length + 3, // + ambient/hemi/dir
        pointTotal: districtLights.length + landmarkLights.length,
        pointVisible: visibleDistrict + visibleLandmark,
      };
    },
    dispose() {
      dir.shadow.dispose?.();
      scene.remove(group);
    },
  };
}
