// Forest-biome village template. Other biomes (desert, arctic) will add their
// own templates here later; the registry iterates all enabled templates.

export const FOREST_TEMPLATE = {
  key: 'forest',
  biome: 'forest',
  altitudeRange: [10, 80],     // meters; village pad must sit here
  // The river gate is point-depth at the cell center (villages.js checks
  // riverDepthAtFn > 0), so no radius constant is needed here. If a future
  // template wants a wider exclusion zone, add it back as a real parameter
  // that villages.js reads.
  baseProbability: 0.12,       // tunable; with biome+altitude+river gates ~70 villages
  // padRadius scales with the village-layout BUILDING_SCALE (2.5×) so the pad
  // contains the larger buildings + their street spacing. Counts are ~3× the
  // original "small village" numbers so a village reads as a settlement, not
  // a hamlet, when flown over at altitude.
  sizeTiers: {
    // Pads shrunk for higher density — same building counts as before,
    // packed tighter so the village reads as a town instead of a sprawl.
    S: { rollMax: 0.55, buildingCount: [20, 28], padRadius: 75 },
    M: { rollMax: 0.85, buildingCount: [40, 52], padRadius: 110 },
    L: { rollMax: 1.00, buildingCount: [64, 88], padRadius: 160 },
  },
  // Palette: 3 wall creams, 3 roof rust/browns. layout picks per-village tones.
  palette: {
    walls: [[0.95, 0.89, 0.76], [0.90, 0.83, 0.66], [0.87, 0.77, 0.59]],
    roofs: [[0.61, 0.23, 0.17], [0.48, 0.18, 0.13], [0.66, 0.29, 0.21]],
    accents: [[0.42, 0.29, 0.16]], // dock + windmill timber
  },
  buildings: ['house', 'barn', 'windmill', 'church'],
};
