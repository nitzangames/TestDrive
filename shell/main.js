import { VERSION } from '../lib/version.js';

console.log('[testdrive] ' + VERSION);

const THREE = window.THREE;
const canvas = document.getElementById('game');
const hud = document.getElementById('hud-canvas');
const boot = document.getElementById('boot');

// Renderer — antialias off on mobile, pixelRatio capped at 2.
const isMobile = /iPhone|iPad|Android/.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
const camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.5, 4000);
camera.position.set(0, 5, 12);
camera.lookAt(0, 0, 0);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// HUD: draw version stamp once at boot. Will be replaced by a per-frame draw later.
const hctx = hud.getContext('2d');
function drawVersion() {
  hctx.clearRect(0, 0, hud.width, hud.height);
  hctx.fillStyle = 'rgba(255,255,255,0.5)';
  hctx.font = '21px ui-monospace, Menlo, monospace';
  hctx.textAlign = 'left';
  hctx.textBaseline = 'bottom';
  hctx.fillText(VERSION, 24, hud.height - 24);
}
drawVersion();

// Render loop.
function tick() {
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

boot.classList.add('hidden');
tick();
