// Compact sedan — BMW E30 3-Series (1982-1994).
// 4.32 m long × 1.65 m wide × 1.38 m tall, wheelbase 2.57 m.
//
// Distinctive features captured here:
//   * boxy 80s shape with sharp angular creases
//   * twin "kidney" grille (BMW signature)
//   * four round headlights (2 per side — outer larger + inner smaller)
//   * HOFMEISTER KINK at the C-pillar (the rear edge of the side
//     window leans FORWARD at the bottom — BMW's signature greenhouse
//     cue)
//   * tall narrow tail-light clusters at the rear corners with red main
//     + amber turn segment
//   * chrome bumpers front and rear (early E30 trim)
//   * small 14-inch 5-spoke alloy wheels
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildCompactModel(THREE, { bodyColor = 0xeaeae0 } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x8a8a8e });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xc2c6cc });
  const led    = new THREE.MeshBasicMaterial({ color: 0xfffae8 });
  const amber  = new THREE.MeshBasicMaterial({ color: 0xffa830 });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 1.65;
  const HALF       = 2.16;

  // --- Body silhouette. Classic 80s boxy sedan: tall vertical front
  //     fascia, flat hood with slight rise to the cowl, raked
  //     windshield, flat roof, raked rear window, long flat trunk.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.30);
  bodyShape.lineTo(-HALF, 0.72);   // front face top (vertical fascia)
  bodyShape.lineTo(-2.05, 0.82);   // chamfer to hood
  bodyShape.lineTo(-1.50, 0.88);   // hood
  bodyShape.lineTo(-1.00, 0.90);   // cowl
  bodyShape.lineTo(-0.30, 1.32);   // top of windshield (~31° rake)
  bodyShape.lineTo( 1.10, 1.32);   // back of roof
  bodyShape.lineTo( 1.40, 1.05);   // bottom of rear glass / start of trunk
  bodyShape.lineTo( 2.00, 0.95);   // trunk lid (long, flat-ish)
  bodyShape.lineTo( HALF, 0.80);   // rear face top
  bodyShape.lineTo( HALF, 0.30);   // rear bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield. Cowl (-1.00, 0.90) → top (-0.30, 1.32). ~31° rake.
  {
    const dz = 0.70, dy = 0.42;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.11 + 0.01 * Math.cos(angle), -0.65 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Rear glass. Back of roof (+1.10, 1.32) → bottom (+1.40, 1.05).
  //     ~42° slope.
  {
    const dz = 0.30, dy = -0.27;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.185 + 0.01 * Math.cos(angle), 1.25 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Side windows with HOFMEISTER KINK. The rear edge of the
  //     window leans FORWARD at the bottom — back-bottom (z=+0.85) is
  //     forward of back-top (z=+1.00). This is BMW's signature
  //     greenhouse cue, visible from the side view.
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-0.75, 0.95);    // front-bottom (inside A-pillar)
  winShape.lineTo(-0.28, 1.28);    // front-top
  winShape.lineTo( 1.00, 1.28);    // back-top
  winShape.lineTo( 0.85, 0.95);    // back-bottom — KINK (forward of back-top)
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

  // Chrome bumper across the lower front.
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.12, 0.05), chrome);
  frontBumper.position.set(0, 0.42, FRONT_Z);
  g.add(frontBumper);

  // Twin BMW kidney grille — two vertical rectangles flanking the
  // centerline.
  for (const sx of [-1, 1]) {
    const kidney = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), dark);
    kidney.position.set(sx * 0.14, 0.62, FRONT_Z);
    g.add(kidney);
  }

  // Four round headlights — 2 per side (outer larger + inner smaller).
  const headlightGeom = new THREE.CylinderGeometry(0.10, 0.10, 0.04, 16);
  headlightGeom.rotateX(Math.PI / 2);
  const innerHeadlightGeom = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 14);
  innerHeadlightGeom.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const outer = new THREE.Mesh(headlightGeom, led);
    outer.position.set(sx * 0.65, 0.60, FRONT_Z);
    g.add(outer);
    const inner = new THREE.Mesh(innerHeadlightGeom, led);
    inner.position.set(sx * 0.42, 0.60, FRONT_Z);
    g.add(inner);
  }

  // Amber turn signals at the outer front corners.
  for (const sx of [-1, 1]) {
    const turn = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.03), amber);
    turn.position.set(sx * 0.80, 0.55, FRONT_Z);
    g.add(turn);
  }

  // === Rear face at z = +HALF + 0.01.
  const REAR_Z = HALF + 0.01;

  // Chrome rear bumper.
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.12, 0.05), chrome);
  rearBumper.position.set(0, 0.42, REAR_Z);
  g.add(rearBumper);

  // Tail-light clusters at the rear corners — red main with an inboard
  // amber turn segment.
  for (const sx of [-1, 1]) {
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.04), tail);
    taillight.position.set(sx * 0.62, 0.65, REAR_Z);
    g.add(taillight);
    const turn = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.05), amber);
    turn.position.set(sx * 0.48, 0.65, REAR_Z);
    g.add(turn);
  }

  // Centre licence-plate panel.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.14, 0.04), dark);
  plate.position.set(0, 0.65, REAR_Z);
  g.add(plate);

  // === Wheels — small 14-inch alloys (R = 0.30), wheelbase 2.57 m.
  const wheelR = 0.30;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.60, wheelR * 0.60, 0.26, 5);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.78, wheelR,  1.26], [0.78, wheelR,  1.26],
    [-0.78, wheelR, -1.31], [0.78, wheelR, -1.31],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
