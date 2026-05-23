import { VERSION } from '../lib/version.js';
import { createTerrain } from '../lib/terrain/index.js';
import { biomeAt, BIOMES } from '../lib/game/biomes.js';
import { buildScatterRegistry } from '../lib/scatter/index.js';
import { buildLoopRoad } from '../lib/roads/loop.js';
import { queryRoadAt, resolveCarRoadCollision } from '../lib/roads/collision.js';
import { roadInfluence } from '../lib/roads/carve.js';
import { serializeRoadGraph } from '../lib/roads/shared.js';
import { buildRoadEdgeLines } from '../lib/roads/lines.js';
import { buildRoadCenterLine } from '../lib/roads/center-line.js';
import { buildGuardrails } from '../lib/roads/guardrails.js';
import { AITraffic } from '../lib/traffic/ai-traffic.js';
import { riverDepthAt } from '../lib/terrain/carve.js';
import { buildCarModel } from '../lib/car/model.js';
import { CarPhysics, CAR_CONSTANTS } from '../lib/car/physics.js';
import { Input } from '../lib/car/input.js';
import { ChaseCamera } from '../lib/car/camera.js';
import { EngineAudio } from '../lib/audio/engine.js';
import { HUD } from '../lib/ui/hud.js';
import { MainMenu } from '../lib/ui/menu.js';
import { StateMachine, MENU, DRIVE } from '../lib/game/state.js';

console.log('[testdrive] ' + VERSION);

const THREE = window.THREE;
const canvas = document.getElementById('game');
const hud = document.getElementById('hud-canvas');
const boot = document.getElementById('boot');
const bootPhaseEl = boot.querySelector('.boot-phase');

function setBootPhase(t) { if (bootPhaseEl) bootPhaseEl.textContent = t; }
const yieldPaint = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

// LocalStorage seed.
const LS_SEED = 'testdrive.seed';
function readOrMintSeed() {
  const cached = localStorage.getItem(LS_SEED);
  if (cached !== null) {
    const n = parseInt(cached, 10);
    if (Number.isFinite(n)) return n | 0;
  }
  const s = (Math.random() * 0xFFFFFFFF) | 0;
  localStorage.setItem(LS_SEED, String(s));
  return s;
}
const seed = readOrMintSeed();
console.log('[testdrive] seed', seed);

setBootPhase('Generating world…');
await yieldPaint();

const isMobile = /iPhone|iPad|Android/.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.5, 4000);
camera.rotation.order = 'YXZ';

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const scatterGeometries = buildScatterRegistry(THREE);

// Persisted style choice from the menu dropdown.
const LS_STYLE = 'testdrive.style';
const initialStyle = localStorage.getItem(LS_STYLE) || 'cartograph';

const terrain = createTerrain({
  THREE, scene, renderer,
  style: initialStyle, perfMode: 'high', seed,
  biomeAt,
  scatterGeometries,
  enableVillages: false,
});

setBootPhase('Generating roads…');
await yieldPaint();
const terrainHeightFn = (x, z) => terrain.getHeight(x, z);
const isOnWater = (x, z) => riverDepthAt(x, z, terrain.riverSegments, 1) > 0;
const graph = buildLoopRoad({ seed, terrainHeightFn, isOnWater });
console.log('[testdrive] road loop:', graph.nodes.length, 'nodes,', graph.edges.length, 'sub-edges');

// Hand the road graph to the terrain's chunk worker BEFORE any chunks load.
// The worker uses it inside buildChunkBuffers to carve heights, assign
// biome-band colours from the carved (post-cut) elevation, and skip / lift
// trees in the road corridor — all in one pass at generation time, so no
// post-process hack is needed.
setBootPhase('Linking roads to terrain…');
await yieldPaint();
await terrain.setRoadGraph(serializeRoadGraph(graph));

// Yellow edge-line ribbons + dashed white centre line + steel guardrails
// just beyond the yellow lines. All are static strip meshes built from the
// polyline; no per-frame work.
scene.add(buildRoadEdgeLines(THREE, graph));
scene.add(buildRoadCenterLine(THREE, graph));
scene.add(buildGuardrails(THREE, graph));

// Ambient AI traffic — pool of NPC cars that spawn around the player.
// ~55% drive the same direction as the player, ~45% are oncoming. As
// cars drift out of range they recycle back into the pool. Updated +
// collision-checked against the player every DRIVE-state tick below.
const traffic = new AITraffic({ THREE, scene, graph });

// Lighting fallback: guardrails + car use Lambert materials and need a light source.
if (!scene.children.some(c => c.isDirectionalLight)) {
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(120, 200, 80);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x202428, 0.5));
}

