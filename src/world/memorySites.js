/**
 * Memory sites — where fragments are recorded, and where they come true.
 *
 * Builds (all additive to the existing city, nothing regenerated):
 *
 *   - object sources: extraction targets anchored exactly on three of the
 *     Phase 2 interactables (valve, tower directory, garden plaque);
 *   - NPC sources: bystander figures standing beside their anchors — the
 *     station attendant, the market trader, the archive warden — plus one
 *     dialogue-only figure, the Glassline night clerk;
 *   - the hidden Floodworks service annex: a small metal room stood flush
 *     against a real building face found by probing the collider list, with
 *     a barred door that opens once its memory has been reconstructed;
 *   - clue markers (floating diamonds) that light up when a fragment's
 *     consequence fires, and Resonance Sight echoes that show through walls.
 *
 * Nothing here hard-codes a world coordinate: anchors derive from the same
 * interactable records the city already placed, and the annex finds its wall
 * by probe rather than by assumption.
 */

import * as THREE from 'three';
import { createBystander } from '../npc/bystander.js';

const VIOLET = 0x9a7bff;

/* ------------------------------ materials ------------------------------ */

let SHARED = null;

function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    metal: new THREE.MeshStandardMaterial({ color: 0x232a38, roughness: 0.62, metalness: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2e3648, roughness: 0.5, metalness: 0.7 }),
    marker: new THREE.MeshBasicMaterial({
      color: VIOLET,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    echo: new THREE.MeshBasicMaterial({
      color: 0xb9a4ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // Resonance Sight sees through geometry on purpose
    }),
    coffer: new THREE.MeshStandardMaterial({
      color: 0x1a1430,
      emissive: VIOLET,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    }),
    box: new THREE.BoxGeometry(1, 1, 1),
    diamond: new THREE.OctahedronGeometry(0.17, 0),
    pillar: new THREE.BoxGeometry(0.22, 2.6, 0.22),
  };
  return SHARED;
}

function disposeShared() {
  if (!SHARED) return;
  SHARED.metal.dispose();
  SHARED.trim.dispose();
  SHARED.marker.dispose();
  SHARED.echo.dispose();
  SHARED.coffer.dispose();
  SHARED.box.dispose();
  SHARED.diamond.dispose();
  SHARED.pillar.dispose();
  SHARED = null;
}

/* -------------------------------- utils -------------------------------- */

/** Forward is +z at yaw 0 (matches the character rig). */
function faceToward(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z);
}

