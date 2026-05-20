// Town — larger and rarer than a village. Always has a town hall (church
// geometry with bell tower) at the centre, plus dozens of houses around it.
// Uses the existing village layout's L-tier code path (church + barn +
// windmill + many houses), just with bigger numbers and a slightly warmer
// stone-tinted palette to distinguish it visually from forest villages.

export const TOWN_TEMPLATE = {
  key: 'town',
  biome: 'forest',
  altitudeRange: [10, 50],
  baseProbability: 0.012,        // very rare — a handful per world
  sizeTiers: {
    // Single tier (always 'L' code path). Bigger building count + pad than
    // the largest forest village.
    L: { rollMax: 1.00, buildingCount: [100, 140], padRadius: 220 },
  },
  palette: {
    walls:   [[0.88, 0.80, 0.66], [0.84, 0.74, 0.58], [0.80, 0.68, 0.52]],
    roofs:   [[0.66, 0.28, 0.18], [0.56, 0.22, 0.14], [0.48, 0.20, 0.12]],
    accents: [[0.30, 0.18, 0.10]],
  },
  buildings: ['house', 'barn', 'windmill', 'church'],
};