// Car + physics + input + chase camera.
const car = buildCarModel(THREE);
// Default Euler order is 'XYZ' which applies X (pitch) and Z (roll) BEFORE
// Y (yaw). With our yaw = heading + PI flip, pitch ends up acting around
// the model's local +X axis after a 180° yaw, which points to world -X —
// so positive rotation.x rotates the nose the wrong way and positive
// rotation.z rolls the wrong way. 'YXZ' applies yaw first (orienting the
// local frame to face motion), then pitch and roll act on the
// already-oriented frame, which is the natural vehicle convention.
car.rotation.order = 'YXZ';
scene.add(car);

// Per-wheel ground height. Uses the same smoothstep blend the carve applies
// to chunk vertices, so the wheel pose exactly matches the visible terrain:
//   * inside the corridor → roadY
//   * in the transition band → blend(roadY, terrainY) via roadInfluence()
//   * outside the band → raw terrain
// Without this match, wheels in the 15–21 m transition band would see roadY
// from queryRoadAt while the visible terrain is the blended value, and the
// car would visibly hover/tilt.
const groundYFn = (x, z) => {
  const q = queryRoadAt(graph, x, z);
  const terrain = terrainHeightFn(x, z);
  if (!q) return terrain;
  const w = roadInfluence(q.lateralOffset);
  if (w <= 0) return terrain;
  if (w >= 1) return q.roadY;
  return q.roadY * w + terrain * (1 - w);
};
const physics = new CarPhysics({
  terrainHeightFn,
  groundYFn,
  spawn: graph.spawn,
});

// Visible state — lerped each frame toward physics so the car flows smoothly
// through curves and chunk transitions. Initialised to the physics spawn so
// the first frame doesn't tween in from (0,0,0).
const visual = {
  x: physics.x, y: physics.y, z: physics.z,
  headingY: physics.headingY,
  pitch: 0, roll: 0, speed: 0,
};
function wrapLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

// Diagnostics hook (read by tools/screenshot.js).
window.__diag = {
  spawn: graph.spawn,
  nodeCount: graph.nodes.length,
  edgeCount: graph.edges.length,
  spawnNodeEdges: (graph.nodes.find(n => n.x === graph.spawn.x && n.z === graph.spawn.z) || {}).edges || [],
  getCar: () => ({ x: physics.x, y: physics.y, z: physics.z, headingY: physics.headingY, speed: physics.speed }),
  getCam: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  activeRoads: () => 0, // roads are baked into terrain chunks now
};
const input = new Input(canvas);

let engineAudio = null;
let runningPaused = false;
const startAudio = () => {
  if (engineAudio) return;
  engineAudio = new EngineAudio(CAR_CONSTANTS.MAX_SPEED);
  canvas.removeEventListener('pointerdown', startAudio);
  window.removeEventListener('keydown', startAudio);
};
canvas.addEventListener('pointerdown', startAudio, { once: false });
window.addEventListener('keydown', startAudio, { once: false });

document.addEventListener('visibilitychange', () => {
  runningPaused = document.hidden;
  if (engineAudio) document.hidden ? engineAudio.suspend() : engineAudio.resume();
});

const chase = new ChaseCamera(THREE, camera);
chase.update(physics);  // seed initial camera pose

// Atmosphere from forest biome.
const forest = BIOMES.find(b => b.name === 'forest');
scene.background = new THREE.Color(forest.sky[0], forest.sky[1], forest.sky[2]);
scene.fog = new THREE.Fog(
  new THREE.Color(forest.fog[0], forest.fog[1], forest.fog[2]),
  forest.fogNear, forest.fogFar,
);

const hud_ = new HUD(hud, graph);

const uiRoot = document.getElementById('ui-root');
// Menu uses its own car instance so the world car doesn't visually teleport.
const menuCar = buildCarModel(THREE);
const menu = new MainMenu({ THREE, uiRoot, carModel: menuCar, initialStyle });
menu.show();
menu.onStyleChange = (styleName) => {
  terrain.setStyle(styleName);
  localStorage.setItem(LS_STYLE, styleName);
};

const fsm = new StateMachine();
let gameOver = false;
menu.onStart = () => {
  fsm.start();
  menu.hide();
  if (engineAudio) engineAudio.resume();
  // Empty road for 2 s after the player enters DRIVE so the first thing
  // they see isn't a wall of cars.
  traffic.arm(2.0);
};

