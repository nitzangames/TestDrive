// Kei truck — Suzuki Carry style (Japanese kei-class mini truck).
// 3.40 m long × 1.47 m wide × 1.78 m tall, wheelbase 1.91 m.
//
// Distinctive features captured here:
//   * tiny cabover layout — cab is just over a third of the truck
//   * near-vertical cab front face with a steeply-raked-but-mostly-
//     vertical windshield (~23° from vertical)
//   * SMALL flat cab roof
//   * OPEN bed in back with low body-colored side walls and a vertical
//     tailgate (no box like the cabover cargo truck — kei trucks have
//     open flatbed cargo areas)
//   * small wheels (R = 0.30 — kei-class trucks have tiny tires)
//   * simple rectangular headlights flanking a small grille
//
// Convention (matches buildCarModel): origin = road-plane contact patch,
// front faces -Z. group.userData.wheels = [4 wheel meshes for rotation].

export function buildKeitruckModel(THREE, { bodyColor = 0xeeeeec } = {}) {
  const g = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glass  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheel  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hub    = new THREE.MeshLambertMaterial({ color: 0x4a4e54 });
  const dark   = new THREE.MeshLambertMaterial({ color: 0x14171a });
  const led    = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
  const tail   = new THREE.MeshBasicMaterial({ color: 0xa0202a });

  const BODY_WIDTH = 1.47;
  const HALF       = 1.70;

  // --- Body silhouette: cab in front, open bed in back. The silhouette
  //     DIPS DOWN to bed-floor level (y=0.65) in the bed area, then
  //     rises back up to tailgate top (y=0.95). Two concave vertices
  //     where the bed floor meets the cab back wall and the tailgate.
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-HALF, 0.20);
  bodyShape.lineTo(-HALF, 0.50);   // bumper top
  bodyShape.lineTo(-1.65, 0.65);   // chamfer to cab
  bodyShape.lineTo(-1.65, 1.20);   // cab front face top (vertical front, headlights area)
  bodyShape.lineTo(-1.40, 1.78);   // top of windshield (~23° from vertical)
  bodyShape.lineTo(-0.30, 1.78);   // back of cab roof (cab ~1.35 m)
  bodyShape.lineTo(-0.30, 0.65);   // cab back wall drops to BED FLOOR
  bodyShape.lineTo( 1.55, 0.65);   // bed floor (open bed, 1.85 m long)
  bodyShape.lineTo( 1.55, 0.95);   // TAILGATE rises to bed-wall top
  bodyShape.lineTo( HALF, 0.95);   // small top shelf behind tailgate
  bodyShape.lineTo( HALF, 0.20);   // rear bottom
  {
    const geom = new THREE.ExtrudeGeometry(bodyShape, { depth: BODY_WIDTH, bevelEnabled: false });
    geom.translate(0, 0, -BODY_WIDTH / 2);
    geom.rotateY(-Math.PI / 2);
    g.add(new THREE.Mesh(geom, body));
  }

  // --- Windshield. Cab front (-1.65, 1.20) → roof front (-1.40, 1.78).
  //     Steeply slanted (~67° from horizontal, 23° from vertical).
  {
    const dz = 0.25, dy = 0.58;
    const slopeLen = Math.hypot(dz, dy);
    const angle = -Math.atan2(dy, dz);
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.10, 0.02, slopeLen), glass);
    w.rotation.x = angle;
    w.position.set(0, 1.49 + 0.01 * Math.cos(angle), -1.525 + 0.01 * Math.sin(angle));
    g.add(w);
  }

  // --- Side cab windows on the body's side faces, within the cab area.
  const WINDOW_THICKNESS = 0.02;
  const winShape = new THREE.Shape();
  winShape.moveTo(-1.55, 1.30);    // front-bottom (just inside A-pillar)
  winShape.lineTo(-1.42, 1.68);    // front-top
  winShape.lineTo(-0.35, 1.68);    // back-top (just inside cab back wall)
  winShape.lineTo(-0.35, 1.30);    // back-bottom
  for (const sx of [-1, 1]) {
    const geom = new THREE.ExtrudeGeometry(winShape, { depth: WINDOW_THICKNESS, bevelEnabled: false });
    geom.translate(0, 0, -WINDOW_THICKNESS / 2);
    geom.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, glass);
    mesh.position.set(sx * (BODY_WIDTH / 2 + 0.001), 0, 0);
    g.add(mesh);
  }

  // --- Cab back window (small dark plane on the cab back wall at z=-0.30).
  {
    const w = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.20, 0.30, 0.02), glass);
    w.position.set(0, 1.40, -0.315);
    g.add(w);
  }

  // --- Open bed side walls (body-colored thin boxes giving the bed
  //     left and right walls — the silhouette only provides the
  //     floor, tailgate, and cab back).
  const WALL_THICK = 0.05;
  const BED_FRONT_Z = -0.30;
  const BED_REAR_Z  = 1.55;
  const BED_LEN     = BED_REAR_Z - BED_FRONT_Z;   // 1.85
  const BED_CTR_Z   = (BED_FRONT_Z + BED_REAR_Z) / 2;
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICK, 0.30, BED_LEN),
      body,
    );
    wall.position.set(sx * (BODY_WIDTH / 2 - WALL_THICK / 2), 0.80, BED_CTR_Z);
    g.add(wall);
  }

  // --- Dark bed liner. Sits 1 cm above the silhouette's bed floor
  //     (y=0.65), inset between the side walls.
  {
    const bedFloor = new THREE.Mesh(
      new THREE.BoxGeometry(BODY_WIDTH - 2 * WALL_THICK, 0.02, BED_LEN),
      dark,
    );
    bedFloor.position.set(0, 0.66, BED_CTR_Z);
    g.add(bedFloor);
  }

  // === Front face elements at z = -HALF - 0.01.
  const FRONT_Z = -HALF - 0.01;

  // Front bumper (dark plastic at the very bottom).
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(BODY_WIDTH - 0.04, 0.20, 0.05), dark);
  frontBumper.position.set(0, 0.35, FRONT_Z);
  g.add(frontBumper);

  // Centre grille between the headlights.
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.10, 0.04), dark);
  grille.position.set(0, 0.85, FRONT_Z);
  g.add(grille);

  // Rectangular headlights flanking the grille.
  for (const sx of [-1, 1]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.14, 0.02), dark);
    housing.position.set(sx * 0.46, 0.85, FRONT_Z + 0.005);
    g.add(housing);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.03), led);
    lens.position.set(sx * 0.46, 0.85, FRONT_Z);
    g.add(lens);
  }

  // === Rear face elements at z = +HALF + 0.01.
  const REAR_Z = HALF + 0.01;

  // Tail-light clusters at the rear corners (low, below the tailgate
  // since the tailgate occupies the upper rear and lights are mounted
  // on the chassis below it).
  for (const sx of [-1, 1]) {
    const taillight = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.10, 0.04),
      tail,
    );
    taillight.position.set(sx * 0.50, 0.55, REAR_Z);
    g.add(taillight);
  }

  // Centre licence-plate panel.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.04), dark);
  plate.position.set(0, 0.40, REAR_Z);
  g.add(plate);

  // === Wheels — small kei-class tires (R = 0.30), wheelbase 1.91 m.
  const wheelR = 0.30;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 16);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.24, 8);
  hubGeom.rotateZ(Math.PI / 2);
  const positions = [
    [-0.66, wheelR,  0.71], [0.66, wheelR,  0.71],   // rear axle (under bed)
    [-0.66, wheelR, -1.20], [0.66, wheelR, -1.20],   // front axle (under cab)
  ];
  g.userData.wheels = [];
  for (const [x, y, z] of positions) {
    const w = new THREE.Mesh(wheelGeom, wheel); w.position.set(x, y, z); g.add(w);
    const h = new THREE.Mesh(hubGeom, hub);    h.position.set(x, y, z); g.add(h);
    g.userData.wheels.push(w);
  }
  return g;
}
