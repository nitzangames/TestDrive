// Family minivan, proportioned after the Honda Odyssey (5th gen, 2018+).
// 5.18 m long × 1.99 m wide × 1.74 m tall, wheelbase 3.00 m.
// Distinctive features captured here:
//   * short hood, tall greenhouse — the cabin is the dominant volume
//   * steeply-raked windshield meeting a long flat roof
//   * near-vertical rear hatch with a small top spoiler lip
//   * horizontal headlights flanking a wide dark grille
//   * continuous-bar tail-light wrapping across the rear panel
//   * 18-inch wheels with a flush body shoulder
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildMinivanModel(THREE, { bodyColor = 0xc8ccd0 } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const cabin  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x0c0e12 });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xc2c6cc });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH  = 1.99;
  const CABIN_WIDTH = 1.85;

  // --- Lower body silhouette. Short hood, vertical front face, long
  //     flat belt-line under the cabin, and a TALL near-vertical rear
  //     face so the tail lights have something to attach to.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.59, 0.30);
  bodyShape.lineTo(-2.59, 0.85);   // front face top (top of headlight area)
  bodyShape.lineTo(-2.42, 1.00);   // hood front chamfer
  bodyShape.lineTo(-1.20, 1.10);   // hood at windshield base
  bodyShape.lineTo( 2.40, 1.15);   // belt line — runs all the way to the rear hatch base
  bodyShape.lineTo( 2.55, 1.05);   // small chamfer at rear-top corner
  bodyShape.lineTo( 2.59, 0.95);   // end of chamfer (top of rear face)
  bodyShape.lineTo( 2.59, 0.30);   // vertical rear face down to the bumper
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Cabin / greenhouse. Tall window area, steeply raked windshield,
  //     LONG flat roof (signature minivan), near-vertical rear hatch
  //     extending all the way back to z=+2.40 (matches the body belt
  //     line so the rear hatch reads as part of the vehicle's back).
  const cabShape = new THREE.Shape();
  cabShape.moveTo(-1.20, 1.10);
  cabShape.lineTo(-0.55, 1.70);   // top of windshield (steep rake)
  cabShape.lineTo( 2.05, 1.70);   // back of roof (long flat top, extended back)
  cabShape.lineTo( 2.35, 1.55);   // top-rear corner (small chamfer)
  cabShape.lineTo( 2.40, 1.15);   // back of cabin meets belt line at rear
  {
    const geom = new THREE.ExtrudeGeometry(cabShape, { depth: CABIN_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -CABIN_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, cabin));
  }

  // === Front face elements. Body face is at world Z = -2.59; details
  // sit at Z = -2.605 so they read as inset trim.
  const FRONT_Z = -2.605;

  // Wide rectangular grille (dark) on the upper bumper.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.20, 0.03), dark);
  grille.position.set(0, 0.72, FRONT_Z);
  g.add(grille);
  // Chrome trim across the top of the grille (Honda's "bar" trim).
  const grilleTop = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.03, 0.04), chrome);
  grilleTop.position.set(0, 0.84, FRONT_Z);
  g.add(grilleTop);

  // Headlights — horizontal LED clusters flanking the grille.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.02), dark);
    housing.position.set(sx * 0.78, 0.78, -2.595);
    g.add(housing);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.03), led);
    strip.position.set(sx * 0.78, 0.81, FRONT_Z);
    g.add(strip);
  }

  // Lower bumper dark accent.
  const lowerBumper = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.10, 0.04), dark);
  lowerBumper.position.set(0, 0.40, FRONT_Z);
  g.add(lowerBumper);

  // --- Rear hatch glass. Vertical dark plane at the back of the cabin
  //     (just outside the cabin's near-vertical back face at z=+2.40).
  //     Spans from belt-line height up to the chamfer at the roof.
  {
    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(CABIN_WIDTH - 0.10, 0.40, 0.02), cabin);
    rearGlass.position.set(0, 1.35, 2.42);
    g.add(rearGlass);
  }

  // === Rear face elements at Z = +2.605.
  const REAR_Z = 2.605;

  // Tail-light clusters — two prominent rectangles at the rear corners
  // (Odyssey signature), connected by a thinner red strip across the
  // middle to create the "continuous bar" look.
  for (const sx of [-1, 1]) {
    const cluster = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.20, 0.04),
      tail,
    );
    cluster.position.set(sx * 0.78, 0.80, REAR_Z);
    g.add(cluster);
  }
  const tailConn = new THREE.Mesh(
    new THREE.BoxGeometry(1.10, 0.06, 0.02),
    tail,
  );
  tailConn.position.set(0, 0.85, REAR_Z);
  g.add(tailConn);

  // Wrap-around tail-light extensions onto the body's side faces.
  for (const sx of [-1, 1]) {
    const wrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.20, 0.22),
      tail,
    );
    wrap.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0.80, 2.45);
    g.add(wrap);
  }

  // Centre licence-plate panel below the tail-light bar.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.18, 0.04), dark);
  plate.position.set(0, 0.55, REAR_Z);
  g.add(plate);

  // Small top spoiler at the very back of the roof, above the hatch
  // glass.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.04, 0.22), body);
  spoiler.position.set(0, 1.74, 2.05);
  g.add(spoiler);

  // === Wheels — 18-inch feel, wheelbase ~3.0 m, slight forward bias.
  const wheelR = 0.36;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom   = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.30, 10);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.92, wheelR,  1.55], [0.92, wheelR,  1.55],
    [-0.92, wheelR, -1.45], [0.92, wheelR, -1.45],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
