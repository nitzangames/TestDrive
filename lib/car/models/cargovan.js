// Cargo van slot — modelled after the Ford Transit (LWB, Medium Roof,
// US 2015). 5.98 m long × 2.06 m wide × 2.56 m tall, wheelbase 3.75 m.
//
// Distinctive features captured here:
//   * very tall, near-vertical sides; long flat medium-height roof
//   * short hood meeting a steeply-raked windshield (~45°)
//   * cab section in front (windshield + 2 door windows) with a tall
//     cargo box behind — NO side windows in the cargo area
//   * side cab windows have a slanted front edge that matches the
//     A-pillar slope (the actual door-glass shape) — modelled with
//     ExtrudeGeometry so they don't run through the windshield
//   * solid metal rear cargo doors (no rear glass)
//   * dark plastic side cladding running along the lower body
//   * dark plastic front + rear bumpers (the lower third of each face)
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildCargovanModel(THREE, { bodyColor = 0xf2f2f0 } = {}) {
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
  const VAN_HALF   = 2.99;

  // --- Body silhouette. The windshield line (cowl → top of windshield) is
  //     part of the outer outline and is overlaid with a dark glass plane
  //     below.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-VAN_HALF, 0.32);
  bodyShape.lineTo(-VAN_HALF, 0.65);   // bumper top
  bodyShape.lineTo(-2.78,     1.05);   // front face chamfer up to grille area
  bodyShape.lineTo(-2.25,     1.18);   // hood line
  bodyShape.lineTo(-1.95,     1.25);   // cowl (= windshield base, A-pillar bottom)
  bodyShape.lineTo(-0.80,     2.40);   // top of windshield (= A-pillar top)
  bodyShape.lineTo( 2.40,     2.50);   // back of roof (slight rise across)
  bodyShape.lineTo( 2.90,     2.40);   // rear-top chamfer
  bodyShape.lineTo( VAN_HALF, 2.15);   // rear upper corner
  bodyShape.lineTo( VAN_HALF, 0.32);
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield (slanted dark glass plane). Cowl (-1.95, 1.25) → top
  //     (-0.80, 2.40); 45° rake from horizontal. Push 0.01 m outward
  //     along the surface-outward normal — (0, +cos, +sin) of the
  //     rotation angle — so the glass sits just in front of the body's
  //     windshield surface, not half-embedded inside it.
  {
    const slopeLen = Math.hypot(1.15, 1.15);
    const angle = -Math.PI / 4;
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(
      0,
      1.825 + 0.01 * Math.cos(angle),
      -1.375 + 0.01 * Math.sin(angle),   // sin is negative, so this pushes z more negative (forward)
    );
    g.add(w);
  }

  // --- Cab side windows (driver + passenger door glass). The cargo area
  //     has no side glass. Each window has a SLANTED front edge that
  //     follows the A-pillar so it doesn't run through the windshield;
  //     built with ExtrudeGeometry of a 4-point polygon, extruded thin
  //     (0.02 m) and pressed against the body's outer side face.
  //
  //   Shape coords here: shape-X = length axis (back at +X), shape-Y =
  //   height. After extrude + translate + rotateY(-π/2) the shape's X axis
  //   maps to world Z, shape-Y stays world Y, extrude-Z maps to world X.
  //   So this looks "side-view-correct" while extruded thinly in width.
  const WINDOW_THICKNESS = 0.02;
  // 4-point polygon. Front edge runs from front-bottom to front-top,
  // following the A-pillar slope. A-pillar at y = 1.30 sits at z ≈ -1.90;
  // at y = 2.35 it sits at z ≈ -0.85. Window inset ~0.05–0.10 m behind the
  // pillar so the dark glass doesn't run through the body around it.
  const winShape = new THREE.Shape();
  winShape.moveTo(-1.80, 1.30);   // front-bottom (close to A-pillar at y=1.30)
  winShape.lineTo(-0.78, 2.35);   // front-top  (close to A-pillar at y=2.35)
  winShape.lineTo(-0.35, 2.35);   // back-top   (just forward of B-pillar at -0.30)
  winShape.lineTo(-0.35, 1.30);   // back-bottom
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(winShape, { depth: WINDOW_THICKNESS, bevelEnabled: false });
    geom.translate(0, 0, -WINDOW_THICKNESS / 2);
    geom.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, glass);
    // Push outward to the body's side face so the dark glass shows on
    // the side surface.
    mesh.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0, 0);
    g.add(mesh);
  }

  // --- Side cladding — dark plastic stripe along the lower body sides.
  for (const sx of [-1, 1]) {
    const mold = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 5.20), dark);
    mold.position.set(sx * (BODY_WIDTH / 2 + 0.002), 0.55, 0);
    g.add(mold);
  }

  // === Front face. Body face at z = -2.99; details just outside at -3.005.
  const FRONT_Z = -3.005;

  // Lower bumper — sits in the lower part of the vertical front face
  //     (body face is vertical from y=0.32 to y=0.65; above that it
  //     chamfers back, so all front-face details must stay below y=0.65
  //     or they'll float in front of the recessed chamfer).
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.18, 0.05), dark);
  frontBumper.position.set(0, 0.41, FRONT_Z);
  g.add(frontBumper);

  // Grille — sits on the chamfered fascia between the vertical front
  // face (y=0.65 at z=-2.99) and the hood line (y=1.05 at z=-2.78).
  // Position at y=0.92 → body chamfer is at z≈-2.85, so place the
  // grille at z=-2.85 so it's flush with the chamfer face.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.04), dark);
  grille.position.set(0, 0.92, -2.85);
  g.add(grille);
  const grilleTop = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.03, 0.05), chrome);
  grilleTop.position.set(0, 1.04, -2.80);
  g.add(grilleTop);

  // Headlights — sit on the upper part of the vertical front face,
  // just above the bumper.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.02), dark);
    housing.position.set(sx * 0.80, 0.57, -2.995);
    g.add(housing);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.10, 0.03), led);
    strip.position.set(sx * 0.80, 0.57, FRONT_Z);
    g.add(strip);
  }

  // === Rear face at +3.005.
  const REAR_Z = 3.005;

  // Lower rear bumper (matching plastic band).
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.40, 0.05), dark);
  rearBumper.position.set(0, 0.50, REAR_Z);
  g.add(rearBumper);

  // Tall vertical tail-light clusters on the upper outer corners of the
  // rear panel.
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.04), tail);
    t.position.set(sx * 0.85, 1.50, REAR_Z);
    g.add(t);
  }

  // Centre licence-plate panel on the rear doors (no rear glass — cargo
  // van rear doors are solid metal for security).
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.20, 0.04), dark);
  plate.position.set(0, 0.92, REAR_Z);
  g.add(plate);

  // === Wheels — 17-inch commercial van wheels (R = 0.40).
  const wheelR = 0.40;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.32, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom   = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.34, 8);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.95, wheelR,  1.85], [0.95, wheelR,  1.85],
    [-0.95, wheelR, -1.85], [0.95, wheelR, -1.85],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
