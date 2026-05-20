import { hash3 } from './hash.js';
import { FOREST_TEMPLATE } from './templates/forest.js';
import { DESERT_TEMPLATE } from './templates/desert.js';
import { ARCTIC_TEMPLATE } from './templates/arctic.js';
import { CASTLE_TEMPLATE } from './templates/castle.js';
import { MONASTERY_TEMPLATE } from './templates/monastery.js';
import { TOWN_TEMPLATE } from './templates/town.js';
import { layoutVillage } from './village-layout.js';

export const WORLD_SIZE = 64000;
export const CELL_SIZE  = 1000;           // 64x64 anchor grid over 64 km world
export const GRID_N     = WORLD_SIZE / CELL_SIZE;

// Each template gets an INDEPENDENT roll per cell (salted with its key) so
// adding a rare overlay template (town, monastery) doesn't reduce the rate
// of dense ones (forest/desert/arctic) that overlap its biome+altitude band.
// Order in this array only matters as a tiebreaker for cells where two
// templates both roll into acceptance — rarer types are listed first so they
// "win" the tie and a special POI doesn't get stomped by a generic village.
const TEMPLATES = [
  MONASTERY_TEMPLATE,
  CASTLE_TEMPLATE,
  TOWN_TEMPLATE,
  FOREST_TEMPLATE,
  DESERT_TEMPLATE,
  ARCTIC_TEMPLATE,
];

// Per-template salt — XOR'd into the world seed to give each template its own
// independent placement hash. Values are arbitrary 32-bit constants; just need
// to differ per template so the rolls aren't correlated.
const TEMPLATE_SALT = {
  forest:    0x1F015E57,
  desert:    0x1DE5E27F,
  arctic:    0x1A1C71C0,
  castle:    0x1CA57133,
  monastery: 0x1110A57E,
  town:      0x17074A40,
};
// Keyed lookup so layout can fetch the template by village.templateKey
// without an array search.
const TEMPLATES_BY_KEY = Object.fromEntries(TEMPLATES.map(t => [t.key, t]));
export function getTemplate(key) { return TEMPLATES_BY_KEY[key]; }

// Map size roll → tier using template thresholds. Templates may omit some
// tiers (castles have only S, towns have only L) — fall through in declared
// order until we find one that exists.
function pickSizeTier(template, roll) {
  const t = template.sizeTiers;
  if (t.S && roll < t.S.rollMax) return { tier: 'S', cfg: t.S };
  if (t.M && roll < t.M.rollMax) return { tier: 'M', cfg: t.M };
  if (t.L) return { tier: 'L', cfg: t.L };
  if (t.M) return { tier: 'M', cfg: t.M };
  return { tier: 'S', cfg: t.S };
}

// True if this template's biome+altitude rules accept this cell. A template
// may declare `biome` (single string) OR `biomes` (array) — castles and
// monasteries use the array form to live in multiple biomes.
function templateAcceptsCell(t, biomeKey, altitude) {
  const biomeOK = t.biomes ? t.biomes.includes(biomeKey) : (t.biome === biomeKey);
  if (!biomeOK) return false;
  if (altitude < t.altitudeRange[0] || altitude > t.altitudeRange[1]) return false;
  return true;
}

// Pick a template for this cell using independent per-template rolls. Each
// template gets its own hash; the first one (in TEMPLATES order, which lists
// rare overlays before generic villages) whose roll falls under its
// baseProbability wins. Returns null if no template accepts.
function pickTemplate(i, j, seed, biomeKey, altitude) {
  for (const t of TEMPLATES) {
    if (!templateAcceptsCell(t, biomeKey, altitude)) continue;
    const roll = hash3(i, j, seed ^ TEMPLATE_SALT[t.key]);
    if (roll < t.baseProbability) return t;
  }
  return null;
}

// Build the global village registry. Sync, ~ms.
//
// opts:
//   seed              world seed (uint32)
//   biomeAt(x, z)     → { key } per the game's biome module
//   terrainHeightFn(x, z) → number, natural elevation at (x, z) given seed
//   riverDepthAtFn(x, z)  → number, > 0 if (x, z) is inside a river/lake carve at width 1
export function buildVillageRegistry({ seed, biomeAt, terrainHeightFn, riverDepthAtFn }) {
  const all = [];
  let id = 0;
  const half = WORLD_SIZE / 2;
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      // Cell center in world coords
      const x = -half + (i + 0.5) * CELL_SIZE;
      const z = -half + (j + 0.5) * CELL_SIZE;
      const altitude = terrainHeightFn(x, z);
      const biome = biomeAt(x, z);
      // Real biome objects use `name`; test fixtures use `key`. Accept either.
      const biomeKey = biome.name || biome.key;
      if (riverDepthAtFn(x, z) > 0) continue;
      const template = pickTemplate(i, j, seed, biomeKey, altitude);
      if (!template) continue;
      const sizeRoll = hash3(i, j, seed ^ 0xC0FFEE);
      const { tier, cfg } = pickSizeTier(template, sizeRoll);
      const paletteSeed = hash3(i, j, seed ^ 0xBEEFFACE);
      const v = {
        id: id++,
        x, z,
        groundY: altitude,
        sizeTier: tier,
        padRadius: cfg.padRadius,
        falloffRadius: cfg.padRadius + 50,
        paletteSeed,
        templateKey: template.key,
      };
      // Pre-compute layout once so collision tests can query buildings every
      // frame without re-running procedural placement. Same instances the
      // chunk-build pipeline emits (deterministic per paletteSeed). The
      // layout returns sidecar fields for runway (villages) or markerTarget
      // (castles) used downstream.
      const layout = layoutVillage(v);
      v.buildings = layout;
      v.runway = layout.runway || null;
      v.markerTarget = layout.markerTarget || null;
      all.push(v);
    }
  }

  // chunkSize default matches the existing CHUNK_SIZE in chunk-manager (512).
  function inChunk(cx, cz, chunkSize = 512) {
    const x0 = cx * chunkSize, x1 = x0 + chunkSize;
    const z0 = cz * chunkSize, z1 = z0 + chunkSize;
    return all.filter(v => v.x >= x0 && v.x < x1 && v.z >= z0 && v.z < z1);
  }

  function affectingChunk(cx, cz, chunkSize = 512) {
    const x0 = cx * chunkSize, x1 = x0 + chunkSize;
    const z0 = cz * chunkSize, z1 = z0 + chunkSize;
    return all.filter(v => (
      v.x + v.falloffRadius >= x0 && v.x - v.falloffRadius < x1 &&
      v.z + v.falloffRadius >= z0 && v.z - v.falloffRadius < z1
    ));
  }

  return { all, inChunk, affectingChunk };
}
