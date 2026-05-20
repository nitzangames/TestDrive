// Deterministic uint32 hash → [0, 1). Used by placement, size tier, and palette
// rolls — three independent hashes per anchor cell, all seeded by the world seed.
export function hash3(a, b, s) {
  // Math.imul keeps multiplies in the int32 domain — without it, large
  // coordinates (a or b ~ 10⁵) overflow into doubles and weaken the mix.
  let h = Math.imul(a | 0, 73856093);
  h = (h ^ Math.imul(b | 0, 19349663)) >>> 0;
  h = (h ^ (s | 0)) >>> 0;
  // Avalanche
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0x100000000;
}
