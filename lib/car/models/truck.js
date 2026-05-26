// Cargo truck — Japanese cabover box truck (Isuzu N-series / Mitsubishi
// Fuso Canter / Hino Dutro family).
// 6.20 m long × 1.80 m wide × 2.85 m tall, wheelbase 3.00 m.
//
// Distinctive features captured here:
//   * cabover layout — short rectangular cab in front, driver sits
//     directly over the front axle
//   * near-vertical cab front face with a wide windshield
//   * separate TALL RECTANGULAR cargo box behind the cab, taller than
//     the cab itself
//   * visible CHASSIS GAP between cab and box (about 0.30 m) — the
//     silhouette dips down to chassis level between cab and box
//   * big single-rear-wheel truck tires (R = 0.50)
//   * simple rectangular headlights below the windshield
//   * dark rear doors with a centre seam on the back of the cargo box
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildTruckModel(THREE, { bodyColor = 0xeeeeec } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 1.80;
  const HALF       = 3.10;

  // --- Body silhouette: cab + chassis gap + box. Non-convex — the
  //     silhouette dips down to chassis level between cab (z=-3.10 to
  //     -1.50) and box (z=-1.20 to +3.10). Three.js Earcut handles
  //     the two concave corners at the bottom of the notch.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.40);
  bodyShape.lineTo(-HALF, 0.95);   // front bumper top
  bodyShape.lineTo(-3.05, 1.10);   // small chamfer to cab front face
  bodyShape.lineTo(-3.05, 2.40);   // cab front face top (near-vertical)
  bodyShape.lineTo(-2.95, 2.55);   // cab roof chamfer
  bodyShape.lineTo(-1.50, 2.55);   // back of cab roof (cab ~1.60 m long)
  bodyShape.lineTo(-1.50, 1.10);   // cab back wall drops to chassis level
  bodyShape.lineTo(-1.20, 1.10);   // chassis horizontal (gap between cab and box)
  bodyShape.lineTo(-1.20, 2.85);   // box front wall rises (box is TALLER than cab)
  bodyShape.lineTo( 3.00, 2.85);   // box back wall top
  bodyShape.lineTo( 3.00, 1.10);   // box back wall bottom
  bodyShape.lineTo( HALF, 1.10);   // small rear ledge
  bodyShape.lineTo( HALF, 0.40);   // rear bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield — wide vertical glass on the upper portion of the
  //     cab front face. Cab front face is at z=-3.05; windshield sits
  //     just outside at z=-3.06.
  {
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.65, 0.02), glass);
    w.position.set(0, 2.05, -3.06);
    g.add(w);
  }

  // --- Side cab windows on the body's side faces, in the cab area.
  for (const sx of [-1, 1]) {
    const cabWin = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.55, 1.30),
      glass,
    );
    cabWin.position.set(sx * (BODY_WIDTH / 2 + 0.001), 2.00, -2.30);
    g.add(cabWin);
  }

  // === Front face elements at z = -HALF - 0.01.
  const FRONT_Z = -HALF - 0.01;

  // Lower bumper (dark plastic).
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.30, 0.05), dark);
  frontBumper.position.set(0, 0.55, FRONT_Z);
  g.add(frontBumper);

  // Centre grille between bumper and windshield.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.40, 0.20, 0.04), dark);
  grille.position.set(0, 1.40, FRONT_Z);
  g.add(grille);

  // Rectangular headlights flanking the grille.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.16, 0.02), dark);
    housing.position.set(sx * 0.58, 0.90, FRONT_Z + 0.005);
    g.add(housing);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.03), led);
    lens.position.set(sx * 0.58, 0.90, FRONT_Z);
    g.add(lens);
  }

  // === Rear face elements at z = +HALF + 0.01.
  const REAR_Z = HALF + 0.01;

  // Rear doors — single dark panel covering most of the back of the
  // box, with a vertical centre seam (the gap between the two swing
  // doors) and a small horizontal seam at the top.
  const rearDoorBg = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.06, 1.60, 0.02),
    body,
  );
  rearDoorBg.position.set(0, 1.95, REAR_Z);
  g.add(rearDoorBg);
  const doorSeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.60, 0.03),
    dark,
  );
  doorSeam.position.set(0, 1.95, REAR_Z + 0.005);
  g.add(doorSeam);
  const topSeam = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, 0.03),
    dark,
  );
  topSeam.position.set(0, 2.74, REAR_Z + 0.005);
  g.add(topSeam);

  // Rear bumper / step (small dark band).
  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.10, 0.05),
    dark,
  );
  rearBumper.position.set(0, 0.50, REAR_Z);
  g.add(rearBumper);

  // Tail-light clusters near the bottom corners of the box back.
  for (const sx of [-1, 1]) {
    const taillight = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.18, 0.04),
      tail,
    );
    taillight.position.set(sx * 0.70, 1.25, REAR_Z);
    g.add(taillight);
  }

  // === Wheels — big truck wheels (R = 0.50). Front under the cab,
  // rear toward the front of the box.
  const wheelR = 0.50;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.36, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.50, wheelR * 0.50, 0.38, 8);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.82, wheelR,  0.45], [0.82, wheelR,  0.45],   // rear axle (under box)
    [-0.82, wheelR, -2.55], [0.82, wheelR, -2.55],   // front axle (under cab)
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
