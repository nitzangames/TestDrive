// Sedan slot — modelled after the Mazda FC RX-7 (Gen 2, 1985-91).
// Compact 2-door coupe proportions: 4.29 m long × 1.69 m wide × 1.27 m tall.
// Distinctive features captured here:
//   * pop-up headlights flush in the hood → smooth wedge nose
//   * steep windshield rake (~50° from horizontal)
//   * continuous fastback roofline falling into a short tall hatch
//   * narrow body with strong shoulder over the wheels (cabin < body width)
//   * black side molding stripe along the doors at handle height
//   * small amber turn signals on the front bumper face
//   * pearl-white body by default
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildCoupeModel(THREE, { bodyColor = 0xefece4 } = {}) {
  const g = new THREE.Group();
  const body  = new THREE.MeshLambertMaterial({ color: bodyColor });
  const cabin = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub   = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });    // alloy
  const dark  = new THREE.MeshLambertMaterial({ color: 0x0c0e12 });
  const tail  = new THREE.MeshBasicMaterial({ color: 0x8f1d1d });
  const amber = new THREE.MeshBasicMaterial({ color: 0xe69020 });
  const lens  = new THREE.MeshBasicMaterial({ color: 0xfff5b0 });

  const BODY_WIDTH  = 1.69;
  const CABIN_WIDTH = 1.50;   // strong shoulder around the greenhouse

  // --- Lower body silhouette (length × height). Walks the FC profile:
  //   front bumper bottom → bumper top → hood front (just barely above
  //   bumper) → ramps gently up to windshield base → flat belt-line under
  //   cabin → trunk lid drops slightly → rear bumper top → rear bottom.
  //   Auto-closes along the underside at y=0.30.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.145, 0.30);
  bodyShape.lineTo(-2.145, 0.68);   // front bumper top
  bodyShape.lineTo(-2.06,  0.74);   // tiny chamfer at hood-front edge
  bodyShape.lineTo(-1.30,  0.82);   // hood wedge rises gently
  bodyShape.lineTo(-0.50,  0.90);   // windshield base (= A-pillar bottom)
  bodyShape.lineTo( 1.85,  0.95);   // belt line under cabin (= C-pillar bottom)
  bodyShape.lineTo( 2.06,  0.85);   // trunk lid drops slightly
  bodyShape.lineTo( 2.145, 0.65);   // rear bumper top
  bodyShape.lineTo( 2.145, 0.30);
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Cabin / greenhouse — continuous fastback from A-pillar to the
  // bottom of the hatch glass. Steep windshield (~50°), short flat roof
  // section, gentle slope across the hatch glass.
  const cabShape = new THREE.Shape();
  cabShape.moveTo(-0.50, 0.90);
  cabShape.lineTo(-0.19, 1.27);   // top of windshield
  cabShape.lineTo( 0.50, 1.27);   // back of roof
  cabShape.lineTo( 1.25, 1.15);   // hatch glass mid-slope
  cabShape.lineTo( 1.85, 0.95);   // bottom of hatch glass
  {
    const geom = new THREE.ExtrudeGeometry(cabShape, { depth: CABIN_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -CABIN_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, cabin));
  }

  // Side molding stripe — thin black band over the doors at handle height.
  for (const sx of [-1, 1]) {
    const mold = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 3.2), dark);
    mold.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0.85, 0.20);
    g.add(mold);
  }

  // Front bumper chin — thin dark strip across the lower bumper.
  const chin = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH, 0.08, 0.05), dark);
  chin.position.set(0, 0.36, -2.170);
  g.add(chin);

  // Small amber turn signals on each side of the bumper face.
  for (const x of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.04), amber);
    t.position.set(x, 0.58, -2.175);
    g.add(t);
  }

  // Pop-up headlight pods. Trapezoidal side profile: short at the back
  // (hinge), TALL at the front with the front-bottom extending well
  // below the resting hood line. Pod is NOT tilted — the front face
  // stays vertical so the lens points purely forward. The "popped up"
  // look comes from the profile shape itself (sloped top going from
  // tall at the back down to lower at the front).
  const POD_WIDTH = 0.42;
  for (const sx of [-1, 1]) {
    const pod = new THREE.Group();

    // Side profile in (depth, height) pod-local 2D. Depth runs from
    // back (+X) to front (-X). Bottom is FLAT at y = -0.32 (both back
    // and front vertices buried in the body), and the top slopes UP
    // from back-low (+0.04, just above hood) to front-high (+0.20,
    // well above hood) — wedge points forward, matching the FC's
    // "front lifted up, back hinged down" silhouette.
    const podShape = new THREE.Shape();
    podShape.moveTo( 0.16, -0.32);   // back-bottom (buried in body)
    podShape.lineTo( 0.16,  0.04);   // back-top (low, just above hood)
    podShape.lineTo(-0.16,  0.20);   // front-top (high, well above hood)
    podShape.lineTo(-0.16, -0.32);   // front-bottom (buried in body)
    // auto-closes back to (0.16, -0.32) along a flat underside at y=-0.32.
    const housingGeom = new THREE.ExtrudeGeometry(podShape, { depth: POD_WIDTH, bevelEnabled: false });
    housingGeom.translate(0, 0, -POD_WIDTH / 2);
    housingGeom.rotateY(-Math.PI / 2);
    pod.add(new THREE.Mesh(housingGeom, dark));

    // Lens — sits on the upper, VISIBLE part of the front face. The
    // front face goes geometrically from -0.32 to +0.20, but the hood
    // hides the lower portion (~ below y = -0.10). The lens covers the
    // visible band from y ≈ -0.08 up to ≈ +0.18 with a thin dark
    // border.
    const lensMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.02), lens);
    lensMesh.position.set(0, 0.05, -0.17);
    pod.add(lensMesh);

    // No pod rotation — lens faces straight ahead. Pod sits with its
    // back-bottom at hood level (y ≈ 0.78 there), front-bottom drops
    // into the body.
    pod.position.set(sx * 0.48, 0.84, -1.85);
    g.add(pod);
  }

  // Rear tail-light clusters — two per side, separated by a dark licence-
  // plate panel in the middle. Outer half of each cluster is the red main
  // brake/tail lens, inner ~30 % is the amber turn signal. Matches the
  // FC's distinctive split-cluster layout.
  const TAIL_Y = 0.75;
  const TAIL_H = 0.18;
  const TAIL_Z = 2.170;
  const C_OUTER = 0.82;
  const C_INNER = 0.30;
  const C_WIDTH = C_OUTER - C_INNER;     // 0.52 m per cluster
  const RED_W   = C_WIDTH * 0.65;
  const AMBER_W = C_WIDTH * 0.30;        // small gap between the two lenses
  for (const side of [-1, 1]) {
    const red = new THREE.Mesh(new THREE.BoxGeometry(RED_W, TAIL_H, 0.04), tail);
    red.position.set(side * (C_OUTER - RED_W / 2), TAIL_Y, TAIL_Z);
    g.add(red);
    const am = new THREE.Mesh(new THREE.BoxGeometry(AMBER_W, TAIL_H, 0.04), amber);
    am.position.set(side * (C_INNER + AMBER_W / 2), TAIL_Y, TAIL_Z);
    g.add(am);
  }
  // Centre licence-plate panel between the two clusters.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.20, 0.04), dark);
  plate.position.set(0, TAIL_Y, TAIL_Z);
  g.add(plate);

  // Small rear-hatch spoiler lip — thin body-colour strip rising above the
  // trailing edge of the hatch glass.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 0.20), body);
  spoiler.position.set(0, 0.99, 1.78);
  g.add(spoiler);

  // Wheels — 15-inch alloy, wheelbase ~2.5 m, biased slightly forward.
  const wheelR = 0.32;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  // 5-segment hub gives a "5-spoke alloy" silhouette in lowpoly.
  const hubGeom   = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.26, 5);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.74, wheelR,  1.20], [0.74, wheelR,  1.20],
    [-0.74, wheelR, -1.25], [0.74, wheelR, -1.25],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
