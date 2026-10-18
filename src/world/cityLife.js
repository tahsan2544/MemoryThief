/**
 * Phase 4 — living city: population, patrol routes, cover and restricted zones.
 *
 * This module stands a *small* cast on the road network rather than a crowd:
 * twelve agents (civilians, two market vendors, three security guards and one
 * investigation target), each walking a pre-validated route of waypoints.
 * Routes are road-corridor geometry — intersections on the 100 m grid with a
 * small inset so nobody walks through a building — and every candidate is
 * probed against the real collider world and rejected if a single sample
 * would be inside solid geometry, inside a restricted zone, on the canal, or
 * close enough to an interactable/memory source to hijack its prompt.
 *
 * The rest of the Phase 4 surface lives here too:
 *   - hide spots  — crate cover with a defined "out of sight" volume
 *   - restricted  — the sealed Underarchive square + the canal service lane,
 *                   each with honest visible ground markers
 *   - disturbances — extraction/resonance/restricted-entry events radiating
 *                   from the player, gated by cover and line of sight
 *   - alerting    — guards telling guards, civilians tipping guards off
 *
 * Performance posture: ≤12 agents, six shared meshes each, perception ~6 Hz
 * per agent on the wall clock. If the population ever grows, the seam to
 * push on is the rig (instancing) — not the simulation.
 */

import * as THREE from 'three';
import { NpcAgent, AGENT_TYPES, clearLine } from '../npc/agent.js';
import { createRng } from '../core/rng.js';
import { MeshBuilder } from '../utils/geo.js';

const KEEP_OUT = 7; // metres: routes stay clear of interactables + sources
const HIDE_RADIUS = 2.3;

const DISTURBANCES = {
  extraction: { radius: 12, strength: 0.6 },
  resonance: { radius: 12, strength: 0.5 },
  restricted: { radius: 11, strength: 0.45 },
  default: { radius: 12, strength: 0.5 },
};

