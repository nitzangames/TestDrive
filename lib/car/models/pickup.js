// Pickup truck slot — modelled after the Dodge Ram 1500 Crew Cab.
// 5.82 m long × 2.06 m wide × 1.85 m tall, wheelbase ~3.57 m.
//
// Distinctive features captured here:
//   * tall split front grille (Ram's signature dual-port look — one
//     wide dark panel with a chrome vertical divider)
//   * long crew cab + short bed silhouette with a clear STEP DOWN
//     from the cab roof to the bed-wall top (non-convex body shape)
//   * gently raked windshield (~20° from horizontal — pickups have
//     shallower rake than cars)
//   * slim side cab windows running the full cab length with a
//     slanted A-pillar (ExtrudeGeometry with a 4-point polygon)
//   * solid bed (no separate floor / walls — bed reads as a closed
//     volume from the side; modelling the open box would need a lot
//     more polys than the rest of the registry)
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildPickupModel(THREE, { bodyColor = 0xd6d6d4 } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xc2c6cc });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 2.06;
  const HALF       = 2.91;

  // --- Body silhouette. The Ram has a near-vertical front face — bumper
  //     bottom through grille up to the hood-front edge are all at the
  //     same Z; the front face then chamfers back to start the hood.
  //     Non-convex at the cab→bed transition (Earcut handles it).
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.40);
  bodyShape.lineTo(-HALF, 0.70);   // bumper top
  bodyShape.lineTo(-HALF, 1.42);   // front face TOP (vertical face up to hood edge)
  bodyShape.lineTo(-2.74, 1.52);   // hood front edge (chamfer back to start hood)
  bodyShape.lineTo(-1.50, 1.56);   // hood (gentle rise back to cowl)
  bodyShape.lineTo(-1.20, 1.60);   // cowl (= windshield base, A-pillar bottom)
  bodyShape.lineTo(-0.40, 1.88);   // top of windshield (A-pillar top)
  bodyShape.lineTo( 1.65, 1.88);   // back of cab roof (LONG crew-cab roof)
  bodyShape.lineTo( 1.65, 1.20);   // cab BACK WALL drops all the way to bed-floor level
  bodyShape.lineTo( 2.78, 1.20);   // bed floor (flat across the open bed)
  bodyShape.lineTo( 2.78, 1.55);   // TAILGATE rises back up to bed-wall top
  bodyShape.lineTo( HALF, 1.32);   // rear top chamfer (behind tailgate)
  bodyShape.lineTo( HALF, 0.40);   // rear bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Open bed. The silhouette above DIPS in the bed area (top is at
  //     y=1.20 between cab back z=+1.65 and tailgate z=+2.78), which
  //     gives us the cab-back wall and tailgate "for free" from the
  //     extrude. The LEFT and RIGHT bed walls are missing though (the
  //     extrude is full-width in that Z range), so we add them as two
  //     thin body-colored boxes sitting on the bed floor.
  const BED_FRONT_Z = 1.65;
  const BED_REAR_Z  = 2.78;
  const BED_FLOOR_Y = 1.20;
  const BED_WALL_TOP_Y = 1.55;
  const BED_LEN     = BED_REAR_Z - BED_FRONT_Z;   // 1.13
  const BED_CTR_Z   = (BED_FRONT_Z + BED_REAR_Z) / 2;
  const WALL_THICK  = 0.06;
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICK, BED_WALL_TOP_Y - BED_FLOOR_Y, BED_LEN),
      body,
    );
    wall.position.set(sx * (BODY_WIDTH / 2 - WALL_THICK / 2), (BED_FLOOR_Y + BED_WALL_TOP_Y) / 2, BED_CTR_Z);
    g.add(wall);
  }

  // --- Dark bed-liner floor — sits 1 cm above the body's bed-floor
  //     surface and is inset between the bed side walls. This is the
  //     dark rectangle the user sees when looking into the open bed.
  {
    const bedFloor = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_WIDTH - 2 * WALL_THICK, 0.02, BED_LEN),
      dark,
    );
    bedFloor.position.set(0, BED_FLOOR_Y + 0.01, BED_CTR_Z);
    g.add(bedFloor);
  }

  // --- Windshield (slanted dark glass plane). Cowl (-1.20, 1.60) → top
  //     (-0.40, 1.88); rake ≈ 19° from horizontal. Push 1 cm outward
  //     along the surface-outward normal.
  {
    const dz = 0.80, dy = 0.28;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(
      0,
      1.74 + 0.01 * Math.cos(angle),
      -0.80 + 0.01 * Math.sin(angle),
    );
    g.add(w);
  }

  // --- Side cab windows. The glass extends well below the cowl, all
  //     the way down to the belt line at y≈1.30 — pickups have very tall
  //     side windows (≈0.55 m, roughly half the cab height). 5-point
  //     polygon with a KINK at the cowl:
  //       * lower front edge: near-vertical door-frame from belt line
  //         (y=1.30) up to the cowl (y=1.60)
  //       * upper front edge: A-pillar slope from cowl to roof
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-1.00, 1.30);   // front-bottom-low (at belt line, on door frame)
  winShape.lineTo(-1.13, 1.60);   // KINK at cowl (just inside A-pillar at z=-1.20)
  winShape.lineTo(-0.45, 1.85);   // front-top (inside A-pillar at z≈-0.43)
  winShape.lineTo( 1.55, 1.85);   // back-top  (just forward of cab back at z=1.65)
  winShape.lineTo( 1.55, 1.30);   // back-bottom (at belt line)
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(winShape, { depth: WINDOW_THICKNESS, bevelEnabled: false });
    geom.translate(0, 0, -WINDOW_THICKNESS / 2);
    geom.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, glass);
    mesh.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0, 0);
    g.add(mesh);
  }

  // --- Cab back window — small dark plane on the vertical cab-back
  //     wall at z = +1.65 (between cab roof and bed-wall top).
  {
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.30, 0.22, 0.02), glass);
    w.position.set(0, 1.72, 1.665);
    g.add(w);
  }

  // --- Side body cladding — subtle dark stripe along the lower body.
  for (const sx of [-1, 1]) {
    const mold = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 5.10), dark);
    mold.position.set(sx * (BODY_WIDTH / 2 + 0.002), 0.85, 0);
    g.add(mold);
  }

  // === Front face. Body face at z = -2.91; details just outside at -2.925.
  const FRONT_Z = -2.925;

  // Lower bumper (dark plastic).
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.35, 0.05), dark);
  frontBumper.position.set(0, 0.55, FRONT_Z);
  g.add(frontBumper);

  // TALL grille — distinctive Ram dual-port look. One wide dark panel
  // with chrome trim top/bottom and a chrome VERTICAL divider down
  // the middle.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.55, 0.04), dark);
  grille.position.set(0, 1.05, FRONT_Z);
  g.add(grille);
  const grilleDivider = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.05), chrome);
  grilleDivider.position.set(0, 1.05, FRONT_Z);
  g.add(grilleDivider);
  const grilleTop = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.04, 0.05), chrome);
  grilleTop.position.set(0, 1.34, FRONT_Z);
  g.add(grilleTop);
  const grilleBot = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.04, 0.05), chrome);
  grilleBot.position.set(0, 0.76, FRONT_Z);
  g.add(grilleBot);

  // Headlights — angular horizontal clusters flanking the grille.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.02), dark);
    housing.position.set(sx * 0.82, 1.20, -2.915);
    g.add(housing);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.03), led);
    strip.position.set(sx * 0.82, 1.20, FRONT_Z);
    g.add(strip);
  }

  // === Rear face at +2.925.
  const REAR_Z = 2.925;

  // Chrome rear bumper — classic Ram chrome step bumper.
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.28, 0.05), chrome);
  rearBumper.position.set(0, 0.52, REAR_Z);
  g.add(rearBumper);

  // Vertical tail-light strips on the upper rear corners.
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.40, 0.04), tail);
    t.position.set(sx * 0.84, 1.10, REAR_Z);
    g.add(t);
  }

  // Centre licence-plate panel.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.20, 0.04), dark);
  plate.position.set(0, 0.95, REAR_Z);
  g.add(plate);

  // === Wheels — pickup-truck size (R = 0.45). Wheelbase ~3.57 m,
  // biased slightly toward the rear so the front overhang is short.
  const wheelR = 0.45;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom   = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.36, 10);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.92, wheelR,  2.05], [0.92, wheelR,  2.05],   // rear axle (in bed, behind cab at z=1.65)
    [-0.92, wheelR, -1.52], [0.92, wheelR, -1.52],   // front axle (wheelbase 3.57 m)
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
