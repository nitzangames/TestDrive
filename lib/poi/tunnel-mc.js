// Build a marching-cubes mesh for a single tunnel: a "mountain mass"
// containing the tunnel with the passage carved out as a clean arch.
// Density field is sampled in the tunnel's *local* frame (so the grid
// hugs the tunnel without wasted volume), then the mesh is rotated and
// translated into world space.
//
// Density formulation:
//   mountainSDF(p) = (terrainHeight(p.xz) + bump * gauss(p)) - p.y
//     positive below the artificially-raised mountain top, negative above.
//     Bump is a separable gaussian around the tunnel anchor — at the
//     volume's boundary it fades to 0, so the MC surface reduces to the
//     natural heightfield and seams cleanly with the surrounding terrain.
//   archSDF(p) = capped-cylinder-with-flat-walls SDF in tunnel-local
//     positive inside the tunnel's interior (passage cross-section is a
//     vertical-walled arch: rectangular below ARCH_WALL_H, half-circle
//     above), negative outside.
//   density = min(mountainSDF, -archSDF)
//     iso-surface at density=0 = mountain top OR tunnel wall, whichever
//     binds first. Carves the passage through the mountain mass.

import { marchingCubes } from '../terrain/marching-cubes.js';

const VOXEL_SIZE        = 3.0;   // metres — coarser = faster + blockier
const TUNNEL_RADIUS     = 16;    // arch half-width / radius
const ARCH_WALL_H       = 10;    // vertical wall height; half-circle above
const MOUNTAIN_BUMP     = 70;    // peak height above natural terrain
const MOUNTAIN_SIGMA_R  = 60;    // perpendicular spread (m)
const MOUNTAIN_SIGMA_A  = 110;   // along-axis spread (m)
const PADDING_RADIAL    = 80;    // m of extra grid each side of corridor
const PADDING_AXIAL     = 80;    // m of extra grid past tunnel mouths
const FLOOR_Y_OFFSET    = -6;    // start density grid this far below floor

export function buildTunnelMCMesh(THREE, T, terrainHeightFn) {
  const halfWidLocal = T.halfWidth + PADDING_RADIAL;
  const halfLenLocal = T.length / 2 + PADDING_AXIAL;
  const heightAbove  = MOUNTAIN_BUMP + 20;     // headroom above mountain peak
  const ny = Math.ceil((heightAbove - FLOOR_Y_OFFSET) / VOXEL_SIZE) + 1;
  const nx = Math.ceil(2 * halfWidLocal  / VOXEL_SIZE) + 1;
  const nz = Math.ceil(2 * halfLenLocal  / VOXEL_SIZE) + 1;

  const c = Math.cos(T.angle), s = Math.sin(T.angle);

  // terrainHeight LUT — one entry per (i, k) tunnel-local XZ cell. Pre-rotated
  // into world coords so the inner Y loop never has to re-evaluate the noise
  // octaves (~150ms saved per tunnel at 3 m voxels).
  const heightLut = new Float32Array(nx * nz);
  for (let k = 0; k < nz; k++) {
    const lz = -halfLenLocal + k * VOXEL_SIZE;
    for (let i = 0; i < nx; i++) {
      const lx = -halfWidLocal + i * VOXEL_SIZE;
      const wx = T.x + lx * c + lz * s;
      const wz = T.z - lx * s + lz * c;
      heightLut[i + k * nx] = terrainHeightFn(wx, wz);
    }
  }

  const density = new Float32Array(nx * ny * nz);
  const sigmaR2 = MOUNTAIN_SIGMA_R * MOUNTAIN_SIGMA_R;
  const sigmaA2 = MOUNTAIN_SIGMA_A * MOUNTAIN_SIGMA_A;
  const halfLen = T.length / 2;

  for (let k = 0; k < nz; k++) {
    const lz   = -halfLenLocal + k * VOXEL_SIZE;
    const lzAbs = Math.abs(lz);
    const inAxial = lzAbs <= halfLen;
    const bumpA = Math.exp(-(lz * lz) / sigmaA2);
    for (let i = 0; i < nx; i++) {
      const lx = -halfWidLocal + i * VOXEL_SIZE;
      const bumpR = Math.exp(-(lx * lx) / sigmaR2);
      const bump  = MOUNTAIN_BUMP * bumpR * bumpA;
      const mountainTopWorldY = heightLut[i + k * nx] + bump;
      for (let j = 0; j < ny; j++) {
        const ly       = FLOOR_Y_OFFSET + j * VOXEL_SIZE;   // tunnel-local, relative to floor
        const worldY   = T.groundY + ly;
        const mountainD = mountainTopWorldY - worldY;

        // Arch SDF: capsule-on-its-side cross-section. Below the floor we
        // return very negative (no carving there); above the floor and
        // within axial bounds the SDF is positive inside the arch volume.
        let archD = -1e6;
        if (inAxial && ly >= 0) {
          if (ly < ARCH_WALL_H) {
            archD = TUNNEL_RADIUS - Math.abs(lx);
          } else {
            const dy = ly - ARCH_WALL_H;
            archD = TUNNEL_RADIUS - Math.sqrt(lx * lx + dy * dy);
          }
        }

        density[i + j * nx + k * nx * ny] = Math.min(mountainD, -archD);
      }
    }
  }

  const t0 = performance.now();
  const out = marchingCubes({
    densityField: density,
    nx, ny, nz,
    voxelSize: VOXEL_SIZE,
    origin: [-halfWidLocal, FLOOR_Y_OFFSET, -halfLenLocal],
    isolevel: 0,
  });
  const mcMs = performance.now() - t0;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(out.positions, 3));
  geom.setAttribute('normal',   new THREE.BufferAttribute(out.normals, 3));
  geom.setIndex(new THREE.BufferAttribute(out.indices, 1));

  // Tunnel-local → world: rotate yaw by T.angle, translate to (T.x, T.groundY, T.z).
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, T.angle, 0));
  m.compose(new THREE.Vector3(T.x, T.groundY, T.z), q, new THREE.Vector3(1, 1, 1));
  geom.applyMatrix4(m);

  console.log(`[tunnel-mc] ${T.id}: ${nx}x${ny}x${nz} voxels, ${(out.positions.length / 3) | 0} verts, MC ${mcMs.toFixed(0)}ms`);
  return geom;
}
