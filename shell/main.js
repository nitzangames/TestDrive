import { VERSION } from '../lib/version.js';
import { createTerrain } from '../lib/terrain/index.js';
import { biomeAt, BIOMES } from '../lib/game/biomes.js';
import { buildScatterRegistry } from '../lib/scatter/index.js';
import { buildRoadGraph } from '../lib/roads/graph.js';
import { RoadManager } from '../lib/roads/manager.js';
import { riverDepthAt } from '../lib/terrain/carve.js';

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

// Camera: hover above the spawn point, pan slowly along spawn-edge direction.
camera.position.set(graph.spawn.x, graph.spawn.y + 80, graph.spawn.z);
camera.lookAt(graph.spawn.x + Math.sin(graph.spawn.headingY) * 200,
              graph.spawn.y,
              graph.spawn.z + Math.cos(graph.spawn.headingY) * 200);

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
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Slow forward pan along spawn heading.
  const v = 30; // m/s
  camera.position.x += Math.sin(graph.spawn.headingY) * v * dt;
  camera.position.z += Math.cos(graph.spawn.headingY) * v * dt;
  camera.position.y = terrain.getHeight(camera.position.x, camera.position.z) + 30;
  camera.lookAt(
    camera.position.x + Math.sin(graph.spawn.headingY) * 100,
    camera.position.y - 5,
    camera.position.z + Math.cos(graph.spawn.headingY) * 100
  );

  terrain.update(camera.position, dt);
  roadManager.update(camera.position);

  renderer.render(scene, camera);
  drawHUD();
  requestAnimationFrame(tick);
}

boot.classList.add('hidden');
requestAnimationFrame(tick);
