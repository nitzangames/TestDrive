// SUV — Rivian R1S style (full-size electric 3-row SUV).
// 5.10 m long × 2.01 m wide × 1.95 m tall, wheelbase 3.07 m.
//
// Distinctive features captured here:
//   * tall, upright body with near-vertical front and rear faces
//   * long flat roof with body-colored roof rails
//   * VERTICAL stadium/pill-shaped headlights (Rivian's signature
//     "two-eyed" look — each side is a tall dark pill with a small
//     horizontal LED DRL crossbar in the middle)
//   * full-width LED tail-light bar across the rear
//   * large rear-hatch glass (steeply sloped from roof down to the
//     trunk area)
//   * dark plastic cladding running along the lower body sides
//   * 21-inch alloys with substantial wheel openings
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildSuvModel(THREE, { bodyColor = 0xeeeeec } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 2.01;
  const HALF       = 2.55;

  // --- Body silhouette. Boxy upright SUV: near-vertical front face,
  //     long flat roof, sloped rear hatch.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.30);
  bodyShape.lineTo(-HALF, 0.95);   // front face top (bumper + grille area)
  bodyShape.lineTo(-2.42, 1.18);   // front-top chamfer to hood
  bodyShape.lineTo(-1.85, 1.30);   // hood
  bodyShape.lineTo(-1.45, 1.35);   // cowl
  bodyShape.lineTo(-0.55, 1.88);   // top of windshield (moderate rake)
  bodyShape.lineTo( 2.10, 1.92);   // back of roof (very slight rise)
  bodyShape.lineTo( 2.20, 1.85);   // top of rear hatch glass
  bodyShape.lineTo( 2.45, 1.30);   // bottom of rear hatch glass (~66° slope)
  bodyShape.lineTo( HALF, 1.10);   // chamfer to rear face top
  bodyShape.lineTo( HALF, 0.30);   // rear bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield. Cowl (-1.45, 1.35) → top (-0.55, 1.88). ~30° rake.
  {
    const dz = 0.90, dy = 0.53;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.615 + 0.01 * Math.cos(angle), -1.00 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Rear hatch glass. Top of hatch (+2.20, 1.85) → bottom (+2.45,
  //     1.30). Steeply sloped (~66°). Pushed 1 cm outward.
  {
    const dz = 0.25, dy = -0.55;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.12, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.575 + 0.01 * Math.cos(angle), 2.325 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Side windows. Long continuous cabin window from A-pillar back
  //     to D-pillar (lowpoly simplification — real R1S has 3 sections).
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-1.20, 1.45);    // front-bottom (just inside A-pillar at belt)
  winShape.lineTo(-0.50, 1.83);    // front-top (just below top of windshield)
  winShape.lineTo( 2.05, 1.85);    // back-top (just forward of back of roof)
  winShape.lineTo( 2.05, 1.45);    // back-bottom
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(winShape, { depth: WINDOW_THICKNESS, bevelEnabled: false });
    geom.translate(0, 0, -WINDOW_THICKNESS / 2);
    geom.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, glass);
    mesh.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0, 0);
    g.add(mesh);
  }

  // --- Roof rails (subtle dark strips running along the roof edges).
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 2.60), dark);
    rail.position.set(sx * 0.88, 1.96, 0.78);
    g.add(rail);
  }

  // --- Side cladding (dark plastic strip running along the lower body).
  for (const sx of [-1, 1]) {
    const cladding = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.20, 4.60), dark);
    cladding.position.set(sx * (BODY_WIDTH / 2 + 0.002), 0.55, 0);
    g.add(cladding);
  }

  // === Front face elements at z = -HALF - 0.01.
  const FRONT_Z = -HALF - 0.01;

  // Lower front bumper (dark plastic).
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.25, 0.05), dark);
  frontBumper.position.set(0, 0.45, FRONT_Z);
  g.add(frontBumper);

  // Vertical stadium-pill headlights — Rivian signature. Each side:
  // a tall dark capsule (made from two stacked cylinders + a connecting
  // vertical box) with a small horizontal LED crossbar in the middle.
  for (const sx of [-1, 1]) {
    const capTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16),
      dark,
    );
    capTop.rotation.x = Math.PI / 2;
    capTop.position.set(sx * 0.78, 1.18, FRONT_Z);
    g.add(capTop);
    const capBot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.04, 16),
      dark,
    );
    capBot.rotation.x = Math.PI / 2;
    capBot.position.set(sx * 0.78, 0.72, FRONT_Z);
    g.add(capBot);
    const pill = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.04), dark);
    pill.position.set(sx * 0.78, 0.95, FRONT_Z);
    g.add(pill);
    // Horizontal LED DRL crossbar — the actual "headlight" element.
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), led);
    drl.position.set(sx * 0.78, 0.95, FRONT_Z);
    g.add(drl);
  }

  // === Rear face elements at z = +HALF + 0.01.
  const REAR_Z = HALF + 0.01;

  // Full-width LED tail-light bar (Rivian signature).
  const tailBar = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.06, 0.04),
    tail,
  );
  tailBar.position.set(0, 1.02, REAR_Z);
  g.add(tailBar);

  // Lower rear bumper (dark plastic, matching front).
  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.25, 0.05),
    dark,
  );
  rearBumper.position.set(0, 0.45, REAR_Z);
  g.add(rearBumper);

  // Centre licence-plate panel.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.18, 0.04), dark);
  plate.position.set(0, 0.78, REAR_Z);
  g.add(plate);

  // === Wheels — 21-inch alloys (R = 0.40), wheelbase 3.07 m.
  const wheelR = 0.40;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.34, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.58, wheelR * 0.58, 0.36, 10);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.93, wheelR,  1.45], [0.93, wheelR,  1.45],
    [-0.93, wheelR, -1.62], [0.93, wheelR, -1.62],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
