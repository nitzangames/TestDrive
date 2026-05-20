// Single-car geometry. Returns a THREE.Group anchored at the road plane
// (i.e., (0,0,0) is the contact patch between the car and the road).
// Sports-coupe proportions: 4.4 m long × 1.8 m wide × 1.3 m tall.

export function buildCarModel(THREE) {
  const group = new THREE.Group();

  const bodyMat   = new THREE.MeshLambertMaterial({ color: 0xc83232 }); // racing red
  const cabinMat  = new THREE.MeshLambertMaterial({ color: 0x1d2128 });
  const wheelMat  = new THREE.MeshLambertMaterial({ color: 0x131418 });
  const hubMat    = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
  const lightMat  = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });

  // Lower body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 4.0), bodyMat);
  body.position.set(0, 0.4 + 0.225, 0);
  group.add(body);

  // Upper body (slightly narrower, longer hood than trunk).
  const upper = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 2.8), bodyMat);
  upper.position.set(0, 0.85, -0.2);
  group.add(upper);

  // Cabin (greenhouse).
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 1.6), cabinMat);
  cabin.position.set(0, 1.18, -0.1);
  group.add(cabin);

  // Headlights.
  const headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.05), lightMat);
  headlightL.position.set(-0.55, 0.72, -1.95);
  const headlightR = headlightL.clone();
  headlightR.position.x = 0.55;
  group.add(headlightL, headlightR);

  // Wheels.
  const wheelR = 0.36;
  const wheelGeom = new THREE.CylinderGeometry(wheelR, wheelR, 0.28, 18);
  wheelGeom.rotateZ(Math.PI / 2);
  const hubGeom = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.30, 12);
  hubGeom.rotateZ(Math.PI / 2);
  const wheelPositions = [
    [-0.85, wheelR, 1.35], [0.85, wheelR, 1.35],   // rear
    [-0.85, wheelR, -1.35], [0.85, wheelR, -1.35], // front
  ];
  group.userData.wheels = [];
  for (const [x, y, z] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeom, wheelMat);
    const h = new THREE.Mesh(hubGeom, hubMat);
    w.position.set(x, y, z);
    h.position.set(x, y, z);
    group.add(w); group.add(h);
    group.userData.wheels.push(w);
  }
  return group;
}
