// Arctic-biome village template. arctic biome has heightScale 1.5 — jagged
// peaks reach ~700 m. Villages need a wider altitude band so the gate can
// catch plateau / valley spots, otherwise no eligible cells exist.

export const ARCTIC_TEMPLATE = {
  key: 'arctic',
  biome: 'arctic',
  altitudeRange: [40, 250],
  baseProbability: 0.18,         // arctic eligible cells are rarer, bump roll
  sizeTiers: {
    S: { rollMax: 0.65, buildingCount: [16, 24], padRadius: 65 },
    M: { rollMax: 0.92, buildingCount: [32, 40], padRadius: 95 },
    L: { rollMax: 1.00, buildingCount: [48, 64], padRadius: 135 },
  },
  // Snow-bleached palette: pale walls (whitewashed log / stone), dark blue-
  // slate roofs (snow-covered, in shadow) and dark accents.
  palette: {
    walls: [[0.92, 0.92, 0.88], [0.86, 0.86, 0.84], [0.80, 0.82, 0.86]],
    roofs: [[0.18, 0.22, 0.32], [0.22, 0.26, 0.36], [0.14, 0.18, 0.26]],
    accents: [[0.20, 0.16, 0.14]],
  },
  buildings: ['house', 'barn', 'windmill', 'church'],
};
