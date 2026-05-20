// Per-building BufferGeometry builders. Each returns a geometry with:
//   - position   (Float32, vec3)
//   - normal     (Float32, vec3, explicit per-face)
//   - colorRole  (Float32, scalar — 0 = wall, 1 = roof)
//
// The material uses two per-instance attributes (aWallColor / aRoofColor)
// and the vertex shader picks via colorRole.

function pushQuad(verts, normals, roles, a, b, c, d, n, role) {
  // Two triangles a-b-c and a-c-d (assumes CCW from outside).
  verts.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 6; i++) { normals.push(...n); roles.push(role); }
}

function pushTri(verts, normals, roles, a, b, c, n, role) {
  verts.push(...a, ...b, ...c);
  for (let i = 0; i < 3; i++) { normals.push(...n); roles.push(role); }
}

// Box with walls (role=0) — top is replaced by roof in the building primitives,
// so we omit the +Y face. Caller draws the roof on top.
function pushWallsNoTop(verts, normals, roles, w, h, d, cx, cy, cz) {
  const x0 = cx - w/2, x1 = cx + w/2;
  const y0 = cy, y1 = cy + h;
  const z0 = cz - d/2, z1 = cz + d/2;
  const role = 0;
  // -Y face (bottom)
  pushQuad(verts, normals, roles,
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0,-1,0], role);
  // +X face
  pushQuad(verts, normals, roles,
    [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1,0,0], role);
  // -X face
  pushQuad(verts, normals, roles,
    [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1,0,0], role);
  // +Z face
  pushQuad(verts, normals, roles,
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0,0,1], role);
  // -Z face
  pushQuad(verts, normals, roles,
    [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0,0,-1], role);
}

// Gable roof with ridge along Z (or X if ridgeAxis === 'x'), atop a box of size w×d.
// Roof base sits at y=cy+yBase, peak at y=cy+yBase+h.
function pushGableRoof(verts, normals, roles, w, h, d, cx, cy, cz, ridgeAxis = 'z') {
  const hw = w/2, hd = d/2;
  const y0 = cy, y1 = cy + h;
  const role = 1;
  const c0 = [cx-hw, y0, cz-hd], c1 = [cx+hw, y0, cz-hd];
  const c2 = [cx+hw, y0, cz+hd], c3 = [cx-hw, y0, cz+hd];
  if (ridgeAxis === 'z') {
    const rs = [cx, y1, cz-hd], re = [cx, y1, cz+hd];
    const len = Math.sqrt(h*h + hw*hw);
    const rN = [h/len, hw/len, 0];        // +X slope outward normal
    const lN = [-h/len, hw/len, 0];       // -X slope
    // Right slope (quad c1-c2-re-rs)
    pushQuad(verts, normals, roles, c1, c2, re, rs, rN, role);
    // Left slope (quad c3-c0-rs-re)
    pushQuad(verts, normals, roles, c3, c0, rs, re, lN, role);
    // Front gable (-Z)
    pushTri(verts, normals, roles, c0, c1, rs, [0,0,-1], role);
    // Back gable (+Z)
    pushTri(verts, normals, roles, c2, c3, re, [0,0,1], role);
  } else {
    const rs = [cx-hw, y1, cz], re = [cx+hw, y1, cz];
    const len = Math.sqrt(h*h + hd*hd);
    const fN = [0, hd/len, h/len];
    const bN = [0, hd/len, -h/len];
    pushQuad(verts, normals, roles, c3, c2, re, rs, fN, role);
    pushQuad(verts, normals, roles, c1, c0, rs, re, bN, role);
    pushTri(verts, normals, roles, c0, c3, rs, [-1,0,0], role);
    pushTri(verts, normals, roles, c2, c1, re, [1,0,0], role);
  }
}

function makeGeometry(THREE, verts, normals, roles) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('colorRole',new THREE.Float32BufferAttribute(roles, 1));
  return g;
}

// Flat slab "roof" — a thin overhanging cap on top of the walls. role=1
// (roof) so the per-instance roof color paints it.
function pushFlatRoof(verts, normals, roles, w, h, d, cx, cy, cz) {
  const role = 1;
  const hw = w/2, hd = d/2;
  const x0 = cx - hw, x1 = cx + hw;
  const y0 = cy, y1 = cy + h;
  const z0 = cz - hd, z1 = cz + hd;
  // +Y face (top)
  pushQuad(verts, normals, roles,
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], role);
  // -Y face (underside of overhang)
  pushQuad(verts, normals, roles,
    [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0,-1, 0], role);
  // +X / -X / +Z / -Z thin sides
  pushQuad(verts, normals, roles,
    [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], role);
  pushQuad(verts, normals, roles,
    [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], role);
  pushQuad(verts, normals, roles,
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], role);
  pushQuad(verts, normals, roles,
    [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0,-1], role);
}

