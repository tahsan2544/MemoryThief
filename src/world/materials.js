import * as THREE from 'three';
import { DISTRICTS, FACADE_VARIANTS } from '../config/districts.js';
import { PALETTE } from '../config/palette.js';
import { textures } from './textures.js';

/**
 * Material library.
 *
 * Every material uses vertex colours, because the whole city is merged into a
 * handful of MeshBuilders whose only per-vertex variation is colour. Instanced
 * props reuse the same materials: their geometry carries a white colour
 * attribute so `instanceColor` multiplies cleanly on top.
 */

const ANISO = 8;

function standard(opts = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.0,
    ...opts,
  });
}

export function createMaterials() {
  const m = {};

  /* ---- Phase 8: shared surface-relief normal maps --------------------- */
  // One texture per surface class, reused by every material that needs it, so
  // the whole city gains light-reactive relief for three extra textures.
  const facadeNormal = textures.surfaceNormal('facade');
  facadeNormal.anisotropy = ANISO;
  const roadNormal = textures.surfaceNormal('road');
  roadNormal.anisotropy = ANISO;
  const groundNormal = textures.surfaceNormal('ground');
  groundNormal.anisotropy = ANISO;

  /* ---- facades (one per district + window-pattern variants) ------------ */
  for (const d of Object.values(DISTRICTS)) {
    for (let v = 0; v < FACADE_VARIANTS; v++) {
      const tex = textures.facade(d.facadeStyle, v);
      tex.map.anisotropy = ANISO;
      tex.emissiveMap.anisotropy = ANISO;
      m[`facade:${d.id}:${v}`] = standard({
        map: tex.map,
        emissiveMap: tex.emissiveMap,
        normalMap: facadeNormal,
        normalScale: new THREE.Vector2(d.facadeStyle === 'glass' ? 0.22 : 0.45, d.facadeStyle === 'glass' ? 0.22 : 0.45),
        emissive: new THREE.Color(d.emissive),
        emissiveIntensity: 1.15,
        roughness: d.facadeStyle === 'glass' ? 0.34 : 0.78,
        metalness: d.facadeStyle === 'glass' ? 0.22 : 0.04,
        envMapIntensity: d.facadeStyle === 'glass' ? 1.15 : 0.6,
      });
    }
  }

  /* ---- structural buckets --------------------------------------------- */
  const concrete = textures.concrete();
  concrete.map.anisotropy = ANISO;
  const metal = textures.metal();
  metal.map.anisotropy = ANISO;
  const asphalt = textures.asphalt();
  asphalt.map.anisotropy = ANISO;
  asphalt.roughnessMap.anisotropy = ANISO;

  m.roof = standard({ map: concrete.map, roughness: 0.9, metalness: 0.02, envMapIntensity: 0.5 });

  m.trim = standard({
    map: metal.map,
    roughness: 0.52,
    metalness: 0.55,
    envMapIntensity: 0.9,
  });

  m.road = standard({
    map: asphalt.map,
    roughnessMap: asphalt.roughnessMap,
    normalMap: roadNormal,
    normalScale: new THREE.Vector2(0.65, 0.65),
    roughness: 0.6,
    metalness: 0.2,
    envMapIntensity: 1.35,
  });

  m.ground = standard({
    map: concrete.map,
    normalMap: groundNormal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.88,
    metalness: 0.03,
    envMapIntensity: 0.55,
  });

  m.marking = standard({
    color: 0xdfe7f5,
    roughness: 0.55,
    metalness: 0.05,
    emissive: new THREE.Color(0x1a2436),
    envMapIntensity: 0.7,
  });

  m.sign = (() => {
    const atlas = textures.signAtlas();
    atlas.anisotropy = ANISO;
    return standard({
      map: atlas,
      emissiveMap: atlas,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.25,
      roughness: 0.5,
      metalness: 0.1,
    });
  })();

  m.neon = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    fog: true,
  });

  m.water = standard({
    color: new THREE.Color(PALETTE.water),
    roughness: 0.07,
    metalness: 0.35,
    normalMap: textures.waterNormal(),
    normalScale: new THREE.Vector2(0.5, 0.5),
    transparent: true,
    opacity: 0.9,
    envMapIntensity: 1.6,
    depthWrite: false,
  });

  m.glass = standard({
    color: new THREE.Color(0x16324a),
    roughness: 0.06,
    metalness: 0.1,
    transparent: true,
    opacity: 0.3,
    envMapIntensity: 1.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  /* ---- landmark signage plates ---------------------------------------- */
  const plates = {
    plateLogo: textures.logo(),
    plateTransit: textures.transitSign(),
    plateMarket: textures.marketSign(),
    plateArchive: textures.archiveSign(),
    platePoster: textures.posterAtlas(),
  };
  for (const [key, tex] of Object.entries(plates)) {
    tex.anisotropy = ANISO;
    m[key] = standard({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: key === 'platePoster' ? 0.35 : 1.3,
      roughness: 0.7,
      metalness: 0.0,
      side: key === 'platePoster' ? THREE.FrontSide : THREE.FrontSide,
    });
  }

  /* ---- instanced props -------------------------------------------------- */
  const propMetal = standard({ map: metal.map, roughness: 0.48, metalness: 0.6, envMapIntensity: 0.95 });
  const propPaint = standard({ map: metal.map, roughness: 0.62, metalness: 0.25, envMapIntensity: 0.7 });
  const propWood = standard({ map: concrete.map, roughness: 0.85, metalness: 0.0, envMapIntensity: 0.4 });
  const propFabric = standard({ map: concrete.map, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.35 });
  const propGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
  // Foliage/bark get a whisper of emissive: at night, otherwise the canopy
  // silhouettes read as black holes instead of greenery.
  const propFoliage = standard({
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.5,
    emissive: new THREE.Color(0x1d3a24),
    emissiveIntensity: 1.0,
  });
  const propBark = standard({
    roughness: 0.95,
    metalness: 0.0,
    envMapIntensity: 0.3,
    emissive: new THREE.Color(0x241c16),
    emissiveIntensity: 1.0,
  });

  Object.assign(m, {
    propMetal,
    propPaint,
    propWood,
    propFabric,
    propGlow,
    propFoliage,
    propBark,
  });

  m.cables = new THREE.LineBasicMaterial({
    color: new THREE.Color(0x0a0d14),
    transparent: true,
    opacity: 0.85,
    fog: true,
  });

  return m;
}

/**
 * Some surfaces must stop reflecting the sky when "wet streets" is disabled.
 * Cheap toggle: roughness/env intensity only, no shader rebuild.
 */
export function setWet(materials, wet) {
  if (materials.road) {
    materials.road.roughness = wet ? 0.6 : 1.0;
    materials.road.envMapIntensity = wet ? 1.35 : 0.35;
    materials.road.metalness = wet ? 0.2 : 0.02;
    materials.road.needsUpdate = false;
  }
  if (materials.water) materials.water.opacity = wet ? 0.9 : 0.78;
}
