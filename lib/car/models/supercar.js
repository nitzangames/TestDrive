// Supercar — Acura NSX (NA1, 1990-2005).
// 4.43 m long × 1.81 m wide × 1.17 m tall, wheelbase 2.53 m.
//
// Distinctive features captured here:
//   * very low front chin with a wide low air intake
//   * gentle wedge profile with pop-up headlights modeled FLUSH with
//     the hood (pods retracted — no visible lens in the silhouette)
//   * short, steeply-raked windshield meeting a short flat roof
//   * mid-engine layout: long FLAT engine cover behind the cabin
//   * small ducktail rise at the very back of the engine cover
//   * full-width tail-light bar across the rear (NSX signature)
//   * functional side air intake slits behind the doors (mid-engine
//     cooling)
//   * twin centered chrome exhaust tips
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildSupercarModel(THREE, { bodyColor = 0xd4a428 } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x303034 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const amber  = new THREE.MeshBasicMaterial({ color: 0xffa830 });
  const led    = new THREE.MeshBasicMaterial({ color: 0xfffae8 });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xc2c6cc });

  const BODY_WIDTH = 1.81;
  const HALF       = 2.215;

  // --- Body silhouette. Low wedge profile: very low chin, gradual
  //     hood rise to the cowl, short raked-windshield cabin, long FLAT
  //     engine cover, small ducktail rise at the rear.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.18);
  bodyShape.lineTo(-HALF, 0.40);   // bumper top (very low front fascia)
  bodyShape.lineTo(-2.00, 0.58);   // fascia rises above the bumper
  bodyShape.lineTo(-1.60, 0.72);   // hood front (pop-up pods retracted, flush)
  bodyShape.lineTo(-1.10, 0.82);   // hood mid (gentle wedge)
  bodyShape.lineTo(-0.90, 0.87);   // cowl
  bodyShape.lineTo(-0.45, 1.17);   // top of windshield (34° rake)
  bodyShape.lineTo( 0.65, 1.17);   // back of roof (cabin pushed back to shorten rear deck)
  bodyShape.lineTo( 0.95, 0.92);   // end of rear glass (~40° slope)
  bodyShape.lineTo( 1.80, 0.92);   // engine cover — flat rear deck (shortened — rear overhang ~0.7 m)
  bodyShape.lineTo( 1.95, 0.80);   // smooth chamfer to rear top
  bodyShape.lineTo( 1.95, 0.18);   // rear bottom (asymmetric: front at -HALF=-2.215, rear at +1.95)
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield. Cowl (-0.90, 0.87) → top (-0.45, 1.17). ~34° rake.
  {
    const dz = 0.45, dy = 0.30;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.06, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.02 + 0.01 * Math.cos(angle), -0.675 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Rear glass. Back of roof (+0.65, 1.17) → end (+0.95, 0.92).
  //     Short and steep (~40°) — the NSX has a small rear window
  //     opening onto the engine bay.
  {
    const dz = 0.30, dy = -0.25;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.12, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.045 + 0.01 * Math.cos(angle), 0.80 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Side windows. Quadrilateral inset between A-pillar (windshield
  //     slope) and C-pillar (rear-glass slope).
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-0.65, 0.95);    // front-bottom (just inside A-pillar)
  winShape.lineTo(-0.40, 1.15);    // front-top
  winShape.lineTo( 0.60, 1.15);    // back-top
  winShape.lineTo( 0.90, 0.95);    // back-bottom (just inside C-pillar)
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

  // Wide low front air intake (chin spoiler / lower bumper opening).
  const chin = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.10, 0.04), dark);
  chin.position.set(0, 0.25, FRONT_Z);
  g.add(chin);

  // Amber side-marker lights flanking the front bumper.
  for (const sx of [-1, 1]) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.03), amber);
    marker.position.set(sx * 0.65, 0.40, FRONT_Z);
    g.add(marker);
  }

  // --- Pop-up headlight pods (RAISED). Wedge profile in the Z-Y
  //     plane: front edge is vertical with the lens; top slopes DOWN
  //     toward the back to meet the hood surface so the pod appears
  //     to emerge from the hood. Pods are at the very FRONT of the
  //     hood — front at z=-2.00 (where the fascia rise ends and the
  //     hood begins). Hood y at z=-2.00 is 0.58, at z=-1.64 is ~0.71.
  const podWidth = 0.40;
  const podShape = new THREE.Shape();
  podShape.moveTo(-2.00, 0.58);    // front-bottom (at hood level at front)
  podShape.lineTo(-2.00, 0.81);    // front-top (raised vertical front face — lens lives here)
  podShape.lineTo(-1.64, 0.71);    // back-top (at hood level — blends in)
  podShape.lineTo(-1.64, 0.58);    // back-bottom (inside hood, hidden)
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(podShape, { depth: podWidth, bevelEnabled: false });
    geom.translate(0, 0, -podWidth / 2);
    geom.rotateY(-Math.PI / 2);
    const pod = new THREE.Mesh(geom, body);
    pod.position.set(sx * 0.55, 0, 0);
    g.add(pod);
    // Lens on the front (vertical) face of the pod.
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.04), led);
    lens.position.set(sx * 0.55, 0.695, -2.02);
    g.add(lens);
  }

  // --- Side air intakes — small rectangular slits on the body sides
  //     behind the doors, between the cabin (ends at z=+0.95) and the
  //     rear wheel (z=+1.235). Functional cooling for the mid-engine.
  for (const sx of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.10, 0.22), dark);
    intake.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0.75, 1.10);
    g.add(intake);
  }

  // === Rear face at z = +1.96 (rear bumper at z=+1.95, shorter than
  //     front overhang — the NSX has a shorter tail than its long
  //     wedge nose).
  const REAR_Z = 1.96;

  // Full-width tail-light bar — NSX signature. Wraps the entire rear.
  const tailBar = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.18, 0.04),
    tail,
  );
  tailBar.position.set(0, 0.55, REAR_Z);
  g.add(tailBar);

  // Dark trim strip running along the top of the tail-light bar.
  const tailTrim = new THREE.Mesh(
    new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.03, 0.02),
    dark,
  );
  tailTrim.position.set(0, 0.665, REAR_Z);
  g.add(tailTrim);

  // Centre licence-plate panel below the tail-light bar.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.14, 0.04), dark);
  plate.position.set(0, 0.36, REAR_Z);
  g.add(plate);

  // Twin centered chrome exhaust tips.
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.06, 14),
      chrome,
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.set(sx * 0.18, 0.24, REAR_Z + 0.01);
    g.add(tip);
  }

  // --- Rear wing. Sits above the flat engine cover (body top at z=+1.70
  //     is y=0.92) on two body-colored risers that sink into the deck.
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.04, 0.22), body);
  wingBlade.position.set(0, 1.10, 1.70);
  g.add(wingBlade);
  for (const sx of [-1, 1]) {
    const riser = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.08), body);
    riser.position.set(sx * 0.55, 0.95, 1.70);   // top at 1.08 (meets wing), bottom at 0.82 (sinks 0.10 into deck)
    g.add(riser);
  }

  // === Wheels — 17-inch alloys (R = 0.32), wheelbase 2.53 m.
  const wheelR = 0.32;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.30, 5);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.81, wheelR,  1.235], [0.81, wheelR,  1.235],
    [-0.81, wheelR, -1.30],  [0.81, wheelR, -1.30],
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
