import { VERSION } from '../lib/version.js';
import { createTerrain } from '../lib/terrain/index.js';
import { biomeAt, BIOMES } from '../lib/game/biomes.js';
import { buildScatterRegistry } from '../lib/scatter/index.js';
import { buildRoadGraph } from '../lib/roads/graph.js';
import { RoadManager } from '../lib/roads/manager.js';
import { resolveCarRoadCollision, isCarOffGraph, isCarNearAnyJunction } from '../lib/roads/collision.js';
import { riverDepthAt } from '../lib/terrain/carve.js';
import { buildCarModel } from '../lib/car/model.js';
import { CarPhysics } from '../lib/car/physics.js';
import { Input } from '../lib/car/input.js';
import { ChaseCamera } from '../lib/car/camera.js';

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
const input = new Input(canvas);
const chase = new ChaseCamera(THREE, camera);
chase.update(physics);  // seed initial camera pose

// Atmosphere from forest biome.
const forest = BIOMES.find(b => b.name === 'forest');
scene.background = new THREE.Color(forest.sky[0], forest.sky[1], forest.sky[2]);
scene.fog = new THREE.Fog(
  new THREE.Color(forest.fog[0], forest.fog[1], forest.fog[2]),
  forest.fogNear, forest.fogFar,
);

const hctx = hud.getContext('2d');
function drawHUD() {
  hctx.clearRect(0, 0, hud.width, hud.height);
  hctx.fillStyle = 'rgba(255,255,255,0.5)';
  hctx.font = '21px ui-monospace, Menlo, monospace';
  hctx.textAlign = 'left';
  hctx.textBaseline = 'bottom';
  hctx.fillText(VERSION, 24, hud.height - 24);
}

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
  accumulator += frameDt;
  while (accumulator >= FIXED_DT) {
    physics.step(input._steering ?? 0, FIXED_DT);
    const nearJunction = isCarNearAnyJunction(graph, physics);
    resolveCarRoadCollision(graph, physics, nearJunction);
    accumulator -= FIXED_DT;
  }

  lastOffGraphCheck += frameDt;
  if (lastOffGraphCheck >= OFF_GRAPH_CHECK_INTERVAL) {
    lastOffGraphCheck = 0;
    if (isCarOffGraph(graph, physics)) {
      if (stuckSince < 0) stuckSince = now / 1000;
      else if ((now / 1000) - stuckSince > OFF_GRAPH_RESPAWN_AFTER) {
        physics.x = graph.spawn.x;
        physics.z = graph.spawn.z;
        physics.headingY = graph.spawn.headingY;
        physics.speed = 0;
        stuckSince = -1;
      }
    } else {
      stuckSince = -1;
    }
  }

  // Place car model.
  car.position.set(physics.x, physics.y - 0.0, physics.z);
  car.rotation.y = physics.headingY;
  car.rotation.x = physics.pitch;
  car.rotation.z = -physics.roll;
  // Spin wheels by speed (visual only).
  const wheelSpin = (physics.speed * frameDt) / 0.36;
  for (const w of car.userData.wheels) w.rotation.x += wheelSpin;

  // Streaming + terrain pump uses the camera's position.
  chase.update(physics);
  terrain.update(camera.position, frameDt);
  roadManager.update(camera.position);

  renderer.render(scene, camera);
  drawHUD();
  requestAnimationFrame(tick);
}

boot.classList.add('hidden');
requestAnimationFrame(tick);
