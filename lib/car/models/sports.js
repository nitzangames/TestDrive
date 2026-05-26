// Sports compact — Mazda FD RX-7 (3rd gen, 1992-2002).
// 4.30 m long × 1.76 m wide × 1.23 m tall, wheelbase 2.43 m.
//
// Distinctive features captured here:
//   * very low front chin with FIXED elliptical headlights tucked
//     between the bumper and the fender hump (no pop-ups like the FC
//     in coupe.js — the FD's headlights are part of the front face)
//   * pronounced fender hump rising sharply from the nose, over the
//     front wheel
//   * deeply raked windshield (~23° from horizontal) and short cabin
//   * long fastback rear glass with a small ducktail spoiler bump
//   * triple round tail-light clusters per side (FD signature)
//   * functional brake-duct slits on the body sides behind the front
//     wheels
//   * twin exhaust tips at the rear
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildSportsModel(THREE, { bodyColor = 0xc83232 } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0xc4c4c8 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 1.76;
  const HALF       = 2.15;

  // --- Body silhouette. Low and curvy with a prominent fender hump
  //     over the front wheel, short cabin, and long fastback rear.
  //     Concave dips at the cowl and at the end of the rear glass
  //     (where the ducktail bumps up); Three.js Earcut handles these.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.22);
  bodyShape.lineTo(-HALF, 0.60);   // front face top (vertical bumper+headlight face)
  bodyShape.lineTo(-1.92, 0.78);   // start of fender curve (above headlights)
  bodyShape.lineTo(-1.40, 0.86);   // FENDER APEX (over front wheel at z=-1.22)
  bodyShape.lineTo(-1.00, 0.90);   // hood
  bodyShape.lineTo(-0.80, 0.95);   // cowl
  bodyShape.lineTo(-0.15, 1.23);   // top of windshield (steeply raked)
  bodyShape.lineTo( 0.45, 1.23);   // back of roof (short cabin)
  bodyShape.lineTo( 1.40, 0.86);   // end of rear hatch glass (long fastback)
  bodyShape.lineTo( 1.95, 0.80);   // trunk lid (smooth slope, no integrated ducktail)
  bodyShape.lineTo( HALF, 0.72);   // rear edge / top of rear face
  bodyShape.lineTo( HALF, 0.22);   // rear bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield. Cowl (-0.80, 0.95) → top (-0.15, 1.23). ~23° rake.
  {
    const dz = 0.65, dy = 0.28;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.09 + 0.01 * Math.cos(angle), -0.475 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Rear hatch glass. Back of roof (+0.45, 1.23) → end (+1.30, 0.85).
  //     Long, steeply sloped (~24° from horizontal) — the FD's signature
  //     fastback profile.
  {
    const dz = 0.85, dy = -0.38;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.12, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.04 + 0.01 * Math.cos(angle), 0.875 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Side windows. Small quad inside the A-pillar (windshield slope)
  //     and C-pillar (rear-glass slope). Pressed against the body's
  //     outer side face.
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-0.55, 1.02);   // front-bottom (just inside A-pillar)
  winShape.lineTo(-0.12, 1.20);   // front-top (just below top of windshield)
  winShape.lineTo( 0.42, 1.20);   // back-top  (just before back of roof)
  winShape.lineTo( 0.85, 1.02);   // back-bottom (along C-pillar slope)
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(winShape, { depth: WINDOW_THICKNESS, bevelEnabled: false });
    geom.translate(0, 0, -WINDOW_THICKNESS / 2);
    geom.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, glass);
    mesh.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0, 0);
    g.add(mesh);
  }

  // === Front face. Body face at z = -HALF; details just outside.
  const FRONT_Z = -HALF - 0.01;

  // Lower bumper opening / chin spoiler.
  const chin = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.10, 0.04), dark);
  chin.position.set(0, 0.30, FRONT_Z);
  g.add(chin);

  // Headlights — small horizontal elliptical clusters (FIXED, not
  // pop-ups like on the FC). Centered vertically on the front face.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.02), dark);
    housing.position.set(sx * 0.55, 0.50, FRONT_Z + 0.005);
    g.add(housing);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.03), led);
    lens.position.set(sx * 0.55, 0.50, FRONT_Z);
    g.add(lens);
  }

  // Centre grille opening between the headlights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.06, 0.04), dark);
  grille.position.set(0, 0.50, FRONT_Z);
  g.add(grille);

  // --- Side vents — small dark slits on the body sides behind the
  //     front wheel arches (FD has functional brake ducts here).
  for (const sx of [-1, 1]) {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.25), dark);
    vent.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0.68, -0.80);
    g.add(vent);
  }

  // === Rear face at z = +HALF + 0.01.
  const REAR_Z = HALF + 0.01;

  // Black rear panel — horizontal dark band running across the rear at
  // tail-light height. The tail lights are mounted in front of it (FD
  // signature — the lights "float" against a recessed dark backing).
  const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.20, 0.02), dark);
  rearPanel.position.set(0, 0.55, REAR_Z);
  g.add(rearPanel);

  // Triple round tail-light clusters per side — FD signature.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const light = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.02, 14),
        tail,
      );
      light.rotation.x = Math.PI / 2;
      light.position.set(sx * (0.42 + i * 0.16), 0.55, REAR_Z + 0.015);
      g.add(light);
    }
  }

  // Centre licence-plate panel (below the black tail-light band).
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.04), dark);
  plate.position.set(0, 0.36, REAR_Z);
  g.add(plate);

  // Twin exhaust tips at the bottom rear.
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12),
      hub,
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.set(sx * 0.20, 0.26, REAR_Z + 0.01);
    g.add(tip);
  }

  // --- Rear wing. Sits on tall body-colored risers that extend INTO
  //     the trunk surface — the risers' bottoms are below the body's
  //     trunk top (y≈0.80 at z=+1.92), so the lower portion is hidden
  //     inside the body and the wing reads as mounted, not floating.
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.04, 0.30), body);
  wingBlade.position.set(0, 1.13, 1.95);
  g.add(wingBlade);
  for (const sx of [-1, 1]) {
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.40, 0.10), body);
    riser.position.set(sx * 0.60, 0.93, 1.92);   // y center 0.93 → spans 0.73 to 1.13 (sinks ~0.07 m into trunk)
    g.add(riser);
  }

  // === Wheels — 17-inch alloys (R = 0.32), wheelbase 2.43 m.
  const wheelR = 0.32;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.28, 10);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.80, wheelR,  1.21], [0.80, wheelR,  1.21],
    [-0.80, wheelR, -1.22], [0.80, wheelR, -1.22],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