// Default house — moderate gable roof. Used by the forest template.
export function buildHouseGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 3, 3, 4, 0, 0, 0);
  pushGableRoof(v, n, r, 3, 1.5, 4, 0, 3, 0, 'z');
  return makeGeometry(THREE, v, n, r);
}

// Desert variant: flat slab roof with slight overhang. Sandstone-style.
export function buildFlatHouseGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 3, 3.2, 4, 0, 0, 0);
  pushFlatRoof(v, n, r, 3.4, 0.35, 4.4, 0, 3.2, 0);
  return makeGeometry(THREE, v, n, r);
}

// Runway segment — a flat 1×0.05×1 unit slab. Instances are scaled to the
// runway width (scaleX) and length (scaleZ). Lies just above terrain. Whole
// geometry is role=0 so the per-instance "wallColor" tint paints the
// asphalt color. Used for one runway per village (replacing the old crossed
// dirt roads).
export function buildRunwayGeometry(THREE) {
  const v = [], n = [], r = [];
  // Top face (visible from above)
  pushQuad(v, n, r,
    [-0.5, 0.05, -0.5], [0.5, 0.05, -0.5], [0.5, 0.05, 0.5], [-0.5, 0.05, 0.5],
    [0, 1, 0], 0);
  // Sides (visible at low altitude / tilted view)
  pushQuad(v, n, r,
    [ 0.5, 0,    -0.5], [ 0.5, 0.05, -0.5], [ 0.5, 0.05, 0.5], [ 0.5, 0,    0.5],
    [ 1, 0, 0], 0);
  pushQuad(v, n, r,
    [-0.5, 0,     0.5], [-0.5, 0.05,  0.5], [-0.5, 0.05,-0.5], [-0.5, 0,   -0.5],
    [-1, 0, 0], 0);
  pushQuad(v, n, r,
    [-0.5, 0,     0.5], [ 0.5, 0,     0.5], [ 0.5, 0.05, 0.5], [-0.5, 0.05, 0.5],
    [0, 0, 1], 0);
  pushQuad(v, n, r,
    [ 0.5, 0,    -0.5], [-0.5, 0,    -0.5], [-0.5, 0.05,-0.5], [ 0.5, 0.05,-0.5],
    [0, 0,-1], 0);
  return makeGeometry(THREE, v, n, r);
}

// Square-pyramid spire — used for the monastery bell tower top.
function pushSpire(verts, normals, roles, baseR, h, cx, cy, cz) {
  const role = 1;
  const apex = [cx, cy + h, cz];
  const corners = [
    [cx - baseR, cy, cz - baseR],
    [cx + baseR, cy, cz - baseR],
    [cx + baseR, cy, cz + baseR],
    [cx - baseR, cy, cz + baseR],
  ];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    // Outward face normal from triangle a → b → apex
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const ax = apex[0] - a[0], ay = apex[1] - a[1], az = apex[2] - a[2];
    const nx = ey * az - ez * ay;
    const ny = ez * ax - ex * az;
    const nz = ex * ay - ey * ax;
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    const n = [nx/len, ny/len, nz/len];
    // Push as a single tri using the pushQuad helper with one repeated vertex
    // would create a degenerate edge; do it directly.
    verts.push(...a, ...b, ...apex);
    normals.push(...n, ...n, ...n);
    roles.push(role, role, role);
  }
}

// Monastery church — long nave + cross transept + bell tower with spire.
// All in one geometry; one instance per monastery.
export function buildMonasteryChurchGeometry(THREE) {
  const v = [], n = [], r = [];
  // Nave (long axis Z)
  pushWallsNoTop(v, n, r, 5, 5, 12, 0, 0, 0);
  pushGableRoof(v, n, r, 5, 2, 12, 0, 5, 0, 'z');
  // Transept (cross arm — long axis X, centred across nave)
  pushWallsNoTop(v, n, r, 9, 4.5, 4, 0, 0, -1);
  pushGableRoof(v, n, r, 9, 1.8, 4, 0, 4.5, -1, 'x');
  // Bell tower at the -Z front
  pushWallsNoTop(v, n, r, 2.5, 9, 2.5, 0, 0, -7.5);
  pushFlatRoof(v, n, r, 2.7, 0.3, 2.7, 0, 9, -7.5);
  // Spire on top of the bell tower
  pushSpire(v, n, r, 0.9, 2.2, 0, 9.3, -7.5);
  return makeGeometry(THREE, v, n, r);
}

