import { CELL_SIZE, CURB_HEIGHT, ROAD_WIDTH } from '../config/settings.js';
import { mixSeeds } from '../core/rng.js';

/**
 * City layout — the deterministic skeleton of Eidolon City.
 *
 * The city is a single continuous grid of `grid x grid` cells (100 m each)
 * with roads centred on the cell boundaries, so every district is connected by
 * the same street network and can be walked/fown straight into the next one.
 *
 * Districts are large rectangular regions of that one grid — they are *not*
 * separate scenes. Landmarks occupy whole cells; one road corridor is flooded
 * into a canal in Floodworks.
 */

export const LANDMARK_TYPES = ['tower', 'market', 'station', 'garden', 'archive'];

export function createLayout({ seed, grid }) {
  const cell = CELL_SIZE;
  const road = ROAD_WIDTH;
  const origin = (-grid * cell) / 2;
  const extent = grid * cell;
  const halfRoad = road / 2;

  // --- district region split (fractions so it scales with world size) -----
  const splitX = Math.max(2, Math.floor(grid * 0.5));
  const glassZ = Math.max(1, Math.round(grid * 0.33));
  const oqZ = Math.max(2, Math.round(grid * 0.58));

  function districtOf(ix, iz) {
    if (ix < splitX) return iz < oqZ ? 'oldquarter' : 'verdant';
    return iz < glassZ ? 'glassline' : 'floodworks';
  }

  // --- landmark cells ----------------------------------------------------
  const landmarkCells = {
    tower: { ix: Math.floor(grid * 0.66), iz: Math.floor(grid * 0.12) },
    market: { ix: Math.floor(grid * 0.2), iz: Math.floor(grid * 0.3) },
    station: { ix: Math.floor(grid * 0.75), iz: Math.floor(grid * 0.66) },
    garden: { ix: Math.floor(grid * 0.2), iz: Math.floor(grid * 0.8) },
    archive: {
      ix: Math.min(splitX - 1, Math.floor(grid * 0.5)),
      iz: Math.min(oqZ - 1, Math.floor(grid * 0.5)),
    },
  };
  // clamp into range and keep every landmark on a distinct cell
  const used = new Set();
  for (const [type, c] of Object.entries(landmarkCells)) {
    c.ix = Math.min(grid - 1, Math.max(0, c.ix));
    c.iz = Math.min(grid - 1, Math.max(0, c.iz));
    while (used.has(`${c.ix},${c.iz}`)) {
      c.ix = (c.ix + 1) % grid;
      c.iz = (c.iz + 1) % grid;
    }
    used.add(`${c.ix},${c.iz}`);
    c.type = type;
  }

  // --- cells -------------------------------------------------------------
  const cells = new Array(grid * grid);
  for (let iz = 0; iz < grid; iz++) {
    for (let ix = 0; ix < grid; ix++) {
      const x0 = origin + ix * cell + halfRoad;
      const z0 = origin + iz * cell + halfRoad;
      const district = districtOf(ix, iz);
      const cellSeed = mixSeeds(seed, ix, iz);
      cells[iz * grid + ix] = {
        ix,
        iz,
        index: iz * grid + ix,
        x0,
        z0,
        x1: x0 + cell - road,
        z1: z0 + cell - road,
        cx: x0 + (cell - road) / 2,
        cz: z0 + (cell - road) / 2,
        district,
        landmark: null,
        seed: cellSeed,
        tall: 1,
        flooded: false,
        props: {},
      };
    }
  }

  for (const c of Object.values(landmarkCells)) {
    const target = cells[c.iz * grid + c.ix];
    target.landmark = c.type;
    if (c.type === 'archive') target.district = 'underarchive';
  }

  // --- district centroids + per-cell height profile ----------------------
  const districtCells = {};
  for (const cd of cells) (districtCells[cd.district] ??= []).push(cd);
  const districtInfo = {};
  for (const [id, list] of Object.entries(districtCells)) {
    let sx = 0;
    let sz = 0;
    for (const c of list) {
      sx += c.ix;
      sz += c.iz;
    }
    const core = landmarkCells[Object.keys(landmarkCells).find((k) => list.some((c) => c.landmark === k))] ?? null;
    districtInfo[id] = {
      id,
      cells: list,
      count: list.length,
      coreIx: core ? core.ix : sx / list.length,
      coreIz: core ? core.iz : sz / list.length,
      ix0: Math.min(...list.map((c) => c.ix)),
      ix1: Math.max(...list.map((c) => c.ix)),
      iz0: Math.min(...list.map((c) => c.iz)),
      iz1: Math.max(...list.map((c) => c.iz)),
    };
    const d = districtInfo[id];
    d.radius = Math.max(1, Math.hypot(d.ix1 - d.ix0, d.iz1 - d.iz0) / 2);
  }

  for (const cd of cells) {
    const info = districtInfo[cd.district];
    const dist = Math.hypot(cd.ix - info.coreIx, cd.iz - info.coreIz);
    const center = 1 - Math.min(1, dist / info.radius);
    // taper heights towards district borders so the skyline reads as regions
    let edge = 3;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cd.ix + dx;
        const nz = cd.iz + dz;
        if (nx < 0 || nz < 0 || nx >= grid || nz >= grid) continue;
        if (cells[nz * grid + nx].district !== cd.district) edge = Math.min(edge, Math.hypot(dx, dz));
      }
    }
    const edgeK = 0.7 + 0.3 * Math.min(1, edge / 2);
    cd.tall = (0.45 + 0.55 * center) * edgeK;
  }

  // --- canal (Floodworks) -------------------------------------------------
  const canalZLine = Math.max(2, Math.round(grid * 0.7));
  const canal = {
    z: origin + canalZLine * cell,
    zLine: canalZLine,
    width: road,
    depth: 1.9,
    x0: origin + splitX * cell - halfRoad,
    x1: origin + grid * cell,
    bridges: [],
  };
  for (let ix = splitX; ix < grid; ix++) {
    canal.bridges.push(origin + ix * cell);
  }

  // --- flooded blocks -----------------------------------------------------
  for (const cd of cells) {
    if (cd.district !== 'floodworks' || cd.landmark) continue;
    const r = hash01(seed, cd.ix, cd.iz, 91);
    if (r < 0.16) cd.flooded = true;
    // do not flood the two rows hugging the canal — they are the canal bank
    if (Math.abs(cd.iz - canalZLine) <= 1) cd.flooded = false;
  }

  // --- road surfaces ------------------------------------------------------
  const roadQuads = [];
  const markingQuads = [];

  for (let iz = 0; iz <= grid; iz++) {
    const lineZ = origin + iz * cell;
    const aboveRow = Math.max(0, iz - 1);
    for (let ix = 0; ix < grid; ix++) {
      // a canal replaces this corridor in the Floodworks columns
      if (iz === canal.zLine && ix >= splitX) continue;
      const ref = iz < grid ? cells[iz * grid + ix] : cells[aboveRow * grid + ix];
      roadQuads.push({
        x0: origin + ix * cell,
        z0: lineZ - halfRoad,
        x1: origin + (ix + 1) * cell,
        z1: lineZ + halfRoad,
        district: ref.district,
        horizontal: true,
      });
    }
    // lane dashes along this corridor
    for (let ix = 0; ix < grid; ix++) {
      if (iz === canal.zLine && ix >= splitX) continue;
      const ref = cells[Math.min(iz, grid - 1) * grid + ix];
      const startX = origin + ix * cell + 6;
      const endX = origin + (ix + 1) * cell - 6;
      for (let x = startX; x + 4 <= endX; x += 11) {
        markingQuads.push({ x0: x, z0: lineZ - 0.2, x1: x + 4, z1: lineZ + 0.2, district: ref.district });
      }
    }
  }

  for (let ix = 0; ix <= grid; ix++) {
    const lineX = origin + ix * cell;
    for (let iz = 0; iz < grid; iz++) {
      const z0 = origin + iz * cell + halfRoad;
      const z1 = origin + (iz + 1) * cell - halfRoad;
      if (z1 <= z0) continue;
      const ref = ix < grid ? cells[iz * grid + ix] : cells[iz * grid + grid - 1];
      roadQuads.push({
        x0: lineX - halfRoad,
        z0,
        x1: lineX + halfRoad,
        z1,
        district: ref.district,
        horizontal: false,
      });
      const startX = z0 + 6;
      const endZ = z1 - 6;
      for (let z = startX; z + 4 <= endZ; z += 11) {
        markingQuads.push({ x0: lineX - 0.2, z0: z, x1: lineX + 0.2, z1: z + 4, district: ref.district });
      }
    }
  }

  // zebra crossings at a subset of intersections
  for (let iz = 1; iz < grid; iz++) {
    for (let ix = 1; ix < grid; ix++) {
      if ((ix * 3 + iz * 5) % 4 !== 0) continue;
      if (iz === canal.zLine && ix >= splitX) continue;
      const lineX = origin + ix * cell;
      const lineZ = origin + iz * cell;
      const ref = cells[iz * grid + ix];
      for (let k = 0; k < 6; k++) {
        const bx = lineX - halfRoad + 1.6 + k * 2.2;
        markingQuads.push({ x0: bx, z0: lineZ + halfRoad + 1.2, x1: bx + 1.2, z1: lineZ + halfRoad + 5.4, district: ref.district });
        markingQuads.push({ x0: bx, z0: lineZ - halfRoad - 5.4, x1: bx + 1.2, z1: lineZ - halfRoad - 1.2, district: ref.district });
      }
    }
  }

  // --- chunks (2x2 cells each) -------------------------------------------
  const chunkSize = 2;
  const chunksPerAxis = Math.ceil(grid / chunkSize);
  const chunks = [];
  for (let cz = 0; cz < chunksPerAxis; cz++) {
    for (let cx = 0; cx < chunksPerAxis; cx++) {
      const chunkCells = [];
      for (let dz = 0; dz < chunkSize; dz++) {
        for (let dx = 0; dx < chunkSize; dx++) {
          const ix = cx * chunkSize + dx;
          const iz = cz * chunkSize + dz;
          if (ix < grid && iz < grid) chunkCells.push(cells[iz * grid + ix]);
        }
      }
      if (!chunkCells.length) continue;
      const x0 = Math.min(...chunkCells.map((c) => c.x0)) - halfRoad;
      const z0 = Math.min(...chunkCells.map((c) => c.z0)) - halfRoad;
      const x1 = Math.max(...chunkCells.map((c) => c.x1)) + halfRoad;
      const z1 = Math.max(...chunkCells.map((c) => c.z1)) + halfRoad;
      chunks.push({
        cx,
        cz,
        key: `${cx}_${cz}`,
        cells: chunkCells,
        x0,
        z0,
        x1,
        z1,
        cxCenter: (x0 + x1) / 2,
        czCenter: (z0 + z1) / 2,
        group: null,
        meshes: [],
      });
    }
  }

  const landmarks = Object.values(landmarkCells).map((c) => ({
    type: c.type,
    ix: c.ix,
    iz: c.iz,
    cell: cells[c.iz * grid + c.ix],
    x: cells[c.iz * grid + c.ix].cx,
    z: cells[c.iz * grid + c.ix].cz,
  }));

  // --- camera viewpoints for the inspection tool --------------------------
  // Framing per landmark: high enough to see over the neighbouring blocks,
  // close enough that the landmark actually fills the frame.
  const LM_VIEW = {
    tower: { dx: 180, dz: 200, h: 240, lookY: 85 },
    // the market square is framed by taller strips on its east/west sides, so
    // approach from the open south edge across the stage
    market: { dx: 26, dz: 178, h: 118, lookY: 4 },
    station: { dx: 90, dz: 100, h: 122, lookY: -6 },
    garden: { dx: 88, dz: 100, h: 126, lookY: 8 },
    archive: { dx: 92, dz: 104, h: 132, lookY: -4 },
  };
  const viewpoints = [];
  for (const lm of landmarks) {
    const v = LM_VIEW[lm.type] ?? { dx: 100, dz: 110, h: 120, lookY: 8 };
    viewpoints.push({
      type: lm.type,
      pos: [lm.x + v.dx, v.h, lm.z + v.dz],
      look: [lm.x, v.lookY, lm.z],
    });
  }
  viewpoints.sort((a, b) => LANDMARK_TYPES.indexOf(a.type) - LANDMARK_TYPES.indexOf(b.type));
  const overview = {
    type: 'overview',
    pos: [extent * 0.24, extent * 0.28, extent * 0.34],
    look: [0, 24, 0],
  };

  function districtAt(x, z) {
    const ix = Math.floor((x - origin) / cell);
    const iz = Math.floor((z - origin) / cell);
    // A non-finite position (NaN camera) must not take the whole frame down.
    if (!Number.isFinite(ix) || !Number.isFinite(iz)) {
      warnBadPosition(x, z);
      return 'outskirts';
    }
    if (ix < 0 || iz < 0 || ix >= grid || iz >= grid) return 'outskirts';
    return cells[iz * grid + ix]?.district ?? 'outskirts';
  }

  function cellAt(x, z) {
    const ix = Math.floor((x - origin) / cell);
    const iz = Math.floor((z - origin) / cell);
    if (ix < 0 || iz < 0 || ix >= grid || iz >= grid) return null;
    return cells[iz * grid + ix];
  }

  return {
    seed,
    grid,
    cell,
    road,
    halfRoad,
    curb: CURB_HEIGHT,
    origin,
    extent,
    splitX,
    cells,
    districtInfo,
    canal,
    roadQuads,
    markingQuads,
    chunks,
    landmarks,
    viewpoints,
    overview,
    districtAt,
    cellAt,
    chunkOf: (ix, iz) => chunks[Math.floor(iz / 2) * chunksPerAxis + Math.floor(ix / 2)] ?? null,
  };
}

function hash01(seed, ix, iz, salt) {
  const h = mixSeeds(seed, ix, iz, salt);
  return (h % 100000) / 100000;
}

let _warnedBadPosition = false;
function warnBadPosition(x, z) {
  if (_warnedBadPosition) return;
  _warnedBadPosition = true;
  console.warn(`[layout] non-finite world position: (${x}, ${z}) — camera state is invalid`);
}
