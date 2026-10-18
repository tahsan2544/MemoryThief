import * as THREE from 'three';
import { DISTRICTS } from '../config/districts.js';
import { createRng } from '../core/rng.js';
import { Colliders } from '../player/collision.js';
import { createInteractables } from '../interaction/interactables.js';
import { buildMemorySites } from './memorySites.js';
import { buildCityLife } from './cityLife.js';
import { MeshBuilder, rgb } from '../utils/geo.js';
import { generateCellBuildings } from './buildings.js';
import { buildDetails } from './details.js';
import { buildLandmark } from './landmarks.js';
import { placeCellProps, placeIntersectionProps, placeSignPosts, PropPlacer } from './props.js';

/**
 * World builder — assembles the whole of Eidolon City.
 *
 * Geometry is accumulated into per-chunk MeshBuilder buckets (one per
 * material), then compiled into a small number of meshes per chunk so the
 * renderer can frustum-cull entire neighbourhoods at once.
 *
 * Generation is async and reports progress so the loading screen stays live.
 */

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

export class CancelledError extends Error {
  constructor() {
    super('world generation cancelled');
    this.name = 'CancelledError';
  }
}

export async function buildWorld({
  layout,
  settings,
  materials,
  quality,
  onProgress = () => {},
  shouldCancel = () => false,
}) {
  const check = () => {
    if (shouldCancel()) throw new CancelledError();
  };
  const step = async (pct, label, detail = '') => {
    check();
    onProgress(pct, label, detail);
    await nextFrame();
    check();
  };

  const root = new THREE.Group();
  root.name = 'eidolon-city';

  // ---- solidity --------------------------------------------------------
  // Everything generated below registers the volume it occupies here, so the
  // collision world and the visible city can never drift apart.
  const colliders = new Colliders(layout);
  const solid = (x0, z0, x1, z1, y0, y1, tag) => colliders.addBox(x0, z0, x1, z1, y0, y1, tag);
  const solidCircle = (x, z, r, y0, y1, tag) => colliders.addCircle(x, z, r, y0, y1, tag);

  // world boundary — the edge of the base plane, tall enough to stop a run
  {
    const e = layout.extent / 2;
    const t = 6;
    const wallTop = 40;
    solid(-e - t, -e - t, e + t, -e, -0.06, wallTop, 'boundary');
    solid(-e - t, e, e + t, e + t, -0.06, wallTop, 'boundary');
    solid(-e - t, -e, -e, e, -0.06, wallTop, 'boundary');
    solid(e, -e, e + t, e, -0.06, wallTop, 'boundary');
  }

  // ---- bucket registries -------------------------------------------------
  const chunkMaps = layout.chunks.map(() => new Map());
  const detailMap = new Map();
  const chunksPerAxis = layout.grid / 2;

  const builder = (map, key) => {
    let b = map.get(key);
    if (!b) {
      b = new MeshBuilder();
      map.set(key, b);
    }
    return b;
  };

  function chunkIndexOf(x, z) {
    const ix = Math.floor((x - layout.origin) / layout.cell);
    const iz = Math.floor((z - layout.origin) / layout.cell);
    const cx = Math.min(chunksPerAxis - 1, Math.max(0, Math.floor(ix / 2)));
    const cz = Math.min(chunksPerAxis - 1, Math.max(0, Math.floor(iz / 2)));
    return cz * chunksPerAxis + cx;
  }

  const detailBucket = (key) => builder(detailMap, key);

  /* ================================================================ *
   * 1. street grid + block slabs
   * ================================================================ */
  await step(0.06, 'Laying out the street grid', `${layout.grid}×${layout.grid} blocks`);

  const groundB = (idx) => builder(chunkMaps[idx], 'ground');
  const roadB = (idx) => builder(chunkMaps[idx], 'road');
  const markB = (idx) => builder(chunkMaps[idx], 'marking');
  const waterCell = (idx) => builder(chunkMaps[idx], 'water');

  for (const cd of layout.cells) {
    const idx = chunkIndexOf(cd.cx, cd.cz);
    const D = DISTRICTS[cd.district];

    if (!cd.landmark) {
      // raised block slab: top surface + visible curb faces + a BOTTOM face,
      // so a camera that ever dips below street level sees slab, not sky
      builder(chunkMaps[idx], 'ground').box({
        x: cd.cx,
        y: 0,
        z: cd.cz,
        w: cd.x1 - cd.x0,
        h: layout.curb,
        d: cd.z1 - cd.z0,
        color: rgb(0x101218).map((v) => v),
        roofColor: D.ground,
        roofUvScale: 0.1,
      });
    }

    if (cd.flooded) {
      waterCell(idx).box({
        x: cd.cx,
        y: layout.curb + 0.05,
        z: cd.cz,
        w: cd.x1 - cd.x0 - 0.6,
        h: 0.12,
        d: cd.z1 - cd.z0 - 0.6,
        color: 0xffffff,
      });
    }
    void groundB;
  }

  // road surfaces + markings. The tarmac is a real slab (top at 0.02 m,
  // body buried into the base plane) instead of a floating quad, so there is
  // no gap under a road for the camera to see the void through.
  for (const q of layout.roadQuads) {
    const idx = chunkIndexOf((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2);
    const roadCol = rgb(DISTRICTS[q.district].road);
    roadB(idx).box({
      x: (q.x0 + q.x1) / 2,
      y: -0.36,
      z: (q.z0 + q.z1) / 2,
      w: q.x1 - q.x0,
      h: 0.38,
      d: q.z1 - q.z0,
      color: [roadCol[0] * 0.62, roadCol[1] * 0.62, roadCol[2] * 0.62],
      roofColor: roadCol,
      roofUvScale: 0.045,
    });
  }
  for (const q of layout.markingQuads) {
    const idx = chunkIndexOf((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2);
    markB(idx).ground(q.x0, q.z0, q.x1, q.z1, 0.03, rgb(0xd8e2f2), { uScale: 0.4, vScale: 0.4 });
  }

  /* ================================================================ *
   * 2. buildings
   * ================================================================ */
  await step(0.18, 'Raising city blocks', 'procedural facades, tiers and rooftops');

  let built = 0;
  for (const cd of layout.cells) {
    if (cd.landmark) continue;
    const idx = chunkIndexOf(cd.cx, cd.cz);
    const ctx = {
      layout,
      density: settings.density,
      bucket: (key) => builder(chunkMaps[idx], key),
      colliders,
      solid,
      solidCircle,
    };
    generateCellBuildings(cd, ctx);
    built++;
    if (built % 24 === 0) {
      await step(0.18 + 0.26 * (built / layout.cells.length), 'Raising city blocks', `${built} / ${layout.cells.length} blocks`);
    }
  }

  /* ================================================================ *
   * 3. landmarks
   * ================================================================ */
  await step(0.48, 'Placing landmarks', 'tower · market · station · garden · underarchive');

  const landmarkPlacer = new PropPlacer(colliders);
  for (const lm of layout.landmarks) {
    const idx = chunkIndexOf(lm.x, lm.z);
    const ctx = {
      layout,
      density: settings.density,
      bucket: (key) => builder(chunkMaps[idx], key),
      placer: landmarkPlacer,
      colliders,
      solid,
      solidCircle,
    };
    buildLandmark(lm.type, lm.cell, ctx);
    await step(0.48 + 0.1 * ((layout.landmarks.indexOf(lm) + 1) / layout.landmarks.length), 'Placing landmarks', lm.type);
  }

  /* ================================================================ *
   * 4. street furniture
   * ================================================================ */
  await step(0.6, 'Installing street furniture', 'lamps · benches · trees · signage');

  const placer = new PropPlacer(colliders);
  const propDensity = settings.density * quality.propDensity;
  let done = 0;
  for (const cd of layout.cells) {
    placeCellProps(cd, layout, settings, placer, propDensity);
    done++;
    if (done % 36 === 0) {
      await step(0.6 + 0.14 * (done / layout.cells.length), 'Installing street furniture', `${done} / ${layout.cells.length} blocks`);
    }
  }
  placeIntersectionProps(layout, settings, placer, propDensity);
  placeSignPosts(layout, placer, propDensity);

  /* ================================================================ *
   * 5. city-wide details
   * ================================================================ */
  await step(0.78, 'Stringing cables and walkways', 'canal · skybridges · power lines');

  const detailCtx = { density: settings.density, detailBucket, colliders, solid, solidCircle };
  const { lines } = buildDetails(layout, detailCtx);

  /* ================================================================ *
   * 5b. interactables
   * ================================================================ */
  await step(0.82, 'Wiring points of interest', 'signs · valves · sealed doors');

  const interactables = createInteractables(layout);
  for (const it of interactables) {
    if (it.prop) placer.add(it.prop.type, it.x, it.y, it.z, it.prop.ry ?? 0, it.prop.scale ?? 1, it.prop.color ?? 0xffffff);
  }
  interactables.forEach((it, i) => {
    it.index = i;
  });

  /* ================================================================ *
   * 5c. memory sites (Phase 3) — sources, NPCs, hidden annex
   * ================================================================ */
  await step(0.845, 'Filing memory sources', 'attendants · traders · a sealed annex');

  // Probes the raw collider list (buildings + props are all in place by now)
  // to seat the service annex flush against a real wall, then adds its own
  // solids — the door collider is the one that later toggles at runtime.
  const memorySites = buildMemorySites({ layout, colliders, interactables, root });

  /* ================================================================ *
   * 5d. city life (Phase 4) — agents, patrols, cover, restricted zones
   * ================================================================ */
  await step(0.855, 'Waking the city', 'shifts · patrols · cover · restricted ground');

  // Street furniture (placers) and memory sources are in place by now, so
  // the population can probe real pavements, add its own crates/bollards
  // through the shared instancers, and keep clear of every prompt anchor.
  const cityLife = buildCityLife({
    layout,
    colliders,
    interactables,
    memorySites,
    placer,
    root,
    seed: settings.seed,
  });

  /* ================================================================ *
   * 6. compile
   * ================================================================ */
  await step(0.86, 'Compiling meshes', 'merging geometry into chunk buckets');

  const disposables = [];
  let triangles = 0;
  let meshCount = 0;

  // base slab underneath everything. It is a CLOSED box (top, sides and a
  // bottom face) rather than a single quad, so nothing — road undersides,
  // canal cut-outs, the island edge — can ever show the void through it.
  {
    const baseB = new MeshBuilder();
    const pad = layout.extent * 0.75;
    baseB.box({
      x: 0,
      y: -4.08,
      z: 0,
      w: pad * 2,
      h: 4,
      d: pad * 2,
      color: 0x0a0c12,
      roofColor: 0x0a0c12,
      roofUvScale: 0.02,
      uScale: 0.02,
      vScale: 0.02,
    });
    const geo = baseB.build();
    if (geo) {
      const mesh = new THREE.Mesh(geo, materials.ground);
      mesh.name = 'ground-base';
      mesh.receiveShadow = true;
      root.add(mesh);
      disposables.push(geo);
      meshCount++;
    }
  }

  const chunkGroups = [];
  for (let i = 0; i < layout.chunks.length; i++) {
    const chunk = layout.chunks[i];
    const group = new THREE.Group();
    group.name = `chunk:${chunk.key}`;

    for (const [key, b] of chunkMaps[i]) {
      const geo = b.build();
      if (!geo) continue;
      const material = materials[key];
      if (!material) {
        console.warn('[world] missing material:', key);
        geo.dispose();
        continue;
      }
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${chunk.key}:${key}`;
      mesh.castShadow = !key.startsWith('road') && !key.startsWith('marking');
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(geo);
      triangles += b.triangles;
      meshCount++;
    }

    chunk.group = group;
    chunk.meshes = group.children;
    chunkGroups.push(group);
    root.add(group);
  }
  chunkMaps.length = 0;

  // details
  const detailGroup = new THREE.Group();
  detailGroup.name = 'details';
  for (const [key, b] of detailMap) {
    const geo = b.build();
    if (!geo) continue;
    const material = materials[key];
    if (!material) continue;
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `detail:${key}`;
    mesh.castShadow = key !== 'water';
    mesh.receiveShadow = true;
    detailGroup.add(mesh);
    disposables.push(geo);
    triangles += b.triangles;
    meshCount++;
  }
  detailMap.clear();
  root.add(detailGroup);

  // cabling
  if (lines.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    geo.computeBoundingSphere();
    const cable = new THREE.LineSegments(geo, materials.cables);
    cable.name = 'cables';
    detailGroup.add(cable);
    disposables.push(geo);
    triangles += lines.length / 6;
    meshCount++;
  }

  await step(0.94, 'Planting greenery', 'instanced props and district detail');

  const instanceCount = placer.count + landmarkPlacer.count;
  const propGroup = placer.finish(materials);
  propGroup.children.forEach((m) => {
    triangles += (m.count * m.geometry.index.count) / 3;
    meshCount++;
  });
  root.add(propGroup);

  const landmarkPropGroup = landmarkPlacer.finish(materials);
  landmarkPropGroup.children.forEach((m) => {
    triangles += (m.count * m.geometry.index.count) / 3;
    meshCount++;
  });
  root.add(landmarkPropGroup);

  await step(1, 'Eidolon City ready', `${meshCount} meshes · ${Math.round(triangles).toLocaleString()} triangles`);

  const rng = createRng(layout.seed ^ 0xbeef);

  // solidity index — the player, its camera and the smoke tests query this
  colliders.build();

  return {
    root,
    layout,
    colliders,
    interactables,
    memorySites,
    cityLife,
    chunks: chunkGroups.map((g, i) => ({ ...layout.chunks[i], group: g })),
    stats: {
      meshes: meshCount,
      triangles: Math.round(triangles),
      instances: instanceCount,
      cells: layout.cells.length,
      landmarks: layout.landmarks.length,
      agents: cityLife.agents.length,
      hideSpots: cityLife.hideSpots.length,
    },
    spawnHint: layout.overview,
    seedRoll: rng.next(),
    dispose() {
      cityLife?.dispose();
      memorySites?.dispose();
      for (const g of disposables) g.dispose();
      root.traverse((o) => {
        if (o.isInstancedMesh) {
          o.geometry.dispose();
          o.dispose?.();
        }
      });
      root.clear();
    },
  };
}