function box(mat, x0, y0, z0, x1, y1, z1) {
  const s = shared();
  const m = new THREE.Mesh(s.box, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.scale.set(x1 - x0, y1 - y0, z1 - z0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* ------------------------------ main builder ---------------------------- */

/**
 * @param {{layout:object, colliders:object, interactables:object[], root:THREE.Group}} ctx
 */
export function buildMemorySites({ layout, colliders, interactables, root }) {
  const s = shared();
  const base = layout.curb;
  const byId = Object.fromEntries(interactables.map((it) => [it.id, it]));

  const group = new THREE.Group();
  group.name = 'memory-sites';
  root.add(group);

  const disposables = [];
  const sources = [];
  const npcs = [];
  const markers = [];

  /* ---------------------------- NPC sources ----------------------------- */

  const NPC_SPECS = [
    {
      id: 'src-station-attendant',
      fragmentId: 'mem-station-last-look',
      name: 'Station attendant',
      anchor: 'station-board',
      dx: -2.7,
      dz: 1.4,
      seed: 3,
    },
    {
      id: 'src-market-trader',
      fragmentId: 'mem-market-bargain',
      name: 'Night market trader',
      anchor: 'market-charter',
      dx: 2.9,
      dz: 1.0,
      seed: 7,
    },
    {
      id: 'src-archive-warden',
      fragmentId: 'mem-archive-seal',
      name: 'Underarchive warden',
      anchor: 'archive-notices',
      dx: -2.9,
      dz: 1.2,
      seed: 11,
    },
    {
      id: 'src-glassline-clerk',
      fragmentId: null, // dialogue NPC only — the tower fragment's consequence
      name: 'Night clerk',
      anchor: 'tower-directory',
      dx: 3.1,
      dz: -1.2,
      seed: 5,
    },
  ];

  for (const spec of NPC_SPECS) {
    const anchor = byId[spec.anchor];
    if (!anchor) continue; // landmark absent in this layout — skip, never crash
    const x = anchor.x + spec.dx;
    const z = anchor.z + spec.dz;
    const npc = createBystander({ seed: spec.seed });
    npc.setPosition(x, base, z);
    npc.setYaw(faceToward(x, z, anchor.x, anchor.z));
    group.add(npc.group);
    npcs.push(npc);
    colliders.addCircle(x, z, 0.42, base, base + npc.height, 'npc');
    sources.push({
      id: spec.id,
      fragmentId: spec.fragmentId,
      kind: 'npc',
      name: spec.name,
      x,
      y: base,
      z,
      // people read at arm's length — deliberately shorter than the signage
      // radius so an anchor notice you are reading is never hijacked by the
      // person standing beside it
      radius: 2.6,
      npc,
    });
  }

  /* --------------------------- object sources --------------------------- */

  const OBJECT_SPECS = [
    { id: 'src-canal-valve', fragmentId: 'mem-lantern-vigil', name: 'Canal pump valve', anchor: 'canal-valve' },
    { id: 'src-tower-directory', fragmentId: 'mem-tower-elevator', name: 'Palisade Tower directory', anchor: 'tower-directory' },
    { id: 'src-garden-plaque', fragmentId: 'mem-garden-observance', name: 'Conservatory plaque', anchor: 'garden-plaque' },
  ];

  for (const spec of OBJECT_SPECS) {
    const anchor = byId[spec.anchor];
    if (!anchor) continue;
    sources.push({
      id: spec.id,
      fragmentId: spec.fragmentId,
      kind: 'object',
      name: spec.name,
      x: anchor.x,
      y: anchor.y ?? base,
      z: anchor.z,
      radius: 3.2,
      interactableId: spec.anchor,
      npc: null,
    });
  }

  /* ------------------------- hidden service annex ------------------------ */

  const door = placeServiceAnnex({ layout, colliders, base });
  if (door) group.add(door.group);

  /* ---------------------------- clue markers ----------------------------- */

  const CLUE_TARGETS = [
    { target: 'station-board' },
    { target: 'garden-plaque' },
  ];
  for (const clue of CLUE_TARGETS) {
    const it = byId[clue.target];
    if (!it) continue;
    const m = new THREE.Mesh(s.diamond, s.marker.clone());
    m.position.set(it.x, it.y + 2.45, it.z);
    m.visible = false;
    group.add(m);
    markers.push({ kind: 'clue', target: clue.target, mesh: m, phase: markers.length * 1.7 });
  }

  /* --------------------------- resonance echoes -------------------------- */

  const echoes = new THREE.Group();
  echoes.name = 'resonance-echoes';
  echoes.visible = false;
  group.add(echoes);
  const echoTargets = [
    ...sources.map((src) => ({ x: src.x, y: src.y, z: src.z })),
    ...interactables.map((it) => ({ x: it.x, y: it.y, z: it.z })),
    ...(door ? [{ x: door.x, y: base, z: door.z + 1.6 }] : []), // before the annex door
  ];
  for (const t of echoTargets) {
    const pillar = new THREE.Mesh(s.pillar, s.echo);
    pillar.position.set(t.x, t.y + 1.3, t.z);
    pillar.renderOrder = 12;
    echoes.add(pillar);
  }

  /* ------------------------------ cache card ----------------------------- */

  const cache = door
    ? {
        id: 'secret-cache',
        kind: 'note',
        x: door.x,
        y: base,
        z: door.z - 1.28, // the coffer plinth inside the annex
        radius: 2.4,
        gated: true, // main.js filters this out until the door is open
        label: 'Open the sealed coffer',
        title: 'FLOODWORKS SERVICE ANNEX — UNLISTED COFFER',
        body:
          'Ward-issue, archive-sealed, and warm. Inside: a coil sleeve stamped ' +
          'with floor 40, a red conservatory thread, and a ledger page that ' +
          'lists the attendant, the trader and the warden — paid, all three, ' +
          'on the night of the sealing.',
      }
    : null;

  /* -------------------------------- API ---------------------------------- */

  let time = 0;

  const api = {
    group,
    sources,
    npcs,
    door,
    cache,
    cage: door?.cage ?? null, // Phase 5 records cage (inside the annex)

    sourceById(id) {
      return sources.find((src) => src.id === id) ?? null;
    },
    sourceByFragment(fragmentId) {
      return sources.find((src) => src.fragmentId === fragmentId) ?? null;
    },

    /** Fire a fragment's world consequence (idempotent). */
    revealDoor(opts = {}) {
      return door ? door.open(opts) : false;
    },
    revealClue(targetId) {
      let any = false;
      for (const m of markers) {
        if (m.target === targetId && !m.mesh.visible) {
          m.mesh.visible = true;
          any = true;
        }
      }
      return any;
    },
    clueRevealed(targetId) {
      return markers.some((m) => m.target === targetId && m.mesh.visible);
    },

    /** Resonance Sight: show/hide the through-wall echo pillars. */
    setEchoes(on) {
      echoes.visible = !!on;
      return echoes.visible;
    },
    echoesOn() {
      return echoes.visible;
    },
    echoCount() {
      return echoes.children.length;
    },

    /** Door + cage + NPC + marker animation. */
    update(dt, t, playerPos) {
      time = t ?? time + dt;
      door?.update(dt);
      door?.cage?.update(dt);
      for (const npc of npcs) npc.update(dt, time, playerPos ?? null);
      for (const m of markers) {
        if (!m.mesh.visible) continue;
        m.mesh.position.y = (m.mesh.userData.baseY ??= m.mesh.position.y) + Math.sin(time * 1.6 + m.phase) * 0.12;
        m.mesh.rotation.y = time * 0.9 + m.phase;
      }
    },

    secretState() {
      return door
        ? {
            x: door.x,
            z: door.z,
            open: door.isOpen(),
            barred: !door.isOpen(),
          }
        : null;
    },

    dispose() {
      for (const npc of npcs) npc.dispose();
      group.clear();
      for (const m of markers) m.mesh.material.dispose();
      if (door) door.dispose();
      disposeShared();
      for (const g of disposables) g.dispose();
    },
  };

  return api;
}

/* ----------------------------- the annex -------------------------------- */

/**
 * Find a flat building face on the Floodworks canal bank and stand the
 * service annex against it, reaching out over the walkway toward the canal.
 *
 * The canal-bank cell row ends at `z1` (the slab edge meets the canal bank);
 * its buildings are inset ~3 m, so their south-facing wall sits at about
 * `z1 - 3.25` and the walkway runs between wall and edge. The probe walks
 * *north* (into the block) from near the slab edge, and the annex extends
 * *south* from the face it finds. Tries several positions along the walkway
 * so a lamppost or tree never decides where the secret goes; falls back to a
 * freestanding spot near the valve if no wall cooperates.
 */
function placeServiceAnnex({ layout, colliders, base }) {
  const canal = layout.canal;
  const valveX = canal.bridges.length >= 2 ? (canal.bridges[0] + canal.bridges[1]) / 2 : (canal.x0 + canal.x1) / 2;

  // the cell row hugging the north bank of the canal, column nearest the valve
  const iz = canal.zLine - 1;
  let cell = null;
  if (iz >= 0) {
    for (const off of [0, 1, -1, 2, -2]) {
      const ix = Math.min(layout.grid - 1, Math.max(0, layout.splitX + off));
      const c = layout.cells[iz * layout.grid + ix];
      if (c && !c.landmark && c.district === 'floodworks') {
        cell = c;
        break;
      }
    }
  }

  const W = 1.3; // annex half-width in x
  const D = 2.0; // annex depth in z (back wall to door face)
  const H = 2.5; // wall height

  let placed = null;
  if (cell) {
    for (let k = -4; k <= 4 && !placed; k++) {
      const x = valveX + k * 3.2;
      if (x < cell.x0 + W + 1 || x > cell.x1 - W - 1) continue;
      // walk north from just inside the slab edge: the first tall flat face
      // at head height is the building line
      const face = colliders.findFlatFace(x, cell.z1 - 0.6, -1, base, { maxDist: 5 });
      if (!face) continue;
      const zBack = face.z; // building face (north side of the annex)
      // the annex footprint AND the door-front lane must be clear of props —
      // the lane is the last ~1.25 m of walkway before the canal parapet
      if (!colliders.occupancyFree(x - W, zBack - 0.25, x + W, zBack + D + 0.25, base + 0.1, base + H)) continue;
      if (!colliders.occupancyFree(x - W - 0.4, zBack + D + 0.2, x + W + 0.4, cell.z1 + 0.2, base + 0.1, base + H)) continue;
      placed = { x, z: zBack, wall: true };
    }
  }
  if (!placed) {
    // honest fallback: freestanding on the canal-bank walkway, no wall behind
    placed = { x: valveX, z: (cell ? cell.z1 - 3.25 : canal.z - layout.halfRoad - 3.25), wall: false };
  }

  return buildAnnex(placed, { colliders, base, W, D, H });
}

/**
 * Build the annex. The building (or open walkway) is to the NORTH (smaller
 * z); the door faces SOUTH toward the canal, and the player walks -z to
 * enter.
 */
function buildAnnex({ x, z, wall }, { colliders, base, W, D, H }) {
  const s = shared();
  const group = new THREE.Group();
  group.name = 'service-annex';
  const zf = z + D; // front (door) face, toward the canal
  const z0 = zf; // front wall band start

  // ---- shell -------------------------------------------------------------
  group.add(box(s.metal, x - W, base, z - 0.18, x + W, base + H, z)); // back (against the building)
  group.add(box(s.metal, x - W, base, z, x - W + 0.16, base + H, zf)); // left
  group.add(box(s.metal, x + W - 0.16, base, z, x + W, base + H, zf)); // right
  group.add(box(s.metal, x - W, base + H, z - 0.1, x + W, base + H + 0.16, zf + 0.1)); // roof
  group.add(box(s.trim, x - W, base, z0, x - 0.72, base + H, z0 + 0.16)); // front-left flank
  group.add(box(s.trim, x + 0.72, base, z0, x + W, base + H, z0 + 0.16)); // front-right flank

  // solid shell colliders (the doorway gap is the door's own collider)
  colliders.addBox(x - W, z - 0.18, x + W, z, base, base + H + 0.2, 'annex'); // back
  colliders.addBox(x - W, z, x - W + 0.16, zf, base, base + H, 'annex'); // left wall
  colliders.addBox(x + W - 0.16, z, x + W, zf, base, base + H, 'annex'); // right wall
  colliders.addBox(x - W, z0, x - 0.72, z0 + 0.16, base, base + H, 'annex'); // front-left flank
  colliders.addBox(x + 0.72, z0, x + W, z0 + 0.16, base, base + H, 'annex'); // front-right flank

  // ---- the barred door ---------------------------------------------------
  const seamMat = new THREE.MeshBasicMaterial({
    color: VIOLET,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const seam = new THREE.Mesh(s.box, seamMat);
  seam.position.set(x, base + 1.18, z0 + 0.08);
  seam.scale.set(1.62, 2.42, 0.05);
  group.add(seam);

  const panelMat = new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.55, metalness: 0.6, transparent: true });
  const panel = new THREE.Mesh(s.box, panelMat);
  panel.position.set(x, base + 1.15, z0 + 0.11);
  panel.scale.set(1.44, 2.3, 0.08);
  panel.castShadow = true;
  group.add(panel);

  const doorCollider = colliders.addBox(x - 0.75, z0 - 0.1, x + 0.75, z0 + 0.3, base, base + 2.4, 'secret-door');

  // ---- the cache inside --------------------------------------------------
  group.add(box(s.trim, x - 0.3, base, z + 0.42, x + 0.3, base + 0.52, z + 1.02)); // plinth
  const coffer = new THREE.Mesh(s.box, s.coffer);
  coffer.position.set(x, base + 0.72, z + 0.72);
  coffer.scale.set(0.34, 0.4, 0.24);
  group.add(coffer);
  const cacheLight = new THREE.PointLight(VIOLET, 0, 9, 1.8);
  cacheLight.position.set(x, base + 1.4, z + 0.95);
  group.add(cacheLight);

  // ---- records cage (Phase 5's locked location) --------------------------
  // Back-left compartment of the annex: barred by a gate that only Mira's
  // key (a mission reward) drops. Additive geometry — the coffer, the door
  // and every Phase 3 check that walks this room keep their exact world.
  const cage = buildRecordsCage({ x, z, W, base, colliders, group });

  // ---- floating locator diamond (lights up with the seam) ----------------
  const diamond = new THREE.Mesh(s.diamond, s.marker.clone());
  diamond.position.set(x, base + 3.5, zf + 0.9);
  diamond.visible = false;
  group.add(diamond);

  if (!wall) {
    // fallback placement gets no building behind it — close the back visually
    group.add(box(s.metal, x - W, base, z - 0.2, x + W, base + H, z));
  }

  /* ------------------------------ state ---------------------------------- */

  let opening = false;
  let openT = 0;
  let isOpenFlag = false;
  const SINK = 2.5;
  const OPEN_SECONDS = 1.2;

  const door = {
    group,
    x,
    z: zf, // the door plane (front face, toward the canal)
    wallPlaced: wall,
    cage, // Phase 5's locked compartment, inside the same room

    /** Passable as soon as the bar drops — the panel may still be sinking. */
    isOpen() {
      return isOpenFlag || opening;
    },
    isOpening() {
      return opening;
    },
    /** Begin the unlock; the collider drops immediately so the path is live. */
    open({ instant = false } = {}) {
      if (isOpenFlag || opening) return false;
      opening = true;
      colliders.disable(doorCollider);
      seamMat.opacity = 0.85;
      diamond.visible = true;
      if (instant) {
        openT = OPEN_SECONDS;
        panel.visible = false;
        panelMat.opacity = 0;
        cacheLight.intensity = 7;
        opening = false;
        isOpenFlag = true;
      }
      return true;
    },

    update(dt) {
      if (!opening) return;
      openT = Math.min(OPEN_SECONDS, openT + dt);
      const k = openT / OPEN_SECONDS;
      const eased = 1 - (1 - k) * (1 - k);
      panel.position.y = base + 1.15 - eased * SINK;
      panelMat.opacity = 1 - k;
      cacheLight.intensity = 7 * k;
      diamond.position.y = base + 3.5 + Math.sin(performance.now() / 400) * 0.12;
      if (openT >= OPEN_SECONDS) {
        opening = false;
        isOpenFlag = true;
        panel.visible = false;
      }
    },

    dispose() {
      seamMat.dispose();
      panelMat.dispose();
      diamond.material.dispose();
      cage.dispose();
      group.clear();
    },
  };
  return door;
}

/* --------------------------- the records cage ---------------------------- */

/**
 * Phase 5's locked location: a barred compartment in the annex's back-left
 * corner. The gate collider drops only when the mission's key turns (main.js
 * owns the condition), and the work box behind it becomes readable then too.
 *
 * Interact points are chosen so the cage and the Phase 3 coffer never fight
 * for the prompt: the lock sits at the gate's south corner (front of the
 * room), the box sits inside the cage, and the coffer keeps the centre.
 */
function buildRecordsCage({ x, z, W, base, colliders, group }) {
  const s = shared();
  const cx0 = x - W + 0.16; // inner face of the annex's left wall
  const cx1 = x - 0.5; // gate plane (opening faces east, into the room)
  const cz0 = z + 0.15; // off the annex back wall
  const cz1 = z + 1.25; // south face, with its doorway-blocking wall
  const Hc = 1.9;

  // south wall + top rail close the compartment; west/back are annex walls
  group.add(box(s.metal, cx0, base, cz1, cx1, base + Hc, cz1 + 0.1));
  group.add(box(s.trim, cx0, base + Hc, cz0, cx1, base + Hc + 0.12, cz1 + 0.12));

  // the gate: a solid panel that sinks like the annex door does
  const gateMat = new THREE.MeshStandardMaterial({
    color: 0x141a28,
    roughness: 0.5,
    metalness: 0.7,
    transparent: true,
  });
  const gate = new THREE.Mesh(s.box, gateMat);
  gate.position.set(cx1, base + Hc / 2, (cz0 + cz1) / 2);
  gate.scale.set(0.08, Hc, cz1 - cz0);
  gate.castShadow = true;
  group.add(gate);

  // lock seam: violet while it holds, gone once the key turns
  const seamMat = new THREE.MeshBasicMaterial({
    color: VIOLET,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const seam = new THREE.Mesh(s.box, seamMat);
  seam.position.set(cx1 + 0.05, base + 1.0, (cz0 + cz1) / 2);
  seam.scale.set(0.02, 1.5, 0.5);
  group.add(seam);

  // Mira's work box on a low bracket inside the cage
  group.add(box(s.trim, cx0 + 0.18, base, cz0 + 0.28, cx0 + 0.74, base + 0.4, cz0 + 0.78));
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x1a1430,
    emissive: VIOLET,
    emissiveIntensity: 0.35,
    roughness: 0.45,
  });
  const workBox = new THREE.Mesh(s.box, boxMat);
  workBox.position.set(cx0 + 0.46, base + 0.53, cz0 + 0.53);
  workBox.scale.set(0.4, 0.26, 0.3);
  workBox.castShadow = true;
  group.add(workBox);

  // solids: the gate (togglable) and the south wall (permanent)
  const gateCollider = colliders.addBox(cx1 - 0.05, cz0, cx1 + 0.05, cz1, base, base + Hc, 'records-cage');
  colliders.addBox(cx0, cz1, cx1, cz1 + 0.1, base, base + Hc, 'records-cage');

  let open = false;
  let opening = false;
  let openT = 0;
  const SINK = Hc + 0.5;
  const OPEN_SECONDS = 1.0;

  const cage = {
    x: cx1,
    z: cz1,
    isOpen() {
      return open || opening;
    },
    open({ instant = false } = {}) {
      if (open || opening) return false;
      opening = true;
      colliders.disable(gateCollider);
      if (instant) {
        openT = OPEN_SECONDS;
        gate.position.y = base + Hc / 2 - SINK;
        gateMat.opacity = 0;
        gate.visible = false;
        seamMat.opacity = 0;
        opening = false;
        open = true;
      }
      return true;
    },

    update(dt) {
      if (!opening) return;
      openT = Math.min(OPEN_SECONDS, openT + dt);
      const k = openT / OPEN_SECONDS;
      const eased = 1 - (1 - k) * (1 - k);
      gate.position.y = base + Hc / 2 - eased * SINK;
      gateMat.opacity = 1 - k;
      seamMat.opacity = 0.4 * (1 - k);
      if (openT >= OPEN_SECONDS) {
        opening = false;
        open = true;
        gate.visible = false;
      }
    },

    /** Prompt/read-out records; main.js decides when they enter the world. */
    interact: {
      id: 'records-cage',
      kind: 'door',
      x: cx1,
      y: base,
      z: cz1,
      radius: 1.4,
      label: 'Open the records cage',
      title: 'FLOODWORKS ANNEX — RECORDS CAGE',
      body:
        'Barred shutters, ward-sealed, and warm to the touch. The lock takes ' +
        'a key, not a glove.',
    },
    workBox: {
      id: 'mira-workbox',
      kind: 'note',
      x: cx0 + 0.46,
      y: base,
      z: cz0 + 0.53,
      radius: 1.4,
      label: 'Open Mira’s work box',
      title: 'RECORDS CAGE — MIRA’S WORK BOX',
      body: 'The box Tomas described. It opens on the key you are already holding.',
    },

    dispose() {
      gateMat.dispose();
      seamMat.dispose();
      boxMat.dispose();
    },
  };
  return cage;
}

/* ----------------------------- proximity -------------------------------- */

/** Same rules as nearestInteractable: horizontal distance + a height gate. */
export function nearestSource(sources, x, y, z) {
  let best = null;
  let bestD = Infinity;
  for (const src of sources) {
    const dx = x - src.x;
    const dy = y + 0.9 - (src.y + 0.9);
    const dz = z - src.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > src.radius) continue;
    if (Math.abs(dy) > 3.5) continue;
    if (d < bestD) {
      bestD = d;
      best = src;
    }
  }
  return best;
}
