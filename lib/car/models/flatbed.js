// Medium box truck — European-style cabover (Renault/MAN/DAF flavor).
// 7.50 m long × 2.30 m wide × 3.20 m tall, wheelbase 4.50 m.
//
// Distinguishes itself from the smaller cabover cargo truck in
// truck.js by being substantially larger and having a more ROUNDED
// modern cab with a slightly raked front face and a much more raked
// windshield. Cargo area is a CLOSED BOX with solid sides (matching
// the reference); rear has two swing doors.
//
// Distinctive features captured here:
//   * rounded cabover cab with slight front-face setback + heavily
//     raked windshield (~20° from vertical)
//   * CLOSED BOX cargo area (taller than the cab, solid sides)
//   * visible chassis gap between cab and box (the silhouette dips
//     down to chassis level y=1.20 for 0.30 m)
//   * dark rear cargo doors with a centre seam (two swing doors)
//   * big truck wheels (R = 0.45)
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildFlatbedModel(THREE, { bodyColor = 0xeeeeec } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 2.30;
  const HALF       = 3.75;

  // --- Body silhouette: rounded cabover + chassis gap + closed box.
  //     Box is taller than the cab. Two concave vertices at the
  //     bottom of the chassis gap (Earcut handles them).
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.40);
  bodyShape.lineTo(-HALF, 0.95);   // bumper top
  bodyShape.lineTo(-3.60, 1.15);   // chamfer to cab face
  bodyShape.lineTo(-3.55, 1.90);   // cab front face top (slight setback)
  bodyShape.lineTo(-3.20, 2.85);   // windshield top (~20° from vertical)
  bodyShape.lineTo(-1.95, 2.85);   // back of cab roof
  bodyShape.lineTo(-1.95, 1.20);   // cab back wall to chassis
  bodyShape.lineTo(-1.65, 1.20);   // chassis horizontal (gap, 0.30 m)
  bodyShape.lineTo(-1.65, 3.05);   // box front wall (box is TALLER than cab)
  bodyShape.lineTo( HALF, 3.05);   // box back wall top — extends all the way to the rear (no gap)
  bodyShape.lineTo( HALF, 0.40);   // rear face down to the bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield. Cab face top (-3.55, 1.90) → roof front (-3.20, 2.85).
  //     Steeply raked compared to the smaller box truck.
  {
    const dz = 0.35, dy = 0.95;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 2.375 + 0.01 * Math.cos(angle), -3.375 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Side cab windows on the body's side faces, in the cab area.
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-3.45, 1.95);    // front-bottom (just inside cab front face)
  winShape.lineTo(-3.15, 2.70);    // front-top (just inside A-pillar slope)
  winShape.lineTo(-2.05, 2.70);    // back-top
  winShape.lineTo(-2.05, 1.95);    // back-bottom
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(winShape, { depth: WINDOW_THICKNESS, bevelEnabled: false });
    geom.translate(0, 0, -WINDOW_THICKNESS / 2);
    geom.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, glass);
    mesh.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0, 0);
    g.add(mesh);
  }

  // === Front face elements at z = -HALF - 0.01.
  const FRONT_Z = -HALF - 0.01;

  // Lower bumper (dark plastic).
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.45, 0.05), dark);
  frontBumper.position.set(0, 0.65, FRONT_Z);
  g.add(frontBumper);

  // Centre grille between the headlights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.50, 0.22, 0.04), dark);
  grille.position.set(0, 1.55, FRONT_Z);
  g.add(grille);

  // Rectangular headlights flanking the grille.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.02), dark);
    housing.position.set(sx * 0.78, 1.20, FRONT_Z + 0.005);
    g.add(housing);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.03), led);
    lens.position.set(sx * 0.78, 1.20, FRONT_Z);
    g.add(lens);
  }

  // === Rear face elements at z = +HALF + 0.01.
  const REAR_Z = HALF + 0.01;

  // Rear cargo doors — fill the upper part of the rear face. Vertical
  // centre seam (gap between two swing doors) and horizontal top seam.
  const rearDoorBg = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.06, 1.50, 0.02),
    body,
  );
  rearDoorBg.position.set(0, 2.30, REAR_Z);      // y range: 1.55 to 3.05
  g.add(rearDoorBg);
  const doorSeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.50, 0.03),
    dark,
  );
  doorSeam.position.set(0, 2.30, REAR_Z + 0.005);
  g.add(doorSeam);
  const topSeam = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, 0.03),
    dark,
  );
  topSeam.position.set(0, 3.00, REAR_Z + 0.005);
  g.add(topSeam);

  // Tail-light clusters BELOW the doors, on the rear face.
  for (const sx of [-1, 1]) {
    const taillight = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.18, 0.04),
      tail,
    );
    taillight.position.set(sx * 0.85, 1.25, REAR_Z);
    g.add(taillight);
  }

  // Centre licence-plate panel.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.04), dark);
  plate.position.set(0, 0.90, REAR_Z);
  g.add(plate);

  // Rear bumper step at the very bottom.
  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.20, 0.05),
    dark,
  );
  rearBumper.position.set(0, 0.55, REAR_Z);
  g.add(rearBumper);

  // === Wheels — medium truck wheels (R = 0.45), wheelbase 4.50 m.
  const wheelR = 0.45;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.36, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.50, wheelR * 0.50, 0.38, 8);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-1.07, wheelR,  1.50], [1.07, wheelR,  1.50],   // rear axle (under box)
    [-1.07, wheelR, -3.00], [1.07, wheelR, -3.00],   // front axle (under cab)
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