// Game-over overlay — built once, kept hidden until the player crashes.
const gameOverEl = document.createElement('div');
gameOverEl.style.cssText = `
  position:absolute;inset:0;display:none;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;
  background:rgba(10,14,20,0.82);color:#fff;
  font-family:ui-monospace,Menlo,monospace;pointer-events:auto;z-index:60;
`;
gameOverEl.innerHTML = `
  <div style="font-size:144px;font-weight:700;letter-spacing:0.04em;margin-bottom:48px;">CRASH</div>
  <div id="go-stats" style="font-size:48px;opacity:0.8;margin-bottom:80px;"></div>
  <button id="go-restart" style="
    width:60%;padding:36px 0;font:600 66px ui-monospace,Menlo,monospace;
    color:#0a0e14;background:#f1c64a;border:none;border-radius:18px;
    cursor:pointer;letter-spacing:0.04em;
  ">RESTART</button>
`;
uiRoot.appendChild(gameOverEl);
gameOverEl.querySelector('#go-restart').addEventListener('click', () => {
  // Full reload — simplest reset path. World seed in localStorage so the
  // same map regenerates if the user wants the same layout.
  location.reload();
});

traffic.onCrash = (impactSpeed) => {
  if (gameOver) return;
  gameOver = true;
  gameOverEl.style.display = 'flex';
  gameOverEl.querySelector('#go-stats').textContent =
    'Impact: ' + Math.round(impactSpeed * 3.6) + ' km/h';
  if (engineAudio) engineAudio.update(0);
};

let last = performance.now();
let accumulator = 0;
const FIXED_DT = 1 / 120;

function tick(now) {
  let frameDt = (now - last) / 1000;
  if (frameDt > 0.1) frameDt = 0.1;
  last = now;

  input.update();

  if (fsm.state === MENU) {
    menu.update(frameDt);
    // Pump the terrain chunk loader against the SPAWN position so the chunks
    // around where the player will appear stream in (and get road-carved)
    // while they watch the turntable, not after they hit Start.
    terrain.update({ x: graph.spawn.x, y: graph.spawn.y, z: graph.spawn.z }, frameDt);
    renderer.render(menu.scene, menu.camera);
    requestAnimationFrame(tick);
    return;
  }

  // DRIVE state.
  accumulator += frameDt;
  while (accumulator >= FIXED_DT) {
    if (!runningPaused && !gameOver) {
      // CarPhysics handles per-wheel ground sampling via groundYFn — no
      // post-step Y override needed here. The 4-wheel plane fit also drives
      // pitch/roll, including the one-wheel-off-road tilt.
      physics.step(input._steering ?? 0, FIXED_DT);
      // Resolve guardrail collision INSIDE the substep so a fast car can't
      // tunnel through the rail in one frame. Slides the car along the
      // rail and scrubs some speed (see lib/roads/collision.js).
      resolveCarRoadCollision(graph, physics);
    }
    accumulator -= FIXED_DT;
  }

  if (engineAudio) engineAudio.update(physics.speed);

  // Lerp the visible car state toward the physics state. Heavier smoothing
  // here (smaller factors → longer time constant) gives the car and the
  // chase camera a smoother visual feel through curves and chunk loads at
  // the cost of a ~80 ms latency between physics and visible. The chase
  // camera reads the same visual state so framing stays coherent.
  visual.x += (physics.x - visual.x) * 0.30;
  visual.z += (physics.z - visual.z) * 0.30;
  visual.y += (physics.y - visual.y) * 0.30;
  visual.headingY = wrapLerp(visual.headingY, physics.headingY, 0.22);
  // Pitch / roll are already lerped inside physics; further lerping here
  // would over-damp them.
  visual.pitch += (physics.pitch - visual.pitch) * 0.40;
  visual.roll  += (physics.roll  - visual.roll)  * 0.40;
  visual.speed = physics.speed;

  car.position.set(visual.x, visual.y, visual.z);
  // Car model's default front is at -Z (headlights at z=-1.95) but the
  // velocity at headingY=0 is +Z. Add PI to point the nose along motion.
  car.rotation.y = visual.headingY + Math.PI;
  car.rotation.x = visual.pitch;
  car.rotation.z = -visual.roll;
  const wheelSpin = (visual.speed * frameDt) / 0.36;
  for (const w of car.userData.wheels) w.rotation.x += wheelSpin;

  chase.update(visual);
  terrain.update(camera.position, frameDt);
  terrain.updateAtmosphere(physics.x, physics.z);
  if (!gameOver) {
    traffic.update(frameDt, physics);
    traffic.resolveCollisions(physics);
  }

  const b = biomeAt(physics.x, physics.z);
  hud_.setBiome(b.name);
  hud_.setCar(physics);
  hud_.setSpeed(physics.speed);
  hud_.draw(frameDt);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

boot.classList.add('hidden');
requestAnimationFrame(tick);
