import { VERSION } from '../lib/version.js';
import { createTerrain } from '../lib/terrain/index.js';
import { biomeAt, BIOMES } from '../lib/game/biomes.js';
import { buildScatterRegistry } from '../lib/scatter/index.js';
import { buildRoadGraph } from '../lib/roads/graph.js';
import { RoadManager } from '../lib/roads/manager.js';
import { resolveCarRoadCollision, isCarOffGraph, isCarNearAnyJunction, queryRoadAt } from '../lib/roads/collision.js';
import { riverDepthAt } from '../lib/terrain/carve.js';
import { buildCarModel } from '../lib/car/model.js';
import { CarPhysics, CAR_CONSTANTS } from '../lib/car/physics.js';
import { Input } from '../lib/car/input.js';
import { ChaseCamera } from '../lib/car/camera.js';
import { EngineAudio } from '../lib/audio/engine.js';
import { HUD } from '../lib/ui/hud.js';
import { MainMenu } from '../lib/ui/menu.js';
import { CrashOverlay } from '../lib/ui/crash-overlay.js';
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
const terrain = createTerrain({
  THREE, scene, renderer,
  style: 'cartograph', perfMode: 'high', seed,
  biomeAt,
  scatterGeometries,
  enableVillages: false,
});

setBootPhase('Generating roads…');
await yieldPaint();
const terrainHeightFn = (x, z) => terrain.getHeight(x, z);
const isOnWater = (x, z) => riverDepthAt(x, z, terrain.riverSegments, 1) > 0;
const graph = buildRoadGraph({ seed, terrainHeightFn, isOnWater });
console.log('[testdrive] road graph:', graph.nodes.length, 'nodes,', graph.edges.length, 'edges');
const roadManager = new RoadManager(THREE, scene, graph, terrainHeightFn);

// Lighting fallback: guardrails + car use Lambert materials and need a light source.
if (!scene.children.some(c => c.isDirectionalLight)) {
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(120, 200, 80);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x202428, 0.5));
}

// Car + physics + input + chase camera.
const car = buildCarModel(THREE);
scene.add(car);

const physics = new CarPhysics({
  terrainHeightFn,
  spawn: graph.spawn,
});

// Diagnostics hook (read by tools/screenshot.js).
window.__diag = {
  spawn: graph.spawn,
  nodeCount: graph.nodes.length,
  edgeCount: graph.edges.length,
  spawnNodeEdges: (graph.nodes.find(n => n.x === graph.spawn.x && n.z === graph.spawn.z) || {}).edges || [],
  getCar: () => ({ x: physics.x, y: physics.y, z: physics.z, headingY: physics.headingY, speed: physics.speed }),
  getCam: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  activeRoads: () => roadManager.activeEdges.size,
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
const crashOverlay = new CrashOverlay(uiRoot);
// Menu uses its own car instance so the world car doesn't visually teleport.
const menuCar = buildCarModel(THREE);
const menu = new MainMenu({ THREE, uiRoot, carModel: menuCar });
menu.show();

const fsm = new StateMachine();
menu.onStart = () => {
  fsm.start();
  menu.hide();
  // Resume audio context if it was created already.
  if (engineAudio) engineAudio.resume();
};

let last = performance.now();
let accumulator = 0;
const FIXED_DT = 1 / 120;
let lastOffGraphCheck = 0;
let stuckSince = -1;
const OFF_GRAPH_CHECK_INTERVAL = 0.5;
const OFF_GRAPH_RESPAWN_AFTER = 0.5;

function tick(now) {
  let frameDt = (now - last) / 1000;
  if (frameDt > 0.1) frameDt = 0.1;
  last = now;

  input.update();

  if (fsm.state === MENU) {
    menu.update(frameDt);
    renderer.render(menu.scene, menu.camera);
    // Don't pump terrain/road streams while in menu — they'll start once we hit DRIVE.
    requestAnimationFrame(tick);
    return;
  }

  // DRIVE state.
  accumulator += frameDt;
  while (accumulator >= FIXED_DT) {
    if (!runningPaused) {
      physics.step(input._steering ?? 0, FIXED_DT);
      const nearJunction = isCarNearAnyJunction(graph, physics);
      resolveCarRoadCollision(graph, physics, nearJunction);
      // Ride on the road surface (smoothed polyline Y) instead of raw terrain.
      // Otherwise the road sometimes bridges above terrain in dips and the car
      // falls through.
      const q = queryRoadAt(graph, physics.x, physics.z);
      if (q) physics.y = q.roadY;
    }
    accumulator -= FIXED_DT;
  }

  if (engineAudio) engineAudio.update(physics.speed);

  car.position.set(physics.x, physics.y, physics.z);
  // Car model's default front is at -Z (headlights at z=-1.95) but the
  // velocity at headingY=0 is +Z. Add PI to point the nose along motion.
  car.rotation.y = physics.headingY + Math.PI;
  car.rotation.x = physics.pitch;
  car.rotation.z = -physics.roll;
  const wheelSpin = (physics.speed * frameDt) / 0.36;
  for (const w of car.userData.wheels) w.rotation.x += wheelSpin;

  chase.update(physics);
  terrain.update(camera.position, frameDt);
  roadManager.update(camera.position);

  // Off-graph recovery (unchanged from Task 17).
  lastOffGraphCheck += frameDt;
  if (lastOffGraphCheck >= OFF_GRAPH_CHECK_INTERVAL) {
    lastOffGraphCheck = 0;
    if (isCarOffGraph(graph, physics)) {
      if (stuckSince < 0) stuckSince = now / 1000;
      else if ((now / 1000) - stuckSince > OFF_GRAPH_RESPAWN_AFTER) {
        crashOverlay.trigger(() => {
          physics.x = graph.spawn.x; physics.z = graph.spawn.z;
          physics.headingY = graph.spawn.headingY; physics.speed = 0;
          stuckSince = -1;
        });
      }
    } else stuckSince = -1;
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
