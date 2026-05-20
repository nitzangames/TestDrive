// Registry mapping scatterKey → geometry builder. Called once at boot to
// produce a built-geometry-per-key registry that chunks pick from.

import { buildConiferGeometry } from '../terrain/trees.js';
import { buildCactusGeometry }   from './cactus.js';
import { buildIceSpikeGeometry } from './icespike.js';
import { buildVentGeometry }     from './vent.js';
import { buildMapleGeometry }    from './maple.js';

export function buildScatterRegistry(THREE) {
  return {
    conifer:  buildConiferGeometry(THREE),
    cactus:   buildCactusGeometry(THREE),
    icespike: buildIceSpikeGeometry(THREE),
    vent:     buildVentGeometry(THREE),
    maple:    buildMapleGeometry(THREE),
  };
}