// Monastery cloister wing — long low building (one storey, slim roof).
export function buildMonasteryWingGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 2.5, 3, 12, 0, 0, 0);
  pushGableRoof(v, n, r, 2.5, 1.2, 12, 0, 3, 0, 'z');
  return makeGeometry(THREE, v, n, r);
}

// Castle keep — square tower with a flat top + crenellation tabs around
// the parapet. Taller than houses, broader than a windmill tower.
export function buildCastleKeepGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 4, 8, 4, 0, 0, 0);
  // Flat roof slab as the "battlement floor"
  pushFlatRoof(v, n, r, 4.4, 0.3, 4.4, 0, 8, 0);
  // Crenellation tabs — 3 small blocks on each face, on top of the slab.
  // Pad them as walls (role=0) so they take the keep's wall tone.
  for (let s = 0; s < 4; s++) {
    const offsets = [-1.3, 0, 1.3];
    for (const o of offsets) {
      const x = (s === 1) ?  2.2 : (s === 3) ? -2.2 : o;
      const z = (s === 0) ? -2.2 : (s === 2) ?  2.2 : o;
      pushWallsNoTop(v, n, r, 0.55, 0.55, 0.55, x, 8.3, z);
    }
  }
  return makeGeometry(THREE, v, n, r);
}

// Castle corner tower — narrower square tower with a tall conical-style
// peaked roof. (Reuses pushGableRoof — square-base "cone" enough at scale.)
export function buildCastleTowerGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 2.4, 6, 2.4, 0, 0, 0);
  pushGableRoof(v, n, r, 2.4, 2.0, 2.4, 0, 6, 0, 'x');
  return makeGeometry(THREE, v, n, r);
}

// Curtain wall — long low slab with crenellations across the top.
export function buildCastleWallGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 0.8, 3.5, 6, 0, 0, 0);
  // Crenellation tabs along the +Z / -Z long sides (top edge).
  // 5 evenly spaced gaps along the 6m length, so 5 tabs.
  const tabsZ = [-2.4, -1.2, 0, 1.2, 2.4];
  for (const z of tabsZ) {
    pushWallsNoTop(v, n, r, 0.8, 0.5, 0.4, 0, 3.5, z);
  }
  return makeGeometry(THREE, v, n, r);
}

// Arctic variant: steep snow-shedding gable. Roof height doubled.
export function buildSteepHouseGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 3, 2.8, 4, 0, 0, 0);
  pushGableRoof(v, n, r, 3, 3.0, 4, 0, 2.8, 0, 'z');
  return makeGeometry(THREE, v, n, r);
}

export function buildBarnGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 5, 3.5, 7, 0, 0, 0);
  pushGableRoof(v, n, r, 5, 1.6, 7, 0, 3.5, 0, 'z');
  return makeGeometry(THREE, v, n, r);
}

export function buildChurchGeometry(THREE) {
  const v = [], n = [], r = [];
  // Nave
  pushWallsNoTop(v, n, r, 4, 5, 6, 0, 0, 0);
  pushGableRoof(v, n, r, 4, 1.5, 6, 0, 5, 0, 'z');
  // Bell tower at -Z front
  pushWallsNoTop(v, n, r, 2, 7, 2, 0, 0, -4);
  pushGableRoof(v, n, r, 2, 1.5, 2, 0, 7, -4, 'x');
  return makeGeometry(THREE, v, n, r);
}

// Windmill tower — square base with a pyramidal cap, built from the same
// pushWallsNoTop / pushGableRoof primitives as the houses so the explicit
// per-face normals match. (THREE.CylinderGeometry + flatShading had a
// reversed-triangle look in this build; rebuilding from primitives sidesteps
// the issue and the square tower reads as a Dutch-windmill style anyway.)
export function buildWindmillTowerGeometry(THREE) {
  const v = [], n = [], r = [];
  pushWallsNoTop(v, n, r, 3, 6, 3, 0, 0, 0);
  pushGableRoof(v, n, r, 3, 1.4, 3, 0, 6, 0, 'z');
  return makeGeometry(THREE, v, n, r);
}

