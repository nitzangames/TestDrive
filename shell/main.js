import { VERSION } from '../lib/version.js';
import { createTerrain } from '../lib/terrain/index.js';
import { biomeAt, BIOMES } from '../lib/game/biomes.js';
import { buildScatterRegistry } from '../lib/scatter/index.js';

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

// Hover camera above terrain origin for visual verification.
const groundY = terrain.getHeight(0, 0);
camera.position.set(0, groundY + 150, 0);

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
let orbit = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Slow orbit around origin so we see the terrain & light interact.
  orbit += dt * 0.05;
  const r = 400;
  camera.position.x = Math.cos(orbit) * r;
  camera.position.z = Math.sin(orbit) * r;
  camera.position.y = terrain.getHeight(camera.position.x, camera.position.z) + 250;
  camera.lookAt(0, terrain.getHeight(0, 0), 0);

  // Drive the terrain chunk loader.
  terrain.update(camera.position, dt);

  renderer.render(scene, camera);
  drawHUD();
  requestAnimationFrame(tick);
}

boot.classList.add('hidden');
requestAnimationFrame(tick);
