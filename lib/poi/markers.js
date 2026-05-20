// Landmark fly-through markers. Each landmark gets a coloured ring at a
// known position; flying the plane through the ring marks the landmark
// "visited" and persists it to localStorage.
//
// Landmark spec:
//   { id, x, y, z, angle? }
//     x/y/z = ring centre in world coords (lifted automatically by RING_LIFT)
//     angle = optional fixed ring axis direction in XZ plane (rotation around
//             world +Y). When omitted, the ring billboards around Y to face
//             the plane horizontally, so it presents as a fly-through hoop
//             regardless of approach direction.
//
// Usage:
//   const markers = new LandmarkMarkers(THREE, scene, landmarks);
//   markers.update(plane, dt);            // every frame
//   markers.visitedCount, markers.total
//   markers.consumeFlash() → { id } or null when a new ring was just hit

const RING_MAJOR_R = 30;          // ring centre to tube centre
const RING_TUBE_R  = 1.2;         // tube thickness
// Lift the ring centre high enough that a vertical 30 m-radius ring fully
// clears the tallest POI structures (castle keep ≈ 30 m world, monastery
// bell tower ≈ 40 m). With major_r=30 and lift=70, the ring spans
// y_ground+40 → y_ground+100 — well above every building geometry.
const RING_LIFT    = 70;

// Fly-through tolerances. Axial = along the runway direction (the ring's
// normal); radial = perpendicular from ring centre. Generous so a moving
// plane registers reliably across a frame.
const HIT_AXIAL   = 12;
const HIT_RADIAL  = 34;

const LS_KEY = 'flightsim.visited';

function loadVisited() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveVisited(set) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
}

export class LandmarkMarkers {
  constructor(THREE, scene, landmarks) {
    this.THREE = THREE;
    this.scene = scene;
    this.landmarks = landmarks;
    this.markers = [];   // [{ landmark, mesh, visited, axisX, axisZ }]
    this.total = landmarks.length;
    this.visitedCount = 0;
    this._flash = null;   // { id, t: seconds remaining }

    // Shared geometry; per-marker material so visited state can recolor.
    const geom = new THREE.TorusGeometry(RING_MAJOR_R, RING_TUBE_R, 8, 24);
    const matUnvisited = new THREE.MeshBasicMaterial({
      color: 0x60d8ff, transparent: true, opacity: 0.75,
      depthWrite: false,
    });
    const matVisited = new THREE.MeshBasicMaterial({
      color: 0x60ff80, transparent: true, opacity: 0.35,
      depthWrite: false,
    });
    this._matU = matUnvisited;
    this._matV = matVisited;
    this._geom = geom;

    const visited = loadVisited();
    for (const lm of landmarks) {
      const mesh = new THREE.Mesh(geom, visited.has(lm.id) ? matVisited : matUnvisited);
      mesh.position.set(lm.x, lm.y + RING_LIFT, lm.z);
      // Two orientation modes:
      //   - Fixed bearing: lm.angle is a finite number → ring is vertical and
      //     axis-aligned with that bearing in XZ (e.g., future runway markers).
      //   - Billboard (default): ring stays vertical, axis re-aimed at the
      //     plane each frame so the hoop always faces the pilot — works for
      //     POIs with no canonical approach direction (villages/castles/etc).
      const billboard = !(typeof lm.angle === 'number' && isFinite(lm.angle));
      let axisX, axisY = 0, axisZ;
      if (billboard) {
        // Initial bearing along +Z; update() overrides per frame.
        axisX = 0; axisZ = 1;
      } else {
        mesh.rotation.y = lm.angle;
        axisX = Math.sin(lm.angle); axisZ = Math.cos(lm.angle);
      }
      mesh.renderOrder = 5;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const isV = visited.has(lm.id);
      if (isV) this.visitedCount++;
      this.markers.push({
        landmark: lm, mesh, visited: isV, axisX, axisY, axisZ, billboard,
      });
    }
  }

  update(plane, dt) {
    for (const m of this.markers) {
      // Billboard rings re-aim at the plane every frame so they always face
      // it. Done before the visited short-circuit so visited rings still
      // present face-on as the pilot flies past (just in a different colour).
      if (m.billboard) {
        const lm = m.landmark;
        const yaw = Math.atan2(plane.x - lm.x, plane.z - lm.z);
        m.mesh.rotation.y = yaw;
        m.axisX = Math.sin(yaw);
        m.axisZ = Math.cos(yaw);
      }
      if (m.visited) continue;
      const lm = m.landmark;
      const dx = plane.x - lm.x;
      const dy = plane.y - (lm.y + RING_LIFT);
      const dz = plane.z - lm.z;
      // Signed distance along the ring axis.
      const axial = dx * m.axisX + dy * m.axisY + dz * m.axisZ;
      if (Math.abs(axial) > HIT_AXIAL) continue;
      // Distance perpendicular to the axis (within the ring's plane).
      const px = dx - m.axisX * axial;
      const py = dy - m.axisY * axial;
      const pz = dz - m.axisZ * axial;
      const radial = Math.sqrt(px * px + py * py + pz * pz);
      if (radial < HIT_RADIAL) {
        m.visited = true;
        m.mesh.material = this._matV;
        this.visitedCount++;
        this._flash = { id: lm.id, t: 1.6 };
        const set = loadVisited(); set.add(lm.id); saveVisited(set);
      }
    }
    if (this._flash) {
      this._flash.t -= dt;
      if (this._flash.t <= 0) this._flash = null;
    }
  }

  // Returns { id } once per new visit, then null until the next visit.
  consumeFlash() {
    if (!this._flash) return null;
    // Caller reads it; we don't actually clear here so the flash banner
    // can persist for the full duration. Use the t > 0 check instead.
    return { id: this._flash.id, t: this._flash.t };
  }

  dispose() {
    for (const m of this.markers) this.scene.remove(m.mesh);
    this._geom.dispose();
    this._matU.dispose();
    this._matV.dispose();
  }
}
