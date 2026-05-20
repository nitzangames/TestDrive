// Desert-biome village template. Same structure as the forest template,
// different palette + slightly looser sampling (desert is flat → more cells
// pass the altitude gate, so we lower baseProbability to keep total count
// comparable).

export const DESERT_TEMPLATE = {
  key: 'desert',
  biome: 'desert',
  altitudeRange: [5, 60],        // desert has heightScale 0.35, so even
                                 // moderate peaks are only ~50 m tall
  baseProbability: 0.07,
  sizeTiers: {
    S: { rollMax: 0.55, buildingCount: [20, 28], padRadius: 75 },
    M: { rollMax: 0.85, buildingCount: [40, 52], padRadius: 110 },
    L: { rollMax: 1.00, buildingCount: [64, 88], padRadius: 160 },
  },
  // Sandstone palette: warm cream/tan walls, baked-clay roofs.
  palette: {
    walls: [[0.92, 0.78, 0.55], [0.88, 0.72, 0.48], [0.84, 0.66, 0.42]],
    roofs: [[0.62, 0.38, 0.22], [0.55, 0.30, 0.18], [0.48, 0.26, 0.14]],
    accents: [[0.40, 0.25, 0.12]],
  },
  buildings: ['house', 'barn', 'windmill', 'church'],
};