export function buildCityLife({ layout, colliders, interactables, memorySites, placer, root, seed = 1 }) {
  const rng = createRng(seed); // createRng hashes strings, so any seed shape works
  const group = new THREE.Group();
  group.name = 'city-life';
  root.add(group);

  /* ---------------------------- keep-out list --------------------------- */

  const keepOut = [];
  for (const it of interactables ?? []) keepOut.push({ x: it.x, z: it.z });
  for (const s of memorySites?.sources ?? []) keepOut.push({ x: s.x, z: s.z });

  /* ------------------------------- zones -------------------------------- */

  const zones = [];
  const archiveCell = layout.landmarks.find((l) => l.type === 'archive')?.cell ?? null;
  if (archiveCell) {
    zones.push({
      id: 'underarchive',
      label: 'the sealed Underarchive square',
      x0: archiveCell.x0,
      z0: archiveCell.z0,
      x1: archiveCell.x1,
      z1: archiveCell.z1,
    });
  }
  const secret = memorySites?.secretState?.() ?? null;
  if (secret) {
    zones.push({
      id: 'canal-lane',
      label: 'the canal service lane',
      x0: secret.x - 4.5,
      z0: secret.z - 3,
      x1: secret.x + 4.5,
      z1: secret.z + 3.5,
    });
  }

  function zoneAt(x, z) {
    for (const zn of zones) {
      if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
    }
    return null;
  }

  /* ---------------------------- zone markers ---------------------------- */

  const disposables = [];
  const zoneB = new MeshBuilder();
  const zoneColor = 0xc2412f;

  function strip(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y = colliders.groundAt(cx, cz, 0.4);
    zoneB.box({ x: cx, y: y + 0.015, z: cz, w: Math.abs(x1 - x0) + 0.4, h: 0.05, d: Math.abs(z1 - z0) + 0.4, color: zoneColor });
  }

  if (archiveCell) {
    // a warning line just off each slab edge — the plaza itself stays walkable
    strip(archiveCell.x0, archiveCell.z0 - 0.6, archiveCell.x1, archiveCell.z0 - 0.6);
    strip(archiveCell.x0, archiveCell.z1 + 0.6, archiveCell.x1, archiveCell.z1 + 0.6);
    strip(archiveCell.x0 - 0.6, archiveCell.z0, archiveCell.x0 - 0.6, archiveCell.z1);
    strip(archiveCell.x1 + 0.6, archiveCell.z0, archiveCell.x1 + 0.6, archiveCell.z1);
  }
  if (secret) {
    strip(secret.x - 4.5, secret.z + 3.2, secret.x + 4.5, secret.z + 3.2);
    // bollards flank the lane; the walking line down to the door stays clear
    for (const dx of [-3.2, 3.2]) {
      if (!colliders.hits(secret.x + dx, 0.2, secret.z + 0.9, 0.4)) {
        placer?.add('bollard', secret.x + dx, colliders.groundAt(secret.x + dx, secret.z + 0.9, 0.4), secret.z + 0.9, 0, 1, 0x9a4a3a);
      }
    }
  }
  {
    const geo = zoneB.build();
    if (geo) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x8c3226,
        emissive: 0x40100c,
        roughness: 0.85,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'zone-markers';
      group.add(mesh);
      disposables.push(geo, mat);
    }
  }

  /* ----------------------------- hide spots ----------------------------- */

  const hideSpots = [];
  {
    const cells = layout.cells
      .filter((c) => !c.landmark && !c.flooded && c.district !== 'underarchive')
      .slice();
    // deterministic shuffle so the spots spread across the city
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    for (const c of cells) {
      if (hideSpots.length >= 6) break;
      // four candidate nooks on the pavement ring around the block
      const cands = [
        { x: c.x0 + 1.7, z: c.z0 + 12 },
        { x: c.x1 - 1.7, z: c.z0 + 12 },
        { x: c.x0 + 12, z: c.z0 + 1.7 },
        { x: c.x1 - 12, z: c.z1 - 1.7 },
      ];
      for (const cand of cands) {
        if (zoneAt(cand.x, cand.z)) continue;
        if (colliders.hits(cand.x, 0.2, cand.z, 1.8)) continue;
        if (!farFromKeepOut(cand.x, cand.z, KEEP_OUT)) continue;
        if (Math.abs(cand.z - layout.canal.z) < layout.halfRoad + 2 && cand.x >= layout.canal.x0) continue;
        const base = colliders.groundAt(cand.x, cand.z, 0.4);
        const r1 = rng.range(0, Math.PI * 2);
        // a small junk pile: three crates and a stacked fourth — visible,
        // solid, and tall enough to read as something you can duck behind
        placer?.add('crate', cand.x, base, cand.z, r1, 1.05, 0x8a6f4c);
        placer?.add('crate', cand.x + 1.15, base, cand.z + 0.45, r1 + 0.7, 0.95, 0xa08156);
        placer?.add('crate', cand.x + 0.4, base, cand.z + 1.2, r1 + 1.9, 1.0, 0x746048);
        placer?.add('crate', cand.x + 0.55, base + 1.02, cand.z + 0.6, r1 + 2.6, 0.8, 0x95764e);
        if (hideSpots.length % 2 === 0) placer?.add('planter', cand.x - 1.5, base, cand.z - 0.8, r1, 1, 0x5f6a72);
        hideSpots.push({ id: `hide-${hideSpots.length}`, x: cand.x, z: cand.z, r: HIDE_RADIUS });
        break;
      }
    }
  }

  function inCover(x, z) {
    for (const s of hideSpots) {
      if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) return true;
    }
    return false;
  }

  function spawnClear(p) {
    for (const a of agents) {
      if (Math.hypot(a.x - p.x, a.z - p.z) < 8) return false;
    }
    return true;
  }

  function farFromKeepOut(x, z, radius) {
    const r2 = radius * radius;
    for (const k of keepOut) {
      if ((x - k.x) ** 2 + (z - k.z) ** 2 < r2) return false;
    }
    return true;
  }

  /* ------------------------------- routes ------------------------------- */

  const lineX = (ix) => layout.origin + ix * layout.cell;
  const lineZ = (iz) => layout.origin + iz * layout.cell;

  /** No point of a route may stand in the canal water band (bridges aside). */
  function inCanalBand(x, z) {
    return x >= layout.canal.x0 - 0.5 && Math.abs(z - layout.canal.z) < layout.halfRoad + 0.5;
  }

  /** Probe a polyline: solid-free samples, keep-out respected, no canal. */
  function routeFree(points, loop) {
    for (const p of points) {
      if (colliders.hits(p.x, 0.2, p.z, 0.45)) return false;
      if (!farFromKeepOut(p.x, p.z, KEEP_OUT)) return false;
      if (zoneAt(p.x, p.z)) return false;
      if (inCanalBand(p.x, p.z)) return false;
    }
    const segs = loop ? points.length : points.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(2, Math.ceil(len / 3));
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (colliders.hits(x, 0.2, z, 0.45)) return false;
        if (!farFromKeepOut(x, z, KEEP_OUT)) return false;
        if (zoneAt(x, z)) return false;
        if (inCanalBand(x, z)) return false;
      }
    }
    return true;
  }

  /** Closed rectangular loop on the road grid, inset from the intersections. */
  function rectRoute(districtId) {
    const info = layout.districtInfo[districtId];
    if (!info) return null;
    const ins = 4;
    const span = (a, b) => rng.int(0, Math.max(0, b - a - 1));
    const lx0 = Math.max(1, Math.min(info.ix0 + span(info.ix0, info.ix1 + 1), layout.grid - 3));
    const iz0 = Math.max(1, Math.min(info.iz0 + span(info.iz0, info.iz1 + 1), layout.grid - 3));
    const w = rng.chance(0.5) ? 1 : 2;
    const h = rng.chance(0.5) ? 1 : 2;
    const lx1 = Math.min(layout.grid - 1, lx0 + w);
    const iz1 = Math.min(layout.grid - 1, iz0 + h);
    const pts = [
      { x: lineX(lx0) + ins, z: lineZ(iz0) + ins },
      { x: lineX(lx1) - ins, z: lineZ(iz0) + ins },
      { x: lineX(lx1) - ins, z: lineZ(iz1) - ins },
      { x: lineX(lx0) + ins, z: lineZ(iz1) - ins },
    ];
    if (!routeFree(pts, true)) return null;
    // two of the four corners get a stand-and-look pause
    const pauses = new Set(rng.chance(0.5) ? [0, 2] : [1, 3]);
    pts.forEach((p, i) => {
      if (pauses.has(i)) p.pause = 3 + rng.next() * 3;
    });
    return { points: pts, loop: true };
  }

  /** Straight out-and-back patrol along one road, both ends pause. */
  function straightRoute(districtId) {
    const info = layout.districtInfo[districtId];
    if (!info) return null;
    const horizontal = rng.chance(0.5);
    let pts;
    if (horizontal) {
      const iz = Math.max(1, Math.min(info.iz0 + rng.int(0, Math.max(0, info.iz1 - info.iz0 + 1)), layout.grid - 1));
      const ixA = Math.max(1, Math.min(info.ix0 + rng.int(0, Math.max(0, info.ix1 - info.ix0 - 1)), layout.grid - 3));
      const z = lineZ(iz) + (rng.chance(0.5) ? 3 : -3);
      pts = [
        { x: lineX(ixA) + 5, z, pause: 3 },
        { x: lineX(ixA + 2) - 5, z, pause: 3 + rng.next() * 3 },
      ];
    } else {
      const ix = Math.max(1, Math.min(info.ix0 + rng.int(0, Math.max(0, info.ix1 - info.ix0 + 1)), layout.grid - 1));
      const izA = Math.max(1, Math.min(info.iz0 + rng.int(0, Math.max(0, info.iz1 - info.iz0 - 1)), layout.grid - 3));
      const x = lineX(ix) + (rng.chance(0.5) ? 3 : -3);
      pts = [
        { x, z: lineZ(izA) + 5, pause: 3 },
        { x, z: lineZ(izA + 2) - 5, pause: 3 + rng.next() * 3 },
      ];
    }
    if (!routeFree(pts, false)) return null;
    return { points: pts, loop: false };
  }

  /** Ring around one landmark cell (vendors at the market, courier at the tower). */
  function ringRoute(cell, ins = 4) {
    if (!cell) return null;
    const lx0 = cell.ix;
    const lx1 = Math.min(layout.grid - 1, cell.ix + 1);
    const iz0 = cell.iz;
    const iz1 = Math.min(layout.grid - 1, cell.iz + 1);
    const pts = [
      { x: lineX(lx0) + ins, z: lineZ(iz0) + ins },
      { x: lineX(lx1) - ins, z: lineZ(iz0) + ins },
      { x: lineX(lx1) - ins, z: lineZ(iz1) - ins },
      { x: lineX(lx0) + ins, z: lineZ(iz1) - ins },
    ];
    if (!routeFree(pts, true)) return null;
    const pauses = new Set([1, 3]);
    pts.forEach((p, i) => {
      if (pauses.has(i)) p.pause = 4 + rng.next() * 3;
    });
    return { points: pts, loop: true };
  }

  /** The two hand-placed beats: beside the archive plaza, along the station bank. */
  function archiveNorthRoute() {
    if (!archiveCell) return null;
    const z = archiveCell.z0 - 2; // on the road that skirts the plaza's north edge
    const pts = [
      { x: archiveCell.cx - 45, z, pause: 4 },
      { x: archiveCell.cx + 45, z, pause: 4 },
    ];
    if (!routeFree(pts, false)) return null;
    return { points: pts, loop: false };
  }

  function stationBankRoute() {
    const stationCell = layout.landmarks.find((l) => l.type === 'station')?.cell ?? null;
    if (!stationCell) return null;
    const z = stationCell.z1 - 1.6; // pavement between the station face and the canal
    const pts = [
      { x: stationCell.cx - 40, z, pause: 4 },
      { x: stationCell.cx + 40, z, pause: 4 },
    ];
    if (!routeFree(pts, false)) return null;
    return { points: pts, loop: false };
  }

  /* ------------------------------ population ---------------------------- */

  const marketCell = layout.landmarks.find((l) => l.type === 'market')?.cell ?? null;
  const towerCell = layout.landmarks.find((l) => l.type === 'tower')?.cell ?? null;

  const AGENT_SPECS = [
    { type: 'guard', name: 'Security guard', seed: 21, pref: () => archiveNorthRoute(), district: 'oldquarter' },
    { type: 'guard', name: 'Security guard', seed: 27, pref: () => stationBankRoute(), district: 'floodworks' },
    { type: 'guard', name: 'Security guard', seed: 33, pref: () => ringRoute(marketCell), district: 'oldquarter' },
    { type: 'civilian', name: 'Passer-by', seed: 41, district: 'oldquarter' },
    { type: 'civilian', name: 'Passer-by', seed: 43, district: 'oldquarter' },
    { type: 'civilian', name: 'Passer-by', seed: 47, district: 'verdant' },
    { type: 'civilian', name: 'Passer-by', seed: 53, district: 'glassline' },
    { type: 'civilian', name: 'Passer-by', seed: 59, district: 'floodworks' },
    { type: 'civilian', name: 'Dock hand', seed: 61, district: 'floodworks' },
    { type: 'vendor', name: 'Market vendor', seed: 67, pref: () => ringRoute(marketCell), district: 'oldquarter' },
    { type: 'vendor', name: 'Market vendor', seed: 71, pref: () => ringRoute(marketCell), district: 'oldquarter' },
    { type: 'target', name: 'Palisade courier', seed: 79, pref: () => ringRoute(towerCell), district: 'glassline' },
  ];

  const agents = [];
  for (const spec of AGENT_SPECS) {
    let route = null;
    try {
      route = spec.pref?.() ?? null;
    } catch {
      route = null;
    }
    for (let i = 0; i < 3 && !route; i++) {
      route = rng.chance(0.5) ? rectRoute(spec.district) : straightRoute(spec.district);
      if (!route) route = rng.chance(0.5) ? straightRoute(spec.district) : rectRoute(spec.district);
    }
    if (!route) continue; // honest shortfall: fewer agents, never a broken one

    // never start two agents on the same street corner: rotate the round
    // until the spawn point is clear of everyone already out there
    if (!spawnClear(route.points[0])) {
      for (let k = 1; k < route.points.length; k++) {
        if (!spawnClear(route.points[k])) continue;
        route = { points: [...route.points.slice(k), ...route.points.slice(0, k)], loop: route.loop };
        break;
      }
    }

    const agent = new NpcAgent({
      id: `agent-${spec.type}-${spec.seed}`,
      type: spec.type,
      name: spec.name,
      seed: spec.seed,
      route,
      colliders,
    });
    group.add(agent.rig.group);
    agents.push(agent);
  }

  /* ------------------------------ alerting ------------------------------ */

  /**
   * A detection is news: guards told directly walk over and look, while a
   * civilian's tip only raises the recipient's suspicion (unless it tips the
   * meter past full). The `mode !== 'investigate'` gate makes the cascade
   * finite — nobody alerts anybody twice.
   */
  function alertGuards(source, pos, boost = 0.65, direct = false) {
    const now = performance.now();
    for (const g of agents) {
      if (g === source || g.type !== 'guard') continue;
      const d = Math.hypot(g.x - source.x, g.z - source.z);
      if (d > 18) continue;
      if (!clearLine(colliders, source.x, source.z, g.x, g.z)) continue;
      g.awareness = Math.min(1, Math.max(g.awareness, boost));
      g.lastKnown = { x: pos.x, z: pos.z };
      if ((direct || g.awareness >= 1) && g.mode !== 'investigate') {
        g.beginInvestigate(now);
        g.onDetect?.(g, g.lastKnown);
      }
    }
  }

  for (const a of agents) {
    a.onDetect = (src, pos) => alertGuards(src, pos, 0.65, true);
    a.onWitness = (src, pos) => alertGuards(src, pos, 0.35, true);
  }

  /* ------------------------------ disturbances -------------------------- */

  function emitDisturbance(evt) {
    let n = 0;
    const now = performance.now();
    for (const a of agents) n += a.onDisturbance(evt, now);
    return n;
  }

  /**
   * The one entry point the game uses: a conspicuous act by the player at
   * (px, pz). Cover silences it entirely; a restricted zone amplifies it.
   * `opts.noiseScale` damps the extraction discharge (Phase 6 upgrade).
   */
  function emitFrom(label, px, pz, opts = {}) {
    if (inCover(px, pz)) return 0;
    const zone = zoneAt(px, pz);
    const cfg = DISTURBANCES[label] ?? DISTURBANCES.default;
    const amplify = zone && label === 'extraction';
    const scale = label === 'extraction' ? Math.max(0, opts.noiseScale ?? 1) : 1;
    return emitDisturbance({
      x: px,
      z: pz,
      radius: (amplify ? 17 : cfg.radius) * scale,
      strength: amplify ? 0.95 : cfg.strength,
      label,
    });
  }

  /* --------------------------------- api -------------------------------- */

  // fixed-city heartbeat: 10 Hz of wall time, catch-up capped at 8 steps so a
  // long stall cannot spiral the simulation. The cap also keeps batch sizes
  // small enough that the HUD can still show SUSPICIOUS before DETECTED
  // (one 0.8 s batch cannot carry awareness from 0 past both thresholds).
  const TICK_MS = 100;
  const MAX_STEPS = 8;
  let lastWall = performance.now();
  let accMs = 0;
  let simTime = 0;

  return {
    agents,
    hideSpots,
    zones,

    zoneAt,
    inCover,

    /** @returns {number} how many agents the act reached */
    emitDisturbance,
    emitFrom,

    nearestAgent(x, z, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const a of agents) {
        const d = Math.hypot(a.x - x, a.z - z);
        if (d <= bestD) {
          bestD = d;
          best = a;
        }
      }
      return best;
    },

    profiles() {
      return agents.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        awareness: a.awareness,
        mode: a.mode,
        visible: a.visible,
        x: a.x,
        z: a.z,
      }));
    },

    /**
     * The city runs on its OWN wall-clock heartbeat: fixed 100 ms ticks that
     * catch up to real time, independent of the render frame rate. A crawling
     * renderer (headless SwiftShader) or a stall must not blind the agents or
     * slow their patrols — eyes and footsteps keep steady time either way.
     * Catch-up is capped so a long hitch cannot spiral.
     *
     * @param {number} dt simulation seconds (render frame — unused: see above)
     * @param {number} t elapsed simulation seconds (render frame — unused)
     * @param {{x:number,y:number,z:number}} playerPos
     * @param {{cover:boolean, sprinting:boolean, extracting:boolean,
     *          ability:boolean, zone:object|null}} ctx
     */
    update(dt, t, playerPos, ctx) {
      const now = performance.now();
      accMs += now - lastWall;
      lastWall = now;
      const pctx = {
        x: playerPos.x,
        z: playerPos.z,
        cover: !!ctx.cover,
        sprinting: !!ctx.sprinting,
        extracting: !!ctx.extracting,
        ability: !!ctx.ability,
        zone: ctx.zone ?? null,
        suspicious: !!ctx.sprinting || !!ctx.extracting || !!ctx.ability || !!ctx.zone,
      };
      let steps = 0;
      while (accMs >= TICK_MS && steps < MAX_STEPS) {
        accMs -= TICK_MS;
        steps++;
        simTime += TICK_MS / 1000;
        const wdt = TICK_MS / 1000;
        for (const a of agents) a.update(wdt, simTime, playerPos, pctx, wdt, now);
      }
      if (accMs > TICK_MS * MAX_STEPS) accMs = TICK_MS * MAX_STEPS;
    },

    relocate(id, x, z, faceX, faceZ) {
      const a = agents.find((ag) => ag.id === id);
      if (!a) return false;
      a.relocate(x, z, faceX, faceZ);
      return true;
    },

    forcePause(id, seconds = 0.15) {
      const a = agents.find((ag) => ag.id === id);
      if (!a) return false;
      a.forcePause(seconds);
      return true;
    },

    stats() {
      const types = {};
      for (const a of agents) types[a.type] = (types[a.type] ?? 0) + 1;
      return {
        agents: agents.length,
        types,
        hideSpots: hideSpots.length,
        zones: zones.map((z) => z.id),
        view: Object.fromEntries(Object.entries(AGENT_TYPES).map(([k, v]) => [k, v.viewRadius])),
      };
    },

    dispose() {
      for (const a of agents) a.dispose();
      group.clear();
      for (const d of disposables) d.dispose?.();
    },
  };
}
