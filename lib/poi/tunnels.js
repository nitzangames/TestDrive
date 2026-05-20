// Tunnel registry — experimental POI type. Each tunnel is a covered passage
// (left wall + right wall + ceiling, open at both ends) running along its
// `angle` bearing for `length` metres at altitude `groundY`.
//
// Phase 1: a small fixed set of test tunnels near spawn so the geometry can
// be visually verified. Procedural placement on mountainous cells comes in
// a later phase along with heightfield carving.
//
// Tunnel record:
//   { id, x, z, groundY, angle, length, halfWidth, height, padRadius }
//     x, z       — tunnel centre (the middle of the passage)
//     groundY    — altitude of the tunnel floor (== floor of the geometry)
//     angle      — yaw (radians) the tunnel points along (rotation around +Y)
//     length     — outer length along the tunnel's local Z axis
//     halfWidth  — outer half-width perpendicular to angle (for collision/cull)
//     height     — outer height (wall + ceiling)
//     padRadius  — terrain-flattening radius used by phase 2 carving

export function buildTunnelRegistry({ terrainHeightFn }) {
  const all = [];

  // Three fixed test tunnels arranged in a triangle around spawn. Far enough
  // out that the player can climb to them comfortably (≈ 800 m radius),
  // close enough to find quickly during iteration.
  const positions = [
    { x:  800, z:    0, angle: 0 },
    { x: -800, z:    0, angle: Math.PI / 2 },
    { x:    0, z: -800, angle: Math.PI / 4 },
  ];

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    // Sit the tunnel on the natural terrain at its anchor. Phase 2 will
    // carve the ground flat across the tunnel's corridor so the floor lines
    // up with the natural altitude on both approaches.
    const groundY = terrainHeightFn ? terrainHeightFn(p.x, p.z) : 0;
    all.push({
      id: `tun:${i}`,
      x: p.x, z: p.z, groundY,
      angle: p.angle,
      length: 200, halfWidth: 19, height: 29,
      // Approach corridor: chunk-build flattens the heightfield along the
      // tunnel axis for `length/2 + approachLength` in each direction, so
      // the pilot always has a clear runway in and out regardless of
      // whatever natural mountain happens to sit beyond the tunnel mouth.
      approachLength: 300,
      // Conservative cull horizon used by chunk-build for terrain flattening.
      // Worst-case diagonal: sqrt((halfLen + approach + axFalloff)² +
      // (halfWid + radFalloff)²) ≈ sqrt(460² + 99²) ≈ 471. Round to 500.
      padRadius: 500,
    });
  }

  function inChunk(cx, cz, chunkSize = 512) {
    const x0 = cx * chunkSize, x1 = x0 + chunkSize;
    const z0 = cz * chunkSize, z1 = z0 + chunkSize;
    return all.filter(t => t.x >= x0 && t.x < x1 && t.z >= z0 && t.z < z1);
  }

  // Generous AABB — tunnels are 200 m long so their footprint can spill into
  // a neighbour chunk even when the anchor sits in this one. The pad radius
  // is the conservative cull horizon used by chunk-build for flattening.
  function affectingChunk(cx, cz, chunkSize = 512) {
    const x0 = cx * chunkSize, x1 = x0 + chunkSize;
    const z0 = cz * chunkSize, z1 = z0 + chunkSize;
    return all.filter(t => (
      t.x + t.padRadius >= x0 && t.x - t.padRadius < x1 &&
      t.z + t.padRadius >= z0 && t.z - t.padRadius < z1
    ));
  }

  return { all, inChunk, affectingChunk };
}
