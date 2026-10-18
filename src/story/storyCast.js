/**
 * StoryCast — the physical half of Phase 5 in the world.
 *
 *   - Tomas Venn: the commissioner, a bystander figure stood clear of the
 *     night-market charter (probed like the annex probes its wall, so no
 *     seed drops him inside a lamppost), with a real collider so the city
 *     walks around him.
 *   - Objective markers: small amber diamonds that hover over whatever the
 *     mission manager says to walk to next. Targets are *getters*, so a
 *     moving character (the courier) stays marked where it actually is.
 *
 * Nothing here knows what the markers mean — storyCast only paints the
 * positions missionManager hands it.
 */

import * as THREE from 'three';
import { createBystander } from '../npc/bystander.js';

const AMBER = 0xffa640;

/** Forward is +z at yaw 0 (matches the character rig). */
function faceToward(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z);
}

export function buildStoryCast({ layout, colliders, interactables, root }) {
  const base = layout.curb;
  const group = new THREE.Group();
  group.name = 'story-cast';
  root.add(group);

  const npcs = [];
  const targets = [];

  /* --------------------------- Tomas Venn -------------------------------- */

  const charter = interactables.find((it) => it.id === 'market-charter') ?? null;
  const marketCell = layout.landmarks?.find((lm) => lm.type === 'market')?.cell ?? null;
  const anchor =
    charter ??
    (marketCell ? { x: marketCell.cx, z: marketCell.z0 + 12.5, y: base } : null);

  if (anchor) {
    // candidates keep him off the trader (+2.9, +1.0) and clear of props
    const CANDIDATES = [
      [-5.6, 1.4],
      [-5.6, -2.2],
      [-7.2, 3.4],
      [6.8, 3.0],
      [7.6, -1.8],
      [-4.2, 5.4],
    ];
    let spot = null;
    for (const [dx, dz] of CANDIDATES) {
      const x = anchor.x + dx;
      const z = anchor.z + dz;
      if (Math.hypot(x - (anchor.x + 2.9), z - (anchor.z + 1.0)) < 5) continue;
      if (colliders.occupancyFree(x - 0.55, z - 0.55, x + 0.55, z + 0.55, base + 0.1, base + 2.0)) {
        spot = { x, z };
        break;
      }
    }
    if (!spot) {
      spot = { x: anchor.x - 5.6, z: anchor.z + 1.4 };
      console.warn('[story] no clear pavement for Tomas Venn — placed anyway');
    }

    const npc = createBystander({ seed: 13, coat: 0x4a4438, accent: 0x6d5b3a });
    npc.setPosition(spot.x, base, spot.z);
    npc.setYaw(faceToward(spot.x, spot.z, anchor.x, anchor.z));
    group.add(npc.group);
    npcs.push(npc);
    colliders.addCircle(spot.x, spot.z, 0.42, base, base + npc.height, 'npc');
    targets.push({
      id: 'tomas',
      kind: 'story',
      name: 'Tomas Venn',
      x: spot.x,
      y: base,
      z: spot.z,
      radius: 2.6,
      npc,
    });
  } else {
    console.warn('[story] no market anchor — Tomas Venn could not be placed');
  }

  /* ------------------------- objective markers --------------------------- */

  const markerGeo = new THREE.OctahedronGeometry(0.2, 0);
  const markerMat = new THREE.MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  /** @type {{id:string, get:Function, mesh:THREE.Mesh, last:object|null}[]} */
  let markers = [];
  const spare = [];

  const api = {
    group,
    targets,
    npcs,

    /** Replace the marker set (ids + position getters). */
    setMarkers(specs = []) {
      while (markers.length > specs.length) {
        const m = markers.pop();
        m.mesh.visible = false;
        spare.push(m.mesh);
      }
      specs.forEach((spec, i) => {
        let m = markers[i];
        if (!m) {
          const mesh = spare.pop() ?? new THREE.Mesh(markerGeo, markerMat);
          mesh.visible = false;
          group.add(mesh);
          m = { mesh, id: '', get: null, last: null };
          markers[i] = m;
        }
        m.id = spec.id;
        m.get = spec.get ?? null;
      });
      return markers.length;
    },

    /** Read-out for tests/HUD: the marker set with its last painted spot. */
    markerState() {
      return markers.map((m) => ({ id: m.id, visible: m.mesh.visible, pos: m.last }));
    },

    update(dt, t, playerPos = null) {
      for (const npc of npcs) npc.update(dt, t, playerPos);
      for (const m of markers) {
        const p = m.get ? m.get() : null;
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) {
          m.mesh.visible = false;
          continue;
        }
        m.last = { x: p.x, z: p.z };
        m.mesh.visible = true;
        m.mesh.position.set(p.x, base + 2.5 + Math.sin(t * 1.7) * 0.12, p.z);
        m.mesh.rotation.y = t * 1.1;
      }
    },

    dispose() {
      for (const npc of npcs) npc.dispose();
      group.clear();
      markerGeo.dispose();
      markerMat.dispose();
      markers.length = 0;
      spare.length = 0;
    },
  };

  return api;
}
