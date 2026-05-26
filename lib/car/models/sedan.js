// 4-door sedan, proportioned after the Volvo S60 (3rd gen, 2018+).
// 4.76 m long × 1.85 m wide × 1.43 m tall, wheelbase 2.87 m.
// Distinctive features captured here:
//   * three-box silhouette: long flat hood / tall greenhouse / short trunk
//   * "Thor's hammer" headlights — horizontal LED bar with a vertical
//     accent on the inboard end, set in a dark housing on each side of
//     the grille
//   * wide rectangular grille with thin chrome trim top + bottom
//   * vertical L-shaped tail-lights wrapping inward across the rear
//   * subtle lip spoiler on the trunk lid
//   * dark side-molding stripe at door-handle height
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildSedanModel(THREE, { bodyColor = 0x8b8d92 } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const cabin  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x0c0e12 });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xc2c6cc });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH  = 1.85;
  const CABIN_WIDTH = 1.66;

  // --- Lower body silhouette. Three-box S60 profile: vertical front face
  //     (bumper + grille area), long flat hood, raked windshield base,
  //     belt-line under the cabin, short trunk lid dropping into the rear
  //     bumper.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.38, 0.28);
  bodyShape.lineTo(-2.38, 0.92);   // front face top (top of grille/headlight area)
  bodyShape.lineTo(-2.22, 0.98);   // hood front chamfer
  bodyShape.lineTo(-1.20, 1.00);   // hood line
  bodyShape.lineTo(-0.60, 1.02);   // windshield base (A-pillar bottom)
  bodyShape.lineTo( 1.55, 1.06);   // belt line under cabin (C-pillar bottom)
  bodyShape.lineTo( 1.95, 1.03);   // trunk lid
  bodyShape.lineTo( 2.38, 0.82);   // rear bumper top
  bodyShape.lineTo( 2.38, 0.28);
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Cabin / greenhouse. Long roofline with a gentle C-pillar rake.
  const cabShape = new THREE.Shape();
  cabShape.moveTo(-0.60, 1.02);
  cabShape.lineTo(-0.05, 1.42);   // top of windshield
  cabShape.lineTo( 0.85, 1.42);   // back of roof
  cabShape.lineTo( 1.45, 1.20);   // C-pillar (gentle rake)
  cabShape.lineTo( 1.55, 1.06);   // back of cabin (meets trunk belt line)
  {
    const geom = new THREE.ExtrudeGeometry(cabShape, { depth: CABIN_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -CABIN_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, cabin));
  }

  // Side-molding stripe — dark band at door-handle height.
  for (const sx of [-1, 1]) {
    const mold = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 3.40), dark);
    mold.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0.78, 0.10);
    g.add(mold);
  }

  // === Front face elements. Body face is at world Z = -2.38; elements
  // sit at Z = -2.395 (just outside the face) with shallow depth so they
  // read as inset details.
  const FRONT_Z = -2.395;

  // Wide rectangular grille (dark) between the two headlights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.32, 0.03), dark);
  grille.position.set(0, 0.72, FRONT_Z);
  g.add(grille);
  // Chrome trim bars top and bottom of grille (the Volvo grille frame).
  const grilleTop = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.02, 0.04), chrome);
  grilleTop.position.set(0, 0.88, FRONT_Z);
  g.add(grilleTop);
  const grilleBot = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.02, 0.04), chrome);
  grilleBot.position.set(0, 0.56, FRONT_Z);
  g.add(grilleBot);

  // "Thor's hammer" headlights — horizontal DRL bar + short vertical
  // accent extending downward from the inboard end of the bar, on a dark
  // housing background. Positioned on the LOWER half of the front face so
  // the bulk of the bodywork sits above them.
  for (const sx of [-1, 1]) {
    // Dark housing (slightly recessed).
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.22, 0.02), dark);
    housing.position.set(sx * 0.74, 0.55, -2.385);
    g.add(housing);
    // Horizontal DRL bar at the top of the unit.
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.03), led);
    drl.position.set(sx * 0.74, 0.63, FRONT_Z);
    g.add(drl);
    // Vertical accent extending DOWN from the inboard end of the DRL.
    const vAccent = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.03), led);
    vAccent.position.set(sx * 0.62, 0.54, FRONT_Z);
    g.add(vAccent);
  }

  // Lower bumper dark accent (running between the front wheels).
  const lowerBumper = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.10, 0.04), dark);
  lowerBumper.position.set(0, 0.36, FRONT_Z);
  g.add(lowerBumper);

  // === Rear face elements. Body face is at world Z = +2.38; elements at
  // Z = +2.395.
  const REAR_Z = 2.395;

  // Vertical L-shaped tail-light clusters — main red vertical strip on the
  // outside, short red horizontal arm extending inward at the top
  // (the L's foot). Whole cluster sits on the LOWER half of the rear
  // panel (was centred too high before).
  for (const sx of [-1, 1]) {
    const vert = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.30, 0.04), tail);
    vert.position.set(sx * 0.82, 0.60, REAR_Z);
    g.add(vert);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.04), tail);
    arm.position.set(sx * 0.62, 0.73, REAR_Z);
    g.add(arm);
  }

  // Centre licence-plate panel between the tail-light clusters.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.20, 0.04), dark);
  plate.position.set(0, 0.58, REAR_Z);
  g.add(plate);

  // Subtle trunk-lid lip spoiler.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.03, 0.18), body);
  spoiler.position.set(0, 1.07, 1.92);
  g.add(spoiler);

  // === Wheels — 18-inch feel, wheelbase ~2.85 m, centred slightly
  // forward of the body centre (FF/AWD bias).
  const wheelR = 0.36;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom   = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.28, 10);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.85, wheelR,  1.45], [0.85, wheelR,  1.45],
    [-0.85, wheelR, -1.40], [0.85, wheelR, -1.40],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