// Windmill blades — one 4-armed cross in a single geometry. The whole cross
// spins around its local Z axis in the shader, so the four arms rotate
// together (the previous design used 4 separate instances each rotating
// around its own local X, which couldn't produce a coherent fan spin).
//
// Arms extend in +Y, -Y, +X, -X within the XY plane. Spin axis = +Z.
export function buildWindmillBladeGeometry(THREE) {
  // Each arm is a slim block (4.5 long × 0.4 across × 0.15 deep), with
  // role=1 (roof) so the per-instance roof-color attribute paints it.
  const v = [], n = [], r = [];
  const role = 1;
  function pushArmAlignedY(cx, cy) {
    // Box centred at (cx, cy, 0), size 0.4 × 4.5 × 0.15 (Y is the long axis).
    const hw = 0.2, hh = 2.25, hd = 0.075;
    const x0 = cx - hw, x1 = cx + hw;
    const y0 = cy - hh, y1 = cy + hh;
    const z0 = -hd, z1 = hd;
    // 6 faces with explicit outward normals (CCW from outside).
    // -Y face
    pushQuad(v, n, r, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0,-1,0], role);
    // +Y face
    pushQuad(v, n, r, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1,0], role);
    // +X
    pushQuad(v, n, r, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [ 1,0,0], role);
    // -X
    pushQuad(v, n, r, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1,0,0], role);
    // +Z
    pushQuad(v, n, r, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0,0, 1], role);
    // -Z
    pushQuad(v, n, r, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0,0,-1], role);
  }
  function pushArmAlignedX(cx, cy) {
    const hw = 2.25, hh = 0.2, hd = 0.075;
    const x0 = cx - hw, x1 = cx + hw;
    const y0 = cy - hh, y1 = cy + hh;
    const z0 = -hd, z1 = hd;
    pushQuad(v, n, r, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0,-1,0], role);
    pushQuad(v, n, r, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1,0], role);
    pushQuad(v, n, r, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [ 1,0,0], role);
    pushQuad(v, n, r, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1,0,0], role);
    pushQuad(v, n, r, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0,0, 1], role);
    pushQuad(v, n, r, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0,0,-1], role);
  }
  // 4 arms emanating from the hub at (0, 0).
  pushArmAlignedY(0,  2.25);    // +Y up
  pushArmAlignedY(0, -2.25);    // -Y down
  pushArmAlignedX( 2.25, 0);    // +X right
  pushArmAlignedX(-2.25, 0);    // -X left
  return makeGeometry(THREE, v, n, r);
}

// Tunnel — covered passage built from three solid stone slabs (left wall,
// right wall, ceiling) with both ends open. Long axis is local Z (so rotY=0
// runs the tunnel along world +Z). At scale=1 the interior passage is 30 m
// wide × 25 m tall × 200 m long; outer slab footprint is 38 m × 29 m × 200 m.
// Walls use role=0 (wall colour), ceiling top uses role=1 (roof colour) so
// the ceiling can be tinted differently if desired.
export function buildTunnelGeometry(THREE) {
  const v = [], n = [], r = [];
  const INNER_W   = 30;
  const INNER_H   = 25;
  const WALL_T    = 4;
  const CEILING_T = 4;
  const L         = 200;

  // Helper — solid block from pushWallsNoTop + pushFlatRoof so it has all 6
  // faces. ceilingRole=1 lets the slab top be roof-tinted; everywhere else
  // we keep role=0 (wall) so the interior surfaces share the stone wall
  // colour from the per-instance attribute.
  function pushBlock(w, h, d, cx, cy, cz, ceilingRole) {
    pushWallsNoTop(v, n, r, w, h, d, cx, cy, cz);
    if (ceilingRole != null) {
      // pushFlatRoof's top face uses role=1; for an all-wall block we'd
      // re-call pushFlatRoof and overwrite roles, but it's simpler to just
      // close the open top with a quad at role=ceilingRole and let the
      // slab sides keep role=0.
      const hw = w / 2, hd = d / 2;
      const y1 = cy + h;
      // +Y face only
      pushQuad(v, n, r,
        [cx - hw, y1, cz - hd],
        [cx + hw, y1, cz - hd],
        [cx + hw, y1, cz + hd],
        [cx - hw, y1, cz + hd],
        [0, 1, 0], ceilingRole);
    }
  }

  // Left wall: stone slab on the -X side. Top is open — the ceiling covers it.
  const leftCx  = -(INNER_W / 2 + WALL_T / 2);
  pushBlock(WALL_T, INNER_H, L, leftCx, 0, 0, null);
  // Right wall
  const rightCx = +(INNER_W / 2 + WALL_T / 2);
  pushBlock(WALL_T, INNER_H, L, rightCx, 0, 0, null);
  // Ceiling — spans the passage AND both walls so it caps everything from
  // above. Bottom face (visible from inside the tunnel) inherits role=0
  // (stone wall colour); top face is role=1 so it can take a different
  // tint when seen from above.
  const ceilW = INNER_W + 2 * WALL_T;
  pushBlock(ceilW, CEILING_T, L, 0, INNER_H, 0, 1);

  return makeGeometry(THREE, v, n, r);
}
