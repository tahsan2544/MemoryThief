import { NEON, PALETTE } from './palette.js';

/**
 * District definitions.
 *
 * Each district owns:
 *  - an identity (name, neon colour, facade style + tint)
 *  - a facade texture style used by the procedural texture generator
 *  - a building profile consumed by the lot/building generator
 *  - a prop density profile consumed by the prop placer
 *
 * Building heights are metres. `moduleW` / `floorH` drive facade UV layout so
 * windows line up with floors regardless of building height.
 */
export const DISTRICTS = {
  glassline: {
    id: 'glassline',
    name: 'Glassline',
    facadeStyle: 'glass',
    facadeTint: 0x9fbcdf,
    emissive: 0x8ad0ff,
    neon: NEON.glassline,
    fill: 0x2d6bb4,
    fillIntensity: 0.55,
    ground: 0x272e3d,
    road: 0x0d1017,
    moduleW: 3.4,
    floorH: 3.9,
    building: {
      hMin: 34,
      hMax: 118,
      tiers: [1, 3],
      setback: 0.2,
      gap: [4, 11],
      lots: [
        [1, 1],
        [2, 2],
        [2, 1],
      ],
      podium: 0.6,
      fins: true,
      balconies: 0,
      awnings: 0.1,
      signs: 0.35,
      rooftopPlant: 0.9,
    },
    props: {
      lamp: 1,
      bollard: 1,
      bench: 0.15,
      bin: 0.4,
      tree: 0.2,
      traffic: 1,
      barrier: 0.7,
      planter: 0.3,
    },
  },

  oldquarter: {
    id: 'oldquarter',
    name: 'Old Quarter',
    facadeStyle: 'brick',
    facadeTint: 0x9d8a7c,
    emissive: 0xffb066,
    neon: NEON.oldquarter,
    fill: 0xa86428,
    fillIntensity: 0.5,
    ground: 0x342a26,
    road: 0x101014,
    moduleW: 2.8,
    floorH: 3.2,
    building: {
      hMin: 9,
      hMax: 30,
      tiers: [1, 2],
      setback: 0.12,
      gap: [0.4, 2.2],
      lots: [
        [3, 3],
        [2, 3],
        [3, 2],
        [2, 2],
      ],
      podium: 0,
      fins: false,
      balconies: 0.6,
      awnings: 0.75,
      signs: 0.9,
      rooftopPlant: 0.25,
    },
    props: {
      lamp: 1.25,
      bollard: 0.2,
      bench: 0.35,
      bin: 1,
      tree: 0.15,
      traffic: 0.6,
      barrier: 0.2,
      planter: 0.35,
      stall: 0.55,
      crate: 0.7,
    },
  },

  floodworks: {
    id: 'floodworks',
    name: 'Floodworks',
    facadeStyle: 'industrial',
    facadeTint: 0x77878d,
    emissive: 0x6fe4d0,
    neon: NEON.floodworks,
    fill: 0x1f7f77,
    fillIntensity: 0.45,
    ground: 0x202a2e,
    road: 0x0b0f11,
    moduleW: 3.2,
    floorH: 3.6,
    building: {
      hMin: 8,
      hMax: 26,
      tiers: [1, 2],
      setback: 0.24,
      gap: [3, 8],
      lots: [
        [2, 2],
        [2, 1],
        [3, 2],
      ],
      podium: 0,
      fins: false,
      balconies: 0.1,
      awnings: 0.2,
      signs: 0.45,
      rooftopPlant: 0.1,
      pipes: true,
    },
    props: {
      lamp: 0.9,
      bollard: 0.6,
      bench: 0.2,
      bin: 0.4,
      tree: 0.1,
      traffic: 0.5,
      barrier: 1,
      planter: 0.1,
      crate: 1,
      valve: 0.7,
    },
  },

  verdant: {
    id: 'verdant',
    name: 'Verdant Ward',
    facadeStyle: 'garden',
    facadeTint: 0x88a07d,
    emissive: 0xffd493,
    neon: NEON.verdant,
    fill: 0x59a06a,
    fillIntensity: 0.45,
    ground: 0x263423,
    road: 0x0e1114,
    moduleW: 3.0,
    floorH: 3.4,
    building: {
      hMin: 7,
      hMax: 24,
      tiers: [1, 2],
      setback: 0.26,
      gap: [5, 13],
      lots: [
        [2, 2],
        [2, 1],
        [1, 1],
      ],
      podium: 0,
      fins: false,
      balconies: 0.5,
      awnings: 0.35,
      signs: 0.3,
      rooftopPlant: 1,
    },
    props: {
      lamp: 1,
      bollard: 0.2,
      bench: 1.2,
      bin: 0.6,
      tree: 2.6,
      traffic: 0.4,
      barrier: 0.15,
      planter: 1.4,
      crate: 0.15,
    },
  },

  underarchive: {
    id: 'underarchive',
    name: 'The Underarchive',
    facadeStyle: 'plaza',
    facadeTint: 0x6c7182,
    emissive: 0xff5566,
    neon: NEON.underarchive,
    fill: 0x8e2533,
    fillIntensity: 0.5,
    ground: 0x26262e,
    road: 0x0c0d11,
    moduleW: 3.2,
    floorH: 3.6,
    building: {
      hMin: 10,
      hMax: 16,
      tiers: [1, 1],
      setback: 0.2,
      gap: [6, 10],
      lots: [[1, 1]],
      podium: 0,
      fins: false,
      balconies: 0,
      awnings: 0,
      signs: 0.5,
      rooftopPlant: 0.4,
    },
    props: {
      lamp: 0.8,
      bollard: 1.4,
      bench: 0.3,
      bin: 0.3,
      tree: 0.4,
      traffic: 0.3,
      barrier: 1.6,
      planter: 0.4,
      crate: 0.2,
    },
  },
};

export const DISTRICT_IDS = Object.keys(DISTRICTS);

/** Facade texture variants generated per district style (see textures.js). */
export const FACADE_VARIANTS = 3;

/** Order used for the on-screen legend / viewpoint hotkeys. */
export const DISTRICT_ORDER = [
  'glassline',
  'oldquarter',
  'floodworks',
  'verdant',
  'underarchive',
];

export { NEON, PALETTE };
