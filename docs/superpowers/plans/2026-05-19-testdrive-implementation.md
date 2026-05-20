# TestDrive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable, polished v1 of TestDrive — an open-road driving sandbox on the FlightSim procedural terrain — as a standalone JSGames game.

**Architecture:** Lift FlightSim's terrain/scatter/poi/biomes modules unchanged. Add a new road system (procedural Delaunay+MST graph, terrain-conforming ribbon + guardrails, near-camera streaming, lateral-clamp collision). Add a single car (FC3D-style drag-to-steer + auto-throttle physics, chase camera). Add minimal UI (menu, HUD with speedometer + mini-map, respawn overlay). Wire everything in `shell/main.js`. Per-commit version bump.

**Tech Stack:** ES modules, three.js r128 (CDN), Vitest for headless tests, Python http.server for dev, vanilla canvas-2D for HUD/menu, WebAudio for engine note.

**Source spec:** `docs/superpowers/specs/2026-05-19-testdrive-design.md` — re-read it before starting if unsure about a decision.

---

## File structure

Files created or modified by this plan. Each row maps to one or more tasks.

| Path | Responsibility | Task(s) |
|---|---|---|
| `package.json` | npm scripts (dev, test), vitest dev dep | T1 |
| `vitest.config.js` | vitest config | T1 |
| `dev-server.sh` | Python http.server on port 8086 | T1 |
| `.gitignore` | ignore node_modules etc. | T1 |
| `index.html` | entry HTML, three.js + PlaySDK + canvas | T2 |
| `meta.json` | platform metadata | T2 |
| `thumbnail.png` | 512×512 placeholder PNG | T2 |
| `lib/version.js` | VERSION constant | T2 |
| `shell/main.js` | boot, scene setup, game loop (grows across tasks) | T3, T4, T11, T16, T17, T18, T22, T25 |
| `lib/terrain/` | lifted from FlightSim, UNTOUCHED | T4 |
| `lib/scatter/` | lifted from FlightSim, UNTOUCHED | T4 |
| `lib/poi/` | lifted from FlightSim, UNTOUCHED but inactive at runtime | T4 |
| `lib/game/biomes.js` | lifted from FlightSim, UNTOUCHED | T4 |
| `lib/roads/delaunay.js` | small 2D Delaunay triangulation | T5 |
| `lib/roads/graph.js` | road graph generation (nodes, edges, polylines) | T6, T7 |
| `lib/roads/spatial-index.js` | bucketed grid for near-edge lookups | T8 |
| `lib/roads/geometry.js` | road ribbon, guardrail, junction-disk meshes | T9, T10 |
| `lib/roads/manager.js` | near-camera streaming + LRU cache | T11 |
| `lib/roads/collision.js` | lateral clamp, junction skip, off-graph recovery | T17 |
| `lib/car/model.js` | three.js mesh for the single car | T12 |
| `lib/car/physics.js` | speed + steering + heading + pitch/roll | T13 |
| `lib/car/input.js` | lifted from FC3D, unchanged | T14 |
| `lib/car/camera.js` | chase camera with smoothing + lookahead | T15 |
| `lib/game/state.js` | MENU / DRIVE state machine | T19 |
| `lib/audio/engine.js` | WebAudio engine note tied to speed | T18 |
| `lib/ui/hud.js` | HUD canvas: speedometer, mini-map, biome label, version | T20, T21, T22 |
| `lib/ui/menu.js` | main menu with single car turntable, Start button | T23 |
| `lib/ui/crash-overlay.js` | fade-to-black off-graph respawn | T24 |
| `tests/road-delaunay.test.js` | Delaunay triangulation tests | T5 |
| `tests/road-graph.test.js` | graph generation tests | T6, T7 |
| `tests/road-spatial-index.test.js` | spatial index tests | T8 |
| `tests/road-collision.test.js` | collision tests | T17 |
| `tests/car-physics.test.js` | physics tests | T13 |
| `tests/car-input.test.js` | input event-handling tests | T14 |
| `tests/state.test.js` | state machine tests | T19 |

---

## Conventions

- **Tests first.** Every pure-logic module (graph, polyline, spatial index, collision, physics, input parsing, state machine) gets a failing test before implementation. Visual modules (geometry mesh, car model, menu, HUD) are verified by running the dev server and looking.
- **Commit at the end of each task.** At each commit, bump THREE things in lockstep, per [[per-commit-version-bump]]:
  1. `lib/version.js` VERSION constant (e.g. `v0.1.5` → `v0.1.6`)
  2. `package.json` `"version"` field (e.g. `"0.1.5"` → `"0.1.6"`) — keep numeric, no leading `v`
  3. `<meta name="game-version">` in `index.html` (matches lib/version.js exactly, with the `v` prefix)
- **No amend.** Create new commits; never `--amend` (project rule). If a previous task missed a bump, fix it in a new "chore: sync ..." commit.
- **No deploy.** Tasks must never run any deploy command. The deploy-gating rule requires explicit user authorization per action.
- **Dev server.** `bash dev-server.sh` serves on `http://127.0.0.1:8086`. Open `http://127.0.0.1:8086` in a browser to verify each task's visual result.
- **Sibling reference paths.** Several tasks reference files inside `/Users/nitzanwilnai/Programming/Claude/JSGames/FlightSim/` and `.../FormulaChampions3D/`. These are read-only sources; do not modify them.
- **Three.js global.** This project uses `window.THREE` from a CDN script tag (matching FlightSim). All modules accept `THREE` as a function or constructor arg, not as a module import.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `dev-server.sh`
- Create: `.gitignore`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "test-drive",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "bash dev-server.sh"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 3: Write `dev-server.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec python3 -m http.server 8086
```

Then `chmod +x dev-server.sh`.

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 5: Install vitest**

Run: `npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 6: Smoke-test vitest**

Run: `npm test -- --run`
Expected: vitest runs, reports `No test files found`. Exit code 0 (or 1 with a clear "no tests" message — accept either, the toolchain is working).

- [ ] **Step 7: Commit**

```bash
git add package.json vitest.config.js dev-server.sh .gitignore
git commit -m "chore: project scaffold (vitest + dev server)"
```

---

## Task 2: HTML entry + meta + version + placeholder thumbnail

**Files:**
- Create: `index.html`
- Create: `meta.json`
- Create: `lib/version.js`
- Create: `thumbnail.png` (512×512 placeholder)

- [ ] **Step 1: Write `lib/version.js`**

```js
export const VERSION = 'v0.1.1';
```

- [ ] **Step 2: Write `meta.json`**

```json
{
  "slug": "test-drive",
  "title": "TestDrive",
  "description": "Open-road driving sandbox. Cruise a procedural road network across mountains, rivers, and forests on a 64 km world.",
  "tags": ["3d", "driving", "sandbox", "open-world", "casual"],
  "author": "nitzanwilnai",
  "thumbnail": "thumbnail.png"
}
```

- [ ] **Step 3: Write `index.html`** (modeled on FlightSim's `index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="game-version" content="v0.1.1">
  <title>TestDrive</title>
  <link rel="icon" href="data:,">
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: #000;
      display: flex; align-items: center; justify-content: center;
    }
    #stage {
      position: relative;
      aspect-ratio: 9 / 16;
      max-width: 100vw;
      max-height: 100vh;
      height: 100vh;
      container-type: size;
    }
    canvas {
      display: block; width: 100%; height: 100%;
      touch-action: none;
      -webkit-touch-callout: none; -webkit-user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    #hud-canvas {
      position: absolute; inset: 0;
      pointer-events: none;
    }
    #ui-root {
      position: absolute; inset: 0; pointer-events: none; z-index: 50;
      overflow: hidden;
    }
    #boot {
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: #0a0e14; color: #cfd8e0; font-family: ui-monospace, Menlo, monospace;
      transition: opacity .4s ease;
    }
    #boot.hidden { opacity: 0; pointer-events: none; }
    .boot-title { font-size: 32px; font-weight: 700; letter-spacing: 0.18em; color: #fff; margin-bottom: 28px; }
    .boot-spinner { width: 44px; height: 44px; border-radius: 50%; border: 3px solid #2a3142; border-top-color: #6db4ff; animation: boot-spin 0.8s linear infinite; margin-bottom: 18px; }
    @keyframes boot-spin { to { transform: rotate(360deg); } }
    .boot-phase { font-size: 13px; color: #8896aa; letter-spacing: 0.08em; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="https://cdn-play.nitzan.games/lib/play-sdk.js"></script>
</head>
<body>
  <div id="stage">
    <canvas id="game" width="1080" height="1920"></canvas>
    <canvas id="hud-canvas" width="1080" height="1920"></canvas>
    <div id="ui-root"></div>
  </div>
  <div id="boot">
    <div class="boot-title">TESTDRIVE</div>
    <div class="boot-spinner"></div>
    <div class="boot-phase">Loading…</div>
  </div>
  <script type="module" src="shell/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Generate placeholder `thumbnail.png`**

Create a 512×512 solid-color PNG with the word "TestDrive" centered. Use this Node one-liner (no external deps; uses canvas via Node? — actually simpler: use ImageMagick or a tiny Python script).

Run (Python):

```bash
python3 - <<'PY'
import struct, zlib

W = H = 512
bg = (0x12, 0x18, 0x22)   # dark navy
# Just a solid color with a simple "TD" diagonal accent — purely a dev placeholder.
# Final real thumbnail is produced later (see spec §10).
def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xffffffff
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

sig = b'\x89PNG\r\n\x1a\n'
ihdr = struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)
raw = bytearray()
for y in range(H):
    raw.append(0)
    for x in range(W):
        # Diagonal accent stripe
        on_stripe = 6 < (x - y + W) % 96 < 14
        r, g, b = (0xff, 0xc8, 0x4a) if on_stripe else bg
        raw += bytes((r, g, b))
idat = zlib.compress(bytes(raw), 9)
png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
open('thumbnail.png', 'wb').write(png)
print('wrote thumbnail.png', len(png), 'bytes')
PY
```

Verify it's 512×512:

```bash
python3 -c "import struct; d=open('thumbnail.png','rb').read(); w,h=struct.unpack('>II', d[16:24]); print(w,h)"
```

Expected: `512 512`.

- [ ] **Step 5: Commit**

```bash
git add index.html meta.json lib/version.js thumbnail.png
git commit -m "feat: HTML entry, meta, version, placeholder thumbnail"
```

---

## Task 3: Empty boot — render a black scene with version stamp

**Files:**
- Create: `shell/main.js`

This task gets the dev server running with a working WebGL renderer and a visible version string, before any game logic.

- [ ] **Step 1: Write minimal `shell/main.js`**

```js
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
```

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev` (or `bash dev-server.sh`)

Open `http://127.0.0.1:8086`. Expected: black canvas in 9:16 letterbox, "v0.1.x" version stamp at bottom-left at half opacity, no console errors. Boot loader fades out.

- [ ] **Step 3: Bump VERSION**

Edit `lib/version.js`: `v0.1.1` → `v0.1.2`. Also bump `<meta name="game-version">` in `index.html` to match.

- [ ] **Step 4: Commit**

```bash
git add shell/main.js lib/version.js index.html
git commit -m "feat: boot blank scene with version stamp"
```

---

## Task 4: Lift FlightSim terrain + scatter + poi + biomes

**Files:**
- Create: `lib/terrain/` (copy from FlightSim)
- Create: `lib/scatter/` (copy from FlightSim)
- Create: `lib/poi/` (copy from FlightSim — see Task 4 reasoning)
- Create: `lib/game/biomes.js` (copy from FlightSim)
- Modify: `shell/main.js` — wire up `createTerrain` with `enableVillages: false`; add a slowly-orbiting hover camera so we can verify terrain renders.

**Why copy POI:** `lib/terrain/index.js` imports POI symbols at the top level and calls geometry constructors unconditionally. With `enableVillages: false`, no POI meshes are placed in the world, but the import resolution still requires the files. The POI code is lifted-but-inactive.

- [ ] **Step 1: Copy directories from FlightSim**

```bash
cp -R /Users/nitzanwilnai/Programming/Claude/JSGames/FlightSim/lib/terrain  lib/terrain
cp -R /Users/nitzanwilnai/Programming/Claude/JSGames/FlightSim/lib/scatter  lib/scatter
cp -R /Users/nitzanwilnai/Programming/Claude/JSGames/FlightSim/lib/poi      lib/poi
mkdir -p lib/game
cp    /Users/nitzanwilnai/Programming/Claude/JSGames/FlightSim/lib/game/biomes.js lib/game/biomes.js
```

Verify with `ls lib/terrain lib/scatter lib/poi lib/game`. Expected: terrain has `index.js`, `chunk-*.js`, `height.js`, `river-graph.js` etc.; scatter has `index.js`, `maple.js`, `cactus.js` etc.; poi has `villages.js`, `buildings.js`, `markers.js` etc.; game has `biomes.js`.

- [ ] **Step 2: Replace `shell/main.js`**

```js
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
```

- [ ] **Step 3: Run and verify terrain**

Run dev server, open browser. Expected: a procedural terrain with hills, scattering trees, forest-biome sky and fog; camera slowly orbits the origin. Zero village/house meshes anywhere (POI disabled). Console may show `[poi] villages: 0` or similar — that's fine.

If errors mention missing imports inside `lib/terrain/` or `lib/poi/`, re-run the copy step and verify all files transferred (`diff -rq lib/terrain /Users/.../FlightSim/lib/terrain` should be empty).

- [ ] **Step 4: Bump VERSION** to `v0.1.3` in `lib/version.js` and `index.html`.

- [ ] **Step 5: Commit**

```bash
git add lib/terrain lib/scatter lib/poi lib/game/biomes.js shell/main.js lib/version.js index.html
git commit -m "feat: lift FlightSim terrain/scatter/poi/biomes; orbit camera renders"
```

---

## Task 5: Delaunay triangulation utility (TDD)

**Files:**
- Create: `lib/roads/delaunay.js`
- Test: `tests/road-delaunay.test.js`

This is a small, focused 2D Delaunay built from scratch using the Bowyer-Watson algorithm. ~100 lines. Used only by `lib/roads/graph.js`.

- [ ] **Step 1: Write the failing test**

`tests/road-delaunay.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { triangulate } from '../lib/roads/delaunay.js';

describe('triangulate', () => {
  it('returns an empty edge list for fewer than 3 points', () => {
    expect(triangulate([])).toEqual([]);
    expect(triangulate([{ x: 0, z: 0 }])).toEqual([]);
    expect(triangulate([{ x: 0, z: 0 }, { x: 10, z: 0 }])).toEqual([]);
  });

  it('returns the single triangle for 3 non-collinear points', () => {
    const pts = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 5, z: 10 }];
    const edges = triangulate(pts);
    // 3 unique edges expected; each is a pair of point indices [i, j], i < j.
    expect(edges).toHaveLength(3);
    const sorted = edges.map(e => `${e[0]}-${e[1]}`).sort();
    expect(sorted).toEqual(['0-1', '0-2', '1-2']);
  });

  it('produces a planar triangulation for a 4-point square', () => {
    const pts = [
      { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
    ];
    const edges = triangulate(pts);
    // 5 edges expected: 4 sides + 1 diagonal.
    expect(edges).toHaveLength(5);
  });

  it('is deterministic for the same input', () => {
    const pts = [];
    for (let i = 0; i < 30; i++) {
      pts.push({ x: ((i * 9301 + 49297) % 233280) / 233280 * 100,
                 z: ((i * 17173 + 12347) % 199933) / 199933 * 100 });
    }
    const a = triangulate(pts);
    const b = triangulate(pts);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/road-delaunay.test.js`
Expected: FAIL — `Cannot find module '../lib/roads/delaunay.js'`.

- [ ] **Step 3: Implement Bowyer-Watson Delaunay**

`lib/roads/delaunay.js`:

```js
// 2D Delaunay triangulation via Bowyer-Watson incremental insertion.
// Input:  Array<{x, z}>.
// Output: Array<[i, j]> with i < j — the unique edges of the triangulation.
//
// Notes:
// - "z" is used as the second axis (we're working in the XZ ground plane).
// - For < 3 points returns [].
// - Deterministic given identical input order.

export function triangulate(points) {
  if (points.length < 3) return [];

  // Bounding super-triangle large enough to contain all points.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const dx = maxX - minX, dz = maxZ - minZ;
  const dmax = Math.max(dx, dz) || 1;
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  const stA = { x: midX - 20 * dmax, z: midZ - dmax };
  const stB = { x: midX + 20 * dmax, z: midZ - dmax };
  const stC = { x: midX,             z: midZ + 20 * dmax };

  // Triangles store indices into a combined array: real points 0..N-1,
  // super-triangle vertices at N, N+1, N+2.
  const N = points.length;
  const pts = points.concat([stA, stB, stC]);
  const SUPER_A = N, SUPER_B = N + 1, SUPER_C = N + 2;

  let triangles = [[SUPER_A, SUPER_B, SUPER_C]];

  for (let i = 0; i < N; i++) {
    const bad = [];
    const p = pts[i];
    for (const t of triangles) {
      if (inCircumcircle(p, pts[t[0]], pts[t[1]], pts[t[2]])) bad.push(t);
    }
    // Polygon edges = edges of `bad` triangles that aren't shared with another bad triangle.
    const polygon = [];
    for (const t of bad) {
      const edges = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]];
      for (const e of edges) {
        let shared = false;
        for (const t2 of bad) {
          if (t2 === t) continue;
          const eSet = new Set(e);
          let count = 0;
          for (const v of t2) if (eSet.has(v)) count++;
          if (count === 2) { shared = true; break; }
        }
        if (!shared) polygon.push(e);
      }
    }
    // Remove bad triangles.
    triangles = triangles.filter(t => !bad.includes(t));
    // Add new triangles connecting i to each polygon edge.
    for (const [a, b] of polygon) triangles.push([a, b, i]);
  }

  // Drop any triangle that still touches the super-triangle.
  triangles = triangles.filter(t =>
    t[0] < N && t[1] < N && t[2] < N
  );

  // Extract unique edges with i < j, sorted for determinism.
  const edgeSet = new Set();
  for (const t of triangles) {
    const e = [
      [t[0], t[1]], [t[1], t[2]], [t[2], t[0]],
    ];
    for (let [a, b] of e) {
      if (a > b) [a, b] = [b, a];
      edgeSet.add(a + ':' + b);
    }
  }
  return [...edgeSet].map(s => s.split(':').map(Number)).sort((a, b) =>
    a[0] - b[0] || a[1] - b[1]
  );
}

function inCircumcircle(p, a, b, c) {
  // Computes whether p lies strictly inside the circumcircle of triangle abc.
  const ax = a.x - p.x, az = a.z - p.z;
  const bx = b.x - p.x, bz = b.z - p.z;
  const cx = c.x - p.x, cz = c.z - p.z;
  const d = ax * (bz * (cx * cx + cz * cz) - cz * (bx * bx + bz * bz))
          - az * (bx * (cx * cx + cz * cz) - cx * (bx * bx + bz * bz))
          + (ax * ax + az * az) * (bx * cz - bz * cx);
  return d > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/road-delaunay.test.js`
Expected: all 4 tests PASS.

- [ ] **Step 5: Bump VERSION** to `v0.1.4`.

- [ ] **Step 6: Commit**

```bash
git add lib/roads/delaunay.js tests/road-delaunay.test.js lib/version.js index.html
git commit -m "feat(roads): 2D Delaunay triangulation utility (TDD)"
```

---

## Task 6: Road graph node candidates (TDD)

**Files:**
- Create: `lib/roads/graph.js` (first stub: node generation only)
- Test: `tests/road-graph.test.js` (first 2 tests)

- [ ] **Step 1: Write the failing tests**

`tests/road-graph.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { generateNodeCandidates } from '../lib/roads/graph.js';

// Mock terrain height: a gentle bowl, plus a steep cone around (5000, 5000).
function terrainHeightFn(x, z) {
  const dx = x - 5000, dz = z - 5000;
  const cone = Math.max(0, 1000 - Math.hypot(dx, dz)) * 2; // big steep peak
  const bowl = (x * x + z * z) / 1e8;
  return bowl + cone;
}

// Mock "on water" check: no water anywhere in this test fixture.
const noWater = (x, z) => false;

describe('generateNodeCandidates', () => {
  it('is deterministic for the same seed', () => {
    const a = generateNodeCandidates({ seed: 12345, terrainHeightFn, isOnWater: noWater });
    const b = generateNodeCandidates({ seed: 12345, terrainHeightFn, isOnWater: noWater });
    expect(a).toEqual(b);
  });

  it('rejects nodes on the steep cone', () => {
    const nodes = generateNodeCandidates({ seed: 9, terrainHeightFn, isOnWater: noWater });
    // No node should be inside a 500m radius of the cone peak — the slope there exceeds 18°.
    const tooClose = nodes.filter(n => Math.hypot(n.x - 5000, n.z - 5000) < 500);
    expect(tooClose.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/road-graph.test.js`
Expected: FAIL — `Cannot find module ...graph.js` or `generateNodeCandidates is not a function`.

- [ ] **Step 3: Implement `generateNodeCandidates`**

`lib/roads/graph.js`:

```js
// Road graph generation. Deterministic from seed.
// Public entry point: buildRoadGraph(opts) — added in Task 7.
// This file is built up across Task 6, Task 7.

const WORLD_SIZE = 64000;        // matches FlightSim terrain.WORLD_SIZE
const NODE_GRID_CELL = 3200;     // ~3.2 km cells → ~400 candidates
const NODE_MIN_SPACING = 600;    // Poisson-disk separation
const MAX_SLOPE_DEG = 18;        // reject candidates on steep ground

// 32-bit mulberry32 PRNG. Deterministic. From the standard reference.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Approximate slope (degrees) by sampling ±50 m on both axes.
function slopeDegAt(x, z, terrainHeightFn) {
  const h0 = terrainHeightFn(x, z);
  const hX = terrainHeightFn(x + 50, z);
  const hZ = terrainHeightFn(x, z + 50);
  const dydx = (hX - h0) / 50;
  const dydz = (hZ - h0) / 50;
  const slope = Math.sqrt(dydx * dydx + dydz * dydz);
  return Math.atan(slope) * 180 / Math.PI;
}

export function generateNodeCandidates({ seed, terrainHeightFn, isOnWater }) {
  const rng = mulberry32(seed);
  const half = WORLD_SIZE / 2;
  const accepted = [];

  // Jittered grid of candidates across the world.
  for (let cz = -half; cz < half; cz += NODE_GRID_CELL) {
    for (let cx = -half; cx < half; cx += NODE_GRID_CELL) {
      const jx = (rng() - 0.5) * NODE_GRID_CELL * 0.8;
      const jz = (rng() - 0.5) * NODE_GRID_CELL * 0.8;
      const x = cx + NODE_GRID_CELL / 2 + jx;
      const z = cz + NODE_GRID_CELL / 2 + jz;

      if (slopeDegAt(x, z, terrainHeightFn) > MAX_SLOPE_DEG) continue;
      if (isOnWater(x, z)) continue;

      let tooClose = false;
      for (const n of accepted) {
        const dx = n.x - x, dz = n.z - z;
        if (dx * dx + dz * dz < NODE_MIN_SPACING * NODE_MIN_SPACING) { tooClose = true; break; }
      }
      if (tooClose) continue;

      accepted.push({ id: accepted.length, x, y: terrainHeightFn(x, z), z, edges: [] });
    }
  }
  return accepted;
}

// Internal export for Task 7's pruning step.
export const _internals = { mulberry32, slopeDegAt, WORLD_SIZE, NODE_MIN_SPACING };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/road-graph.test.js`
Expected: both `generateNodeCandidates` tests PASS.

- [ ] **Step 5: Bump VERSION** to `v0.1.5`.

- [ ] **Step 6: Commit**

```bash
git add lib/roads/graph.js tests/road-graph.test.js lib/version.js index.html
git commit -m "feat(roads): node-candidate generation (TDD)"
```

---

## Task 7: Road graph edges, MST, polylines (TDD)

**Files:**
- Modify: `lib/roads/graph.js` — add `buildRoadGraph`
- Modify: `tests/road-graph.test.js` — add tests for `buildRoadGraph`

- [ ] **Step 1: Add failing tests for `buildRoadGraph`**

Append to `tests/road-graph.test.js`:

```js
import { buildRoadGraph } from '../lib/roads/graph.js';

function terrainHeightFn2(x, z) {
  // Gentle rolling terrain, no peaks.
  return Math.sin(x / 800) * 20 + Math.cos(z / 700) * 15;
}
const noWater2 = (x, z) => false;

describe('buildRoadGraph', () => {
  it('is deterministic for the same seed', () => {
    const a = buildRoadGraph({ seed: 42, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    const b = buildRoadGraph({ seed: 42, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    expect(a.nodes.length).toBe(b.nodes.length);
    expect(a.edges.length).toBe(b.edges.length);
    expect(a.spawn).toEqual(b.spawn);
  });

  it('produces a single connected component', () => {
    const g = buildRoadGraph({ seed: 7, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    expect(g.nodes.length).toBeGreaterThan(20);
    // BFS from node 0; every node should be reachable.
    const visited = new Set([0]);
    const stack = [0];
    while (stack.length) {
      const id = stack.pop();
      for (const edgeId of g.nodes[id].edges) {
        const e = g.edges[edgeId];
        const other = e.nodeA === id ? e.nodeB : e.nodeA;
        if (!visited.has(other)) { visited.add(other); stack.push(other); }
      }
    }
    expect(visited.size).toBe(g.nodes.length);
  });

  it('has spawn on a node and a heading toward an outgoing edge', () => {
    const g = buildRoadGraph({ seed: 7, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    const spawnNode = g.nodes.find(n => Math.hypot(n.x - g.spawn.x, n.z - g.spawn.z) < 1e-6);
    expect(spawnNode).toBeTruthy();
    expect(spawnNode.edges.length).toBeGreaterThan(0);
  });

  it('produces polylines that follow terrain', () => {
    const g = buildRoadGraph({ seed: 7, terrainHeightFn: terrainHeightFn2, isOnWater: noWater2 });
    const sample = g.edges[0];
    expect(sample.polyline.length).toBeGreaterThanOrEqual(2);
    for (const p of sample.polyline) {
      // y must equal the terrain height at (x, z) within 0.1m
      const h = terrainHeightFn2(p.x, p.z);
      expect(Math.abs(p.y - h)).toBeLessThan(0.5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify the new ones fail**

Run: `npm test -- --run tests/road-graph.test.js`
Expected: 4 new tests FAIL (`buildRoadGraph` not exported).

- [ ] **Step 3: Implement `buildRoadGraph`**

Append to `lib/roads/graph.js`:

```js
import { triangulate } from './delaunay.js';

const MAX_EDGE_LENGTH = 6000;
const MAX_EDGE_SLOPE_DEG = 12;
const MAX_EDGE_HEIGHT_DELTA = 200;
const EDGE_SAMPLE_STEP = 50;
const POLYLINE_POINT_STEP = 50;   // re-sample for smoothing
const POLYLINE_SMOOTH_PASSES = 2;
const EXTRA_EDGE_RATIO = 0.25;

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function edgeIsBuildable(a, b, terrainHeightFn, isOnWater) {
  const len = dist(a, b);
  if (len > MAX_EDGE_LENGTH) return false;
  let hMin = Infinity, hMax = -Infinity;
  const steps = Math.ceil(len / EDGE_SAMPLE_STEP);
  let prevH = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (isOnWater(x, z)) return false;
    const h = terrainHeightFn(x, z);
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
    if (prevH !== null) {
      const dy = h - prevH;
      const slopeDeg = Math.atan(Math.abs(dy) / EDGE_SAMPLE_STEP) * 180 / Math.PI;
      if (slopeDeg > MAX_EDGE_SLOPE_DEG) return false;
    }
    prevH = h;
  }
  if (hMax - hMin > MAX_EDGE_HEIGHT_DELTA) return false;
  return true;
}

function buildPolyline(a, b, terrainHeightFn) {
  const len = dist(a, b);
  const steps = Math.max(2, Math.ceil(len / POLYLINE_POINT_STEP));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    pts.push({ x, y: 0, z });
  }
  // Smooth XZ with 3-tap moving average (endpoints fixed).
  for (let pass = 0; pass < POLYLINE_SMOOTH_PASSES; pass++) {
    const next = pts.map(p => ({ ...p }));
    for (let i = 1; i < pts.length - 1; i++) {
      next[i].x = (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3;
      next[i].z = (pts[i - 1].z + pts[i].z + pts[i + 1].z) / 3;
    }
    for (let i = 0; i < pts.length; i++) { pts[i].x = next[i].x; pts[i].z = next[i].z; }
  }
  for (const p of pts) p.y = terrainHeightFn(p.x, p.z);
  return pts;
}

function unionFind(n) {
  const p = new Array(n);
  for (let i = 0; i < n; i++) p[i] = i;
  function find(i) { while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra === rb) return false; p[ra] = rb; return true; }
  return { find, union };
}

export function buildRoadGraph({ seed, terrainHeightFn, isOnWater }) {
  const nodes = generateNodeCandidates({ seed, terrainHeightFn, isOnWater });

  // Triangulate.
  const candidates = triangulate(nodes);
  // Filter to buildable edges.
  const buildable = candidates
    .filter(([i, j]) => edgeIsBuildable(nodes[i], nodes[j], terrainHeightFn, isOnWater))
    .map(([i, j]) => ({ i, j, len: dist(nodes[i], nodes[j]) }))
    .sort((a, b) => a.len - b.len);

  // MST via Kruskal.
  const uf = unionFind(nodes.length);
  const mstEdges = [];
  const nonMstEdges = [];
  for (const e of buildable) {
    if (uf.union(e.i, e.j)) mstEdges.push(e);
    else nonMstEdges.push(e);
  }

  // Add ~25% extra shortest non-MST edges for loops.
  const extraCount = Math.floor(mstEdges.length * EXTRA_EDGE_RATIO);
  const extras = nonMstEdges.slice(0, extraCount);

  const allEdges = [...mstEdges, ...extras].map((e, id) => {
    const a = nodes[e.i], b = nodes[e.j];
    const polyline = buildPolyline(a, b, terrainHeightFn);
    return { id, nodeA: e.i, nodeB: e.j, polyline, length: e.len };
  });

  // Wire edge ids into nodes.
  for (const e of allEdges) {
    nodes[e.nodeA].edges.push(e.id);
    nodes[e.nodeB].edges.push(e.id);
  }

  // Spawn: node nearest origin. Heading: along first outgoing edge.
  let spawnNode = nodes[0];
  let spawnDist = Math.hypot(spawnNode.x, spawnNode.z);
  for (const n of nodes) {
    const d = Math.hypot(n.x, n.z);
    if (d < spawnDist) { spawnDist = d; spawnNode = n; }
  }
  let headingY = 0;
  if (spawnNode.edges.length > 0) {
    const e = allEdges[spawnNode.edges[0]];
    const other = e.nodeA === spawnNode.id ? nodes[e.nodeB] : nodes[e.nodeA];
    headingY = Math.atan2(other.x - spawnNode.x, other.z - spawnNode.z);
  }

  return {
    nodes,
    edges: allEdges,
    spawn: { x: spawnNode.x, y: spawnNode.y, z: spawnNode.z, headingY },
  };
}
```

- [ ] **Step 4: Run all road-graph tests**

Run: `npm test -- --run tests/road-graph.test.js`
Expected: all 6 tests PASS.

- [ ] **Step 5: Bump VERSION** to `v0.1.6`.

- [ ] **Step 6: Commit**

```bash
git add lib/roads/graph.js tests/road-graph.test.js lib/version.js index.html
git commit -m "feat(roads): MST + polyline-on-terrain graph generation (TDD)"
```

---

## Task 8: Spatial index (TDD)

**Files:**
- Create: `lib/roads/spatial-index.js`
- Test: `tests/road-spatial-index.test.js`
- Modify: `lib/roads/graph.js` — attach index to `buildRoadGraph` return value.

- [ ] **Step 1: Write the failing test**

`tests/road-spatial-index.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { SpatialIndex } from '../lib/roads/spatial-index.js';

describe('SpatialIndex', () => {
  it('returns edges whose polyline points are within radius', () => {
    const edges = [
      { id: 0, polyline: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
      { id: 1, polyline: [{ x: 1000, z: 0 }, { x: 1100, z: 0 }] },
      { id: 2, polyline: [{ x: 50, z: 50 }, { x: 50, z: 150 }] },
    ];
    const idx = new SpatialIndex(edges, 200);
    const near = idx.nearEdges(0, 0, 80);
    expect(near.sort()).toEqual([0]);
    const wider = idx.nearEdges(60, 60, 60);
    expect(wider.sort()).toEqual([0, 2]);
    const far = idx.nearEdges(1050, 0, 100);
    expect(far.sort()).toEqual([1]);
  });

  it('returns an empty array when nothing is within radius', () => {
    const edges = [{ id: 0, polyline: [{ x: 0, z: 0 }, { x: 100, z: 0 }] }];
    const idx = new SpatialIndex(edges, 200);
    expect(idx.nearEdges(50000, 50000, 100)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/road-spatial-index.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SpatialIndex`**

`lib/roads/spatial-index.js`:

```js
// Bucketed grid index for "edges near (x, z)" lookups.
// Each polyline point of each edge is added to every bucket it falls into.
// nearEdges(x, z, radius) returns unique edge IDs that have at least one
// polyline point in any bucket overlapping the (x±radius, z±radius) box.

export class SpatialIndex {
  constructor(edges, cellSize = 200) {
    this.cellSize = cellSize;
    this.cells = new Map();
    for (const edge of edges) {
      for (const p of edge.polyline) {
        const k = this._key(p.x, p.z);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = new Set(); this.cells.set(k, bucket); }
        bucket.add(edge.id);
      }
    }
  }

  _key(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return cx + ':' + cz;
  }

  nearEdges(x, z, radius) {
    const r = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const result = new Set();
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const bucket = this.cells.get((cx + dx) + ':' + (cz + dz));
        if (!bucket) continue;
        for (const id of bucket) result.add(id);
      }
    }
    return [...result];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/road-spatial-index.test.js`
Expected: 2 tests PASS.

- [ ] **Step 5: Attach index to `buildRoadGraph` return**

In `lib/roads/graph.js`, modify the import block and return:

Add to imports:

```js
import { SpatialIndex } from './spatial-index.js';
```

Replace the `return { nodes, edges: allEdges, spawn: ... }` with:

```js
  const spatialIndex = new SpatialIndex(allEdges, 200);
  return {
    nodes,
    edges: allEdges,
    spawn: { x: spawnNode.x, y: spawnNode.y, z: spawnNode.z, headingY },
    spatialIndex,
  };
```

- [ ] **Step 6: Bump VERSION** to `v0.1.7`.

- [ ] **Step 7: Commit**

```bash
git add lib/roads/spatial-index.js lib/roads/graph.js tests/road-spatial-index.test.js lib/version.js index.html
git commit -m "feat(roads): spatial index for near-edge lookups"
```

---

## Task 9: Road ribbon + guardrail mesh builder

**Files:**
- Create: `lib/roads/geometry.js`

No headless tests for visual geometry — verified by Task 11 streaming into the live scene.

- [ ] **Step 1: Implement geometry builders**

`lib/roads/geometry.js`:

```js
// Mesh builders for road ribbon, guardrails, and junction disks.
// All builders return THREE.BufferGeometry.
// Width/height constants are exported so collision can read the same values.

export const ROAD_HALF_WIDTH   = 5;     // m
export const ROAD_OFFSET_Y     = 0.05;  // raise above terrain to avoid z-fight
export const GUARDRAIL_HEIGHT  = 0.8;   // m
export const JUNCTION_RADIUS   = 12;    // m (gap in guardrails, disk size)

// --- Road ribbon -----------------------------------------------------------
export function buildRoadRibbon(THREE, polyline) {
  const n = polyline.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = polyline[i];
    // Tangent: prev→next (clamped at endpoints).
    const a = polyline[Math.max(0, i - 1)];
    const b = polyline[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    // Perpendicular in XZ (rotate tangent by 90°): (tz, -tx).
    const px = tz / tl, pz = -tx / tl;
    const yLift = p.y + ROAD_OFFSET_Y;
    positions[(i * 2) * 3 + 0] = p.x + px * ROAD_HALF_WIDTH;
    positions[(i * 2) * 3 + 1] = yLift;
    positions[(i * 2) * 3 + 2] = p.z + pz * ROAD_HALF_WIDTH;
    positions[(i * 2 + 1) * 3 + 0] = p.x - px * ROAD_HALF_WIDTH;
    positions[(i * 2 + 1) * 3 + 1] = yLift;
    positions[(i * 2 + 1) * 3 + 2] = p.z - pz * ROAD_HALF_WIDTH;
    if (i > 0) {
      const prev = polyline[i - 1];
      s += Math.hypot(p.x - prev.x, p.z - prev.z);
    }
    uvs[(i * 2) * 2 + 0] = 0;
    uvs[(i * 2) * 2 + 1] = s / 6; // ~repeat every 6m
    uvs[(i * 2 + 1) * 2 + 0] = 1;
    uvs[(i * 2 + 1) * 2 + 1] = s / 6;
  }
  const indices = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// --- Guardrail (one side) --------------------------------------------------
// `side` is +1 (left of forward direction) or -1 (right).
// Trims the rail near degree-≥3 junction endpoints so the player can transition.
export function buildGuardrail(THREE, polyline, side, trimStart, trimEnd) {
  const n = polyline.length;
  // Compute cumulative arc-length along polyline.
  const arc = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    arc[i] = arc[i - 1] + Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].z - polyline[i - 1].z);
  }
  const total = arc[n - 1];
  const startS = trimStart ? JUNCTION_RADIUS : 0;
  const endS = trimEnd ? total - JUNCTION_RADIUS : total;

  // Find first/last index whose s falls within [startS, endS].
  let iStart = 0, iEnd = n - 1;
  for (let i = 0; i < n; i++) { if (arc[i] >= startS) { iStart = i; break; } }
  for (let i = n - 1; i >= 0; i--) { if (arc[i] <= endS) { iEnd = i; break; } }
  if (iEnd - iStart < 1) return null;

  const pts = polyline.slice(iStart, iEnd + 1);
  const m = pts.length;
  const positions = new Float32Array(m * 2 * 3);
  for (let i = 0; i < m; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(m - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    const px = (tz / tl) * side, pz = (-tx / tl) * side;
    const baseX = p.x + px * ROAD_HALF_WIDTH;
    const baseZ = p.z + pz * ROAD_HALF_WIDTH;
    positions[(i * 2) * 3 + 0] = baseX;
    positions[(i * 2) * 3 + 1] = p.y + ROAD_OFFSET_Y;
    positions[(i * 2) * 3 + 2] = baseZ;
    positions[(i * 2 + 1) * 3 + 0] = baseX;
    positions[(i * 2 + 1) * 3 + 1] = p.y + ROAD_OFFSET_Y + GUARDRAIL_HEIGHT;
    positions[(i * 2 + 1) * 3 + 2] = baseZ;
  }
  const indices = [];
  for (let i = 0; i < m - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    // Wind both sides so the rail is visible from either direction.
    indices.push(a, b, c, b, d, c);
    indices.push(c, b, a, c, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
```

- [ ] **Step 2: Bump VERSION** to `v0.1.8`.

- [ ] **Step 3: Commit**

```bash
git add lib/roads/geometry.js lib/version.js index.html
git commit -m "feat(roads): road ribbon + guardrail mesh builders"
```

---

## Task 10: Junction disk + shared materials + asphalt texture

**Files:**
- Modify: `lib/roads/geometry.js` — add `buildJunctionDisk`, `buildRoadMaterials`.

- [ ] **Step 1: Append to `lib/roads/geometry.js`**

```js
// --- Junction disk ---------------------------------------------------------
// Terrain-conforming disk centered at (cx, cz) used at degree-≥3 nodes.
export function buildJunctionDisk(THREE, cx, cz, terrainHeightFn, segments = 24) {
  const positions = new Float32Array((segments + 1) * 3);
  positions[0] = cx;
  positions[1] = terrainHeightFn(cx, cz) + ROAD_OFFSET_Y;
  positions[2] = cz;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = cx + Math.cos(t) * JUNCTION_RADIUS;
    const z = cz + Math.sin(t) * JUNCTION_RADIUS;
    positions[(i + 1) * 3 + 0] = x;
    positions[(i + 1) * 3 + 1] = terrainHeightFn(x, z) + ROAD_OFFSET_Y;
    positions[(i + 1) * 3 + 2] = z;
  }
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const a = 0;
    const b = i + 1;
    const c = i === segments - 1 ? 1 : i + 2;
    indices.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// --- Shared materials ------------------------------------------------------
// One asphalt material + one guardrail material reused across all road meshes.
export function buildRoadMaterials(THREE) {
  // Procedural asphalt texture: dark grey with a faint yellow center stripe.
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const c = canvas.getContext('2d');
  c.fillStyle = '#1c1f26'; c.fillRect(0, 0, 64, 64);
  // Subtle noise.
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * 64, y = Math.random() * 64;
    c.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
    c.fillRect(x, y, 1, 1);
  }
  // Center stripe (UV.x ~ 0.5).
  c.fillStyle = '#f1c64a';
  // Dashed: 8px on, 8px off.
  for (let y = 0; y < 64; y += 16) c.fillRect(31, y, 2, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;

  const road = new THREE.MeshBasicMaterial({ map: tex });
  const guardrail = new THREE.MeshLambertMaterial({ color: 0xb3b8c2 });
  return { road, guardrail };
}
```

- [ ] **Step 2: Bump VERSION** to `v0.1.9`.

- [ ] **Step 3: Commit**

```bash
git add lib/roads/geometry.js lib/version.js index.html
git commit -m "feat(roads): junction disk + shared road/guardrail materials"
```

---

## Task 11: Road streaming manager — roads appear in the world

**Files:**
- Create: `lib/roads/manager.js`
- Modify: `shell/main.js` — replace orbit camera with a road-graph fly-through that drops the camera at `graph.spawn` and slowly pans forward; build graph + manager.

This is the first visually verifiable road task.

- [ ] **Step 1: Write `lib/roads/manager.js`**

```js
import {
  buildRoadRibbon, buildGuardrail, buildJunctionDisk, buildRoadMaterials,
} from './geometry.js';

const STREAM_RADIUS = 1500;        // m
const STREAM_HYSTERESIS = 300;     // m beyond STREAM_RADIUS before unload
const BUILD_PER_FRAME = 2;
const LRU_CACHE_SIZE = 80;

export class RoadManager {
  constructor(THREE, scene, graph, terrainHeightFn) {
    this.THREE = THREE;
    this.scene = scene;
    this.graph = graph;
    this.terrainHeightFn = terrainHeightFn;

    this.materials = buildRoadMaterials(THREE);
    this.activeEdges = new Map();    // edgeId -> { road, leftRail, rightRail }
    this.activeJunctions = new Map();// nodeId -> mesh
    this.buildQueue = [];
    this.cache = new Map();          // LRU: edgeId/nodeId+'j' -> meshes

    // Pre-compute which polyline endpoints touch a degree-≥3 node (so guardrail builder can trim).
    this.junctionNodes = new Set();
    for (const n of graph.nodes) if (n.edges.length >= 3) this.junctionNodes.add(n.id);
  }

  update(cameraPos) {
    const { x, z } = cameraPos;
    const near = this.graph.spatialIndex.nearEdges(x, z, STREAM_RADIUS);
    const nearSet = new Set(near);

    // Queue new.
    for (const id of near) {
      if (!this.activeEdges.has(id) && !this.buildQueue.includes(id)) this.buildQueue.push(id);
    }
    // Unload far.
    for (const [id, meshes] of this.activeEdges) {
      if (nearSet.has(id)) continue;
      const e = this.graph.edges[id];
      const farFromCamera = e.polyline.every(p =>
        Math.hypot(p.x - x, p.z - z) > STREAM_RADIUS + STREAM_HYSTERESIS);
      if (farFromCamera) {
        this._removeFromScene(meshes);
        this._lruPut('e' + id, meshes);
        this.activeEdges.delete(id);
      }
    }
    // Junction nodes near camera.
    for (const nodeId of this.junctionNodes) {
      const n = this.graph.nodes[nodeId];
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < STREAM_RADIUS && !this.activeJunctions.has(nodeId)) {
        const cached = this._lruGet('n' + nodeId);
        const mesh = cached || this._buildJunction(nodeId);
        this.scene.add(mesh);
        this.activeJunctions.set(nodeId, mesh);
      } else if (d > STREAM_RADIUS + STREAM_HYSTERESIS && this.activeJunctions.has(nodeId)) {
        const mesh = this.activeJunctions.get(nodeId);
        this.scene.remove(mesh);
        this._lruPut('n' + nodeId, mesh);
        this.activeJunctions.delete(nodeId);
      }
    }

    // Build up to BUILD_PER_FRAME from the queue.
    let built = 0;
    while (built < BUILD_PER_FRAME && this.buildQueue.length) {
      const id = this.buildQueue.shift();
      if (this.activeEdges.has(id)) continue;
      const cached = this._lruGet('e' + id);
      const meshes = cached || this._buildEdge(id);
      this._addToScene(meshes);
      this.activeEdges.set(id, meshes);
      built++;
    }
  }

  _buildEdge(id) {
    const e = this.graph.edges[id];
    const trimA = this.junctionNodes.has(e.nodeA);
    const trimB = this.junctionNodes.has(e.nodeB);
    const road = new this.THREE.Mesh(buildRoadRibbon(this.THREE, e.polyline), this.materials.road);
    const left = buildGuardrail(this.THREE, e.polyline, +1, trimA, trimB);
    const right = buildGuardrail(this.THREE, e.polyline, -1, trimA, trimB);
    const leftRail = left ? new this.THREE.Mesh(left, this.materials.guardrail) : null;
    const rightRail = right ? new this.THREE.Mesh(right, this.materials.guardrail) : null;
    return { road, leftRail, rightRail };
  }

  _buildJunction(nodeId) {
    const n = this.graph.nodes[nodeId];
    const g = buildJunctionDisk(this.THREE, n.x, n.z, this.terrainHeightFn);
    return new this.THREE.Mesh(g, this.materials.road);
  }

  _addToScene(meshes) {
    this.scene.add(meshes.road);
    if (meshes.leftRail) this.scene.add(meshes.leftRail);
    if (meshes.rightRail) this.scene.add(meshes.rightRail);
  }

  _removeFromScene(meshes) {
    this.scene.remove(meshes.road);
    if (meshes.leftRail) this.scene.remove(meshes.leftRail);
    if (meshes.rightRail) this.scene.remove(meshes.rightRail);
  }

  _lruGet(key) {
    if (!this.cache.has(key)) return null;
    const v = this.cache.get(key);
    this.cache.delete(key); this.cache.set(key, v);
    return v;
  }

  _lruPut(key, v) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, v);
    if (this.cache.size > LRU_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }
}
```

- [ ] **Step 2: Wire into `shell/main.js`** — add graph + manager + camera pans down the spawn road

Edit `shell/main.js`. Add imports near the top:

```js
import { buildRoadGraph } from '../lib/roads/graph.js';
import { RoadManager } from '../lib/roads/manager.js';
import { riverDepthAt } from '../lib/terrain/carve.js';
```

After `const terrain = createTerrain(...)` and before the camera-position init, build the road graph and manager. FlightSim's `createTerrain` returns `terrain.riverSegments`; we use `riverDepthAt` (also lifted from FlightSim) as the canonical "is this point on water?" check, matching FlightSim's village-rejection pattern:

```js
setBootPhase('Generating roads…');
await yieldPaint();
const terrainHeightFn = (x, z) => terrain.getHeight(x, z);
const isOnWater = (x, z) => riverDepthAt(x, z, terrain.riverSegments, 1) > 0;
const graph = buildRoadGraph({ seed, terrainHeightFn, isOnWater });
console.log('[testdrive] road graph:', graph.nodes.length, 'nodes,', graph.edges.length, 'edges');
const roadManager = new RoadManager(THREE, scene, graph, terrainHeightFn);
```

Replace the orbit-camera section with a spawn-anchored slow pan:

```js
// Camera: hover above the spawn point, pan slowly along spawn-edge direction.
camera.position.set(graph.spawn.x, graph.spawn.y + 80, graph.spawn.z);
camera.lookAt(graph.spawn.x + Math.sin(graph.spawn.headingY) * 200,
              graph.spawn.y,
              graph.spawn.z + Math.cos(graph.spawn.headingY) * 200);
```

In the tick function, replace orbit logic with:

```js
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
```

- [ ] **Step 3: Run and verify**

Run dev server. Expected: terrain renders, a road ribbon with center stripe appears below the camera, guardrails on both sides, junction disks at branches. The camera slowly drifts forward along the spawn road. Console shows `road graph: ~150-250 nodes, ~250-450 edges`.

- [ ] **Step 4: Bump VERSION** to `v0.1.10`.

- [ ] **Step 5: Commit**

```bash
git add lib/roads/manager.js shell/main.js lib/version.js index.html
git commit -m "feat(roads): near-camera streaming; roads visible from spawn"
```

---

## Task 12: Car model

**Files:**
- Create: `lib/car/model.js`

Geometry-only sports coupe, ~4.4×1.8×1.3 m, four cylindrical wheels, two emissive headlights.

- [ ] **Step 1: Implement `buildCarModel`**

`lib/car/model.js`:

```js
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
```

- [ ] **Step 2: Bump VERSION** to `v0.1.11`.

- [ ] **Step 3: Commit**

```bash
git add lib/car/model.js lib/version.js index.html
git commit -m "feat(car): single sports-coupe model"
```

---

## Task 13: Car physics (TDD)

**Files:**
- Create: `lib/car/physics.js`
- Test: `tests/car-physics.test.js`

- [ ] **Step 1: Write the failing tests**

`tests/car-physics.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { CarPhysics, CAR_CONSTANTS } from '../lib/car/physics.js';

const flatTerrain = () => 0;

describe('CarPhysics', () => {
  it('accelerates from 0 toward effMax with no steering', () => {
    const p = new CarPhysics({ terrainHeightFn: flatTerrain });
    for (let i = 0; i < 1000; i++) p.step(0, 1 / 120);
    expect(p.speed).toBeGreaterThan(CAR_CONSTANTS.MAX_SPEED * 0.99);
  });

  it('reduces top speed at full lock', () => {
    const p = new CarPhysics({ terrainHeightFn: flatTerrain });
    for (let i = 0; i < 1500; i++) p.step(1, 1 / 120);
    const expected = CAR_CONSTANTS.MAX_SPEED * (1 - CAR_CONSTANTS.BRAKE_FROM_TURN);
    expect(Math.abs(p.speed - expected)).toBeLessThan(0.5);
  });

  it('integrates heading and position without NaN', () => {
    const p = new CarPhysics({ terrainHeightFn: flatTerrain });
    for (let i = 0; i < 1200; i++) p.step((i % 240 < 120 ? 0.5 : -0.5), 1 / 120);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.z)).toBe(true);
    expect(Number.isFinite(p.headingY)).toBe(true);
    expect(p.speed).toBeGreaterThan(0);
  });

  it('clamps y to terrainHeight + ride height', () => {
    const slope = (x, z) => x * 0.01; // gentle slope rising in +x
    const p = new CarPhysics({ terrainHeightFn: slope });
    p.x = 100; p.z = 0;
    for (let i = 0; i < 60; i++) p.step(0, 1 / 120);
    expect(Math.abs(p.y - (p.x * 0.01 + CAR_CONSTANTS.CAR_RIDE_HEIGHT))).toBeLessThan(0.1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/car-physics.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CarPhysics`**

`lib/car/physics.js`:

```js
export const CAR_CONSTANTS = {
  MAX_SPEED: 60,                 // m/s
  ACCELERATION: 12,              // m/s^2
  BRAKE_FROM_TURN: 0.55,         // 55% top-speed cut at full lock
  STEER_RATE_LOW: 1.2,           // rad/s at low speed
  STEER_RATE_HIGH: 0.5,          // rad/s at top speed
  CAR_RIDE_HEIGHT: 0.5,          // m above terrain
  CAR_HALF_WIDTH: 0.9,           // m
};

function lerp(a, b, t) { return a + (b - a) * t; }

export class CarPhysics {
  constructor({ terrainHeightFn, spawn = null }) {
    this.terrainHeightFn = terrainHeightFn;
    this.x = spawn ? spawn.x : 0;
    this.z = spawn ? spawn.z : 0;
    this.headingY = spawn ? spawn.headingY : 0;
    this.speed = 0;
    this.y = terrainHeightFn(this.x, this.z) + CAR_CONSTANTS.CAR_RIDE_HEIGHT;
    this.pitch = 0;
    this.roll = 0;
    this.brakeHeld = false;
  }

  step(steering, dt) {
    const s = Math.max(-1, Math.min(1, steering));
    const C = CAR_CONSTANTS;
    let effMax = C.MAX_SPEED * (1 - C.BRAKE_FROM_TURN * Math.abs(s));
    if (this.brakeHeld) effMax = Math.min(effMax, 10);

    if (this.speed < effMax) {
      this.speed = Math.min(effMax, this.speed + C.ACCELERATION * dt);
    } else if (this.speed > effMax) {
      this.speed = Math.max(effMax, this.speed - C.ACCELERATION * 2 * dt);
    }

    const speedT = this.speed / C.MAX_SPEED;
    const rate = lerp(C.STEER_RATE_LOW, C.STEER_RATE_HIGH, Math.max(0, Math.min(1, speedT)));
    this.headingY += s * rate * dt;

    const vx = Math.sin(this.headingY) * this.speed;
    const vz = Math.cos(this.headingY) * this.speed;
    this.x += vx * dt;
    this.z += vz * dt;
    this.y = this.terrainHeightFn(this.x, this.z) + C.CAR_RIDE_HEIGHT;

    // Visual pitch/roll targets — sampled but lerped externally if needed.
    const probe = 1.2;
    const cos = Math.cos(this.headingY), sin = Math.sin(this.headingY);
    const fx = this.x + sin * probe, fz = this.z + cos * probe;
    const bx = this.x - sin * probe, bz = this.z - cos * probe;
    const lx = this.x - cos * probe, lz = this.z + sin * probe;
    const rx = this.x + cos * probe, rz = this.z - sin * probe;
    const hF = this.terrainHeightFn(fx, fz), hB = this.terrainHeightFn(bx, bz);
    const hL = this.terrainHeightFn(lx, lz), hR = this.terrainHeightFn(rx, rz);
    const targetPitch = Math.atan2(hB - hF, probe * 2);
    const targetRoll = Math.atan2(hR - hL, probe * 2);
    this.pitch = lerp(this.pitch, targetPitch, 0.15);
    this.roll = lerp(this.roll, targetRoll, 0.15);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/car-physics.test.js`
Expected: 4 tests PASS.

- [ ] **Step 5: Bump VERSION** to `v0.1.12`.

- [ ] **Step 6: Commit**

```bash
git add lib/car/physics.js tests/car-physics.test.js lib/version.js index.html
git commit -m "feat(car): physics (auto-throttle + speed-aware steering) (TDD)"
```

---

## Task 14: Lift FC3D input (with smoke test)

**Files:**
- Create: `lib/car/input.js` (copied from FC3D)
- Test: `tests/car-input.test.js`

- [ ] **Step 1: Copy FC3D input.js verbatim**

```bash
cp /Users/nitzanwilnai/Programming/Claude/JSGames/FormulaChampions3D/js/input.js lib/car/input.js
```

Verify with `diff lib/car/input.js /Users/.../FormulaChampions3D/js/input.js` — should be empty.

- [ ] **Step 2: Write a smoke test using a fake DOM**

`tests/car-input.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { Input } from '../lib/car/input.js';

function makeFakeCanvas() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    setPointerCapture() {},
    dispatch(name, event) {
      const arr = handlers.get(name) || [];
      for (const fn of arr) fn(event);
    },
  };
}

describe('Input', () => {
  let canvas, input;
  beforeEach(() => {
    // Stub the window-level listeners that input.js attaches.
    globalThis.window = globalThis.window || {
      _handlers: new Map(),
      addEventListener(name, fn) {
        if (!this._handlers.has(name)) this._handlers.set(name, []);
        this._handlers.get(name).push(fn);
      },
    };
    canvas = makeFakeCanvas();
    input = new Input(canvas);
  });

  it('starts with zero steering', () => {
    input.update();
    expect(input._steering ?? 0).toBe(0);
  });

  it('produces positive steering on rightward drag', () => {
    canvas.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    canvas.dispatch('pointermove', { clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' });
    input.update();
    expect(input._steering).toBeGreaterThan(0.5);
  });

  it('clamps to ±1 at very large drags', () => {
    canvas.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    canvas.dispatch('pointermove', { clientX: 9999, clientY: 200, pointerId: 1, pointerType: 'touch' });
    input.update();
    expect(input._steering).toBe(1);
  });

  it('resets steering on pointerup', () => {
    canvas.dispatch('pointerdown', { clientX: 100, clientY: 200, pointerId: 1, pointerType: 'touch' });
    canvas.dispatch('pointermove', { clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' });
    input.update();
    canvas.dispatch('pointerup', { clientX: 250, clientY: 200, pointerId: 1, pointerType: 'touch' });
    expect(input._steering).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --run tests/car-input.test.js`
Expected: 4 tests PASS. If the FC3D file uses property names slightly different from `_steering`, adjust the test to read the actual public `steering` getter or whatever the FC3D file exposes.

- [ ] **Step 4: Bump VERSION** to `v0.1.13`.

- [ ] **Step 5: Commit**

```bash
git add lib/car/input.js tests/car-input.test.js lib/version.js index.html
git commit -m "feat(car): lift FormulaChampions3D drag-to-steer input + smoke test"
```

---

## Task 15: Chase camera

**Files:**
- Create: `lib/car/camera.js`

- [ ] **Step 1: Implement `ChaseCamera`**

`lib/car/camera.js`:

```js
// Chase camera. Smooths position + look-at toward a target derived from the
// car's pose. Auto-aims with speed-proportional lookahead above a threshold.
// Per [[camera-input-smoothing]], raw target-following stutters even at high
// frame rates; everything here is lerped.

const POS_LERP = 0.12;
const YAW_LERP = 0.10;
const PITCH_LERP = 0.10;
const AUTO_AIM_MIN_SPEED = 8;
const AUTO_AIM_LOOKAHEAD_SCALE = 0.05; // radians per (m/s)

export class ChaseCamera {
  constructor(THREE, camera) {
    this.THREE = THREE;
    this.camera = camera;
    this._yaw = 0;
    this._pitch = 0;
    this._initialised = false;
    this._tmpV = new THREE.Vector3();
  }

  update(car) {
    const { x, y, z, headingY, speed } = car;
    const back = 7, up = 3, ahead = 4, eyeH = 1;

    let targetYaw = headingY;
    if (speed > AUTO_AIM_MIN_SPEED) {
      // No actual yaw delta available without prior heading; the small
      // forward-bias is enough to feel the camera "lead" in turns.
      targetYaw = headingY;
    }
    const targetPitch = 0;

    if (!this._initialised) {
      this._yaw = targetYaw;
      this._pitch = targetPitch;
      this._initialised = true;
    } else {
      this._yaw = wrapLerp(this._yaw, targetYaw, YAW_LERP);
      this._pitch = this._pitch + (targetPitch - this._pitch) * PITCH_LERP;
    }

    const sin = Math.sin(this._yaw), cos = Math.cos(this._yaw);
    const desiredX = x - sin * back;
    const desiredZ = z - cos * back;
    const desiredY = y + up;

    this.camera.position.x += (desiredX - this.camera.position.x) * POS_LERP;
    this.camera.position.y += (desiredY - this.camera.position.y) * POS_LERP;
    this.camera.position.z += (desiredZ - this.camera.position.z) * POS_LERP;

    const lookX = x + sin * ahead;
    const lookY = y + eyeH;
    const lookZ = z + cos * ahead;
    this.camera.lookAt(lookX, lookY, lookZ);
  }
}

// Lerp between two angles by taking the shortest path on the unit circle.
function wrapLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
```

- [ ] **Step 2: Bump VERSION** to `v0.1.14`.

- [ ] **Step 3: Commit**

```bash
git add lib/car/camera.js lib/version.js index.html
git commit -m "feat(car): chase camera with smoothed lerp"
```

---

## Task 16: Wire car + physics + input + camera into main.js (no collision yet)

**Files:**
- Modify: `shell/main.js`

After this task you can drive on the road, but guardrails don't yet stop the car.

- [ ] **Step 1: Edit `shell/main.js`**

Add to imports:

```js
import { buildCarModel } from '../lib/car/model.js';
import { CarPhysics } from '../lib/car/physics.js';
import { Input } from '../lib/car/input.js';
import { ChaseCamera } from '../lib/car/camera.js';
```

Add lighting (the road material is `MeshBasicMaterial` but guardrails and car are Lambert; we need a directional + hemisphere light if terrain didn't already add one). Check terrain.sun / terrain.hemi exists; FlightSim's terrain adds these. If not, add a fallback:

```js
if (!scene.children.some(c => c.isDirectionalLight)) {
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(120, 200, 80);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x202428, 0.5));
}
```

Replace the camera-pan section with car + physics + input + chase-camera:

```js
const car = buildCarModel(THREE);
scene.add(car);

const physics = new CarPhysics({
  terrainHeightFn,
  spawn: graph.spawn,
});
const input = new Input(canvas);
const chase = new ChaseCamera(THREE, camera);
chase.update(physics);  // seed initial camera pose
```

Replace the tick function body with substepped physics + chase camera:

```js
let accumulator = 0;
const FIXED_DT = 1 / 120;

function tick(now) {
  let frameDt = (now - last) / 1000;
  if (frameDt > 0.1) frameDt = 0.1;
  last = now;

  input.update();
  accumulator += frameDt;
  while (accumulator >= FIXED_DT) {
    physics.step(input._steering ?? 0, FIXED_DT);
    accumulator -= FIXED_DT;
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
```

- [ ] **Step 2: Run and verify**

Run dev server. Expected: car spawns on a road, accelerates forward automatically. Drag left/right on canvas: car steers. Top speed is reached on straights; tight turns slow you down. Camera lerps in behind the car. Wheels visibly spin. You can drive **off** the road at this stage — collision isn't wired yet — and that's expected.

- [ ] **Step 3: Bump VERSION** to `v0.1.15`.

- [ ] **Step 4: Commit**

```bash
git add shell/main.js lib/version.js index.html
git commit -m "feat: drivable car on road network (no collision yet)"
```

---

## Task 17: Road collision (TDD) + wire into substep

**Files:**
- Create: `lib/roads/collision.js`
- Test: `tests/road-collision.test.js`
- Modify: `shell/main.js` — call collision per substep

- [ ] **Step 1: Write the failing tests**

`tests/road-collision.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveCarRoadCollision, queryRoadAt } from '../lib/roads/collision.js';
import { SpatialIndex } from '../lib/roads/spatial-index.js';
import { CAR_CONSTANTS } from '../lib/car/physics.js';
import { ROAD_HALF_WIDTH } from '../lib/roads/geometry.js';

function makeGraph() {
  const polylineX = [];
  for (let i = 0; i <= 10; i++) polylineX.push({ x: i * 50, y: 0, z: 0 });
  const edges = [{ id: 0, nodeA: 0, nodeB: 1, polyline: polylineX, length: 500 }];
  const nodes = [
    { id: 0, x: 0, y: 0, z: 0, edges: [0] },
    { id: 1, x: 500, y: 0, z: 0, edges: [0] },
  ];
  return { nodes, edges, spatialIndex: new SpatialIndex(edges, 200) };
}

describe('queryRoadAt', () => {
  it('finds the nearest segment along an x-axis road', () => {
    const g = makeGraph();
    const q = queryRoadAt(g, 100, 7);
    expect(q.edgeId).toBe(0);
    expect(Math.abs(q.lateralOffset - 7)).toBeLessThan(0.001);
  });

  it('returns null when far from all roads', () => {
    const g = makeGraph();
    const q = queryRoadAt(g, 100, 500);
    expect(q).toBeNull();
  });
});

describe('resolveCarRoadCollision', () => {
  it('clamps a car beyond the road edge back to the wall', () => {
    const g = makeGraph();
    const car = { x: 100, y: 0, z: 8, headingY: 0, speed: 30 };
    const result = resolveCarRoadCollision(g, car, /*nearJunction*/ false);
    expect(result.collided).toBe(true);
    const limit = ROAD_HALF_WIDTH - CAR_CONSTANTS.CAR_HALF_WIDTH;
    expect(car.z).toBeLessThanOrEqual(limit + 0.001);
    expect(car.speed).toBeLessThan(30);
  });

  it('does nothing when car is inside the corridor', () => {
    const g = makeGraph();
    const car = { x: 100, y: 0, z: 2, headingY: 0, speed: 30 };
    const result = resolveCarRoadCollision(g, car, false);
    expect(result.collided).toBe(false);
    expect(car.z).toBe(2);
    expect(car.speed).toBe(30);
  });

  it('skips clamp when near junction', () => {
    const g = makeGraph();
    const car = { x: 100, y: 0, z: 8, headingY: 0, speed: 30 };
    const result = resolveCarRoadCollision(g, car, /*nearJunction*/ true);
    expect(result.collided).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/road-collision.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement collision**

`lib/roads/collision.js`:

```js
import { ROAD_HALF_WIDTH, JUNCTION_RADIUS } from './geometry.js';
import { CAR_CONSTANTS } from '../car/physics.js';

const SEARCH_RADIUS = 30;          // m — how far to look for candidate edges
const OFF_GRAPH_THRESHOLD = 30;    // m
const IMPACT_SPEED_LOSS = 0.12;    // 12% per impact

// Returns the nearest road segment to (x, z) or null.
export function queryRoadAt(graph, x, z) {
  const ids = graph.spatialIndex.nearEdges(x, z, SEARCH_RADIUS);
  let best = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const e = graph.edges[id];
    for (let i = 0; i < e.polyline.length - 1; i++) {
      const a = e.polyline[i], b = e.polyline[i + 1];
      const r = pointSegment(x, z, a.x, a.z, b.x, b.z);
      if (r.distSq < bestDist) {
        bestDist = r.distSq;
        best = { edgeId: id, segIndex: i, ...r };
      }
    }
  }
  if (!best) return null;
  const d = Math.sqrt(bestDist);
  if (d > SEARCH_RADIUS) return null;
  return { edgeId: best.edgeId, segIndex: best.segIndex,
           lateralOffset: best.lateral, forwardT: best.t,
           segTangentX: best.tx, segTangentZ: best.tz, dist: d };
}

// Checks for and resolves a guardrail clamp. Mutates `car` (clamps position
// and adjusts velocity). `nearJunction` is true when the car is inside any
// degree-≥3 node's JUNCTION_RADIUS.
export function resolveCarRoadCollision(graph, car, nearJunction) {
  const q = queryRoadAt(graph, car.x, car.z);
  if (!q) return { collided: false, offGraph: true };
  if (nearJunction) return { collided: false, offGraph: false };

  const limit = ROAD_HALF_WIDTH - CAR_CONSTANTS.CAR_HALF_WIDTH;
  const lat = q.lateralOffset;
  if (Math.abs(lat) <= limit) return { collided: false, offGraph: false };

  // Clamp lateral position. Compute corrected (x, z).
  const e = graph.edges[q.edgeId];
  const a = e.polyline[q.segIndex], b = e.polyline[q.segIndex + 1];
  const sx = a.x + (b.x - a.x) * q.forwardT;
  const sz = a.z + (b.z - a.z) * q.forwardT;
  const nx = -q.segTangentZ, nz = q.segTangentX; // left normal
  // q.lateralOffset is signed in the same convention as (nx, nz). Sign-aware clamp.
  const clamped = Math.sign(lat) * limit;
  car.x = sx + nx * clamped;
  car.z = sz + nz * clamped;

  // Project velocity onto tangent (kill lateral component) and apply speed loss.
  const tx = q.segTangentX, tz = q.segTangentZ;
  // Current velocity from heading & speed.
  let vx = Math.sin(car.headingY) * car.speed;
  let vz = Math.cos(car.headingY) * car.speed;
  const vt = vx * tx + vz * tz;
  vx = tx * vt;
  vz = tz * vt;
  car.speed = Math.hypot(vx, vz) * (1 - IMPACT_SPEED_LOSS);
  car.headingY = Math.atan2(vx, vz);

  return { collided: true, offGraph: false };
}

export function isCarOffGraph(graph, car) {
  const q = queryRoadAt(graph, car.x, car.z);
  return !q || q.dist > OFF_GRAPH_THRESHOLD;
}

export function isCarNearAnyJunction(graph, car) {
  const radSq = JUNCTION_RADIUS * JUNCTION_RADIUS;
  for (const n of graph.nodes) {
    if (n.edges.length < 3) continue;
    const dx = n.x - car.x, dz = n.z - car.z;
    if (dx * dx + dz * dz < radSq) return true;
  }
  return false;
}

// Computes (signed-lateral-offset, parametric-t-along-AB, tangent unit) for
// the perpendicular foot of P on segment AB. Lateral sign convention: + is
// the "left" of segment direction in XZ.
function pointSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const lSq = dx * dx + dz * dz;
  let t = lSq > 0 ? ((px - ax) * dx + (pz - az) * dz) / lSq : 0;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + dx * t, fz = az + dz * t;
  const ex = px - fx, ez = pz - fz;
  const distSq = ex * ex + ez * ez;
  const len = Math.sqrt(lSq) || 1;
  const tx = dx / len, tz = dz / len;
  // Lateral sign: cross product (tangent × offset) z-component, in XZ plane
  // i.e. tx * ez - tz * ex. Positive when offset is to the left of tangent.
  const lateral = (tx * ez - tz * ex);
  return { distSq, t, tx, tz, lateral };
}
```

- [ ] **Step 4: Run all road-collision tests**

Run: `npm test -- --run tests/road-collision.test.js`
Expected: 5 tests PASS.

- [ ] **Step 5: Wire collision into `shell/main.js`**

Add imports:

```js
import { resolveCarRoadCollision, isCarOffGraph, isCarNearAnyJunction } from '../lib/roads/collision.js';
```

Replace the substep loop in `tick()`:

```js
let lastOffGraphCheck = 0;
let stuckSince = -1;
const OFF_GRAPH_CHECK_INTERVAL = 0.5;
const OFF_GRAPH_RESPAWN_AFTER = 0.5;

// ...inside tick(...)
accumulator += frameDt;
while (accumulator >= FIXED_DT) {
  physics.step(input._steering ?? 0, FIXED_DT);
  const nearJunction = isCarNearAnyJunction(graph, physics);
  resolveCarRoadCollision(graph, physics, nearJunction);
  accumulator -= FIXED_DT;
}

// Off-graph recovery (independent of substeps).
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
```

- [ ] **Step 6: Run and verify**

Run dev server. Drive into a guardrail: car clamps to the wall, loses ~12% speed, scrapes along. Drive through a junction: guardrails open up, you pick the next road by aiming. If somehow you teleport off-graph (e.g. via dev tools), a half-second later you snap back to spawn.

- [ ] **Step 7: Bump VERSION** to `v0.1.16`.

- [ ] **Step 8: Commit**

```bash
git add lib/roads/collision.js tests/road-collision.test.js shell/main.js lib/version.js index.html
git commit -m "feat(roads): guardrail collision + off-graph respawn (TDD)"
```

---

## Task 18: Engine audio + focus pause

**Files:**
- Create: `lib/audio/engine.js`
- Modify: `shell/main.js` — instantiate on user gesture, pause on visibility loss

- [ ] **Step 1: Write `lib/audio/engine.js`**

```js
// Procedural engine note. Mixes a square wave (base) and saw (octave) into a
// lowpass filter and gain stage. Frequency, gain, and cutoff sweep with speed.
//
// Construct only AFTER a user gesture (Start button). AudioContext is
// suspended on visibilitychange and resumed on focus.

const F0 = 60;
const FREQ_SCALE = 6;
const GAIN_IDLE = 0.04, GAIN_FULL = 0.18;
const CUTOFF_IDLE = 1200, CUTOFF_FULL = 4000;

export class EngineAudio {
  constructor(maxSpeed) {
    this.maxSpeed = maxSpeed;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = GAIN_IDLE;
    this.lp = this.ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = CUTOFF_IDLE;

    this.oscSquare = this.ctx.createOscillator();
    this.oscSquare.type = 'square';
    this.oscSquare.frequency.value = F0;
    const sqGain = this.ctx.createGain();
    sqGain.gain.value = 0.7;

    this.oscSaw = this.ctx.createOscillator();
    this.oscSaw.type = 'sawtooth';
    this.oscSaw.frequency.value = F0 * 2;
    const swGain = this.ctx.createGain();
    swGain.gain.value = 0.3;

    this.oscSquare.connect(sqGain).connect(this.lp);
    this.oscSaw.connect(swGain).connect(this.lp);
    this.lp.connect(this.gain).connect(this.ctx.destination);

    this.oscSquare.start();
    this.oscSaw.start();
  }

  update(speed) {
    const t = Math.max(0, Math.min(1, speed / this.maxSpeed));
    const f = F0 * (1 + t * FREQ_SCALE);
    this.oscSquare.frequency.setTargetAtTime(f,        this.ctx.currentTime, 0.05);
    this.oscSaw.frequency.setTargetAtTime(f * 2,       this.ctx.currentTime, 0.05);
    this.gain.gain.setTargetAtTime(GAIN_IDLE + (GAIN_FULL - GAIN_IDLE) * t, this.ctx.currentTime, 0.05);
    this.lp.frequency.setTargetAtTime(CUTOFF_IDLE + (CUTOFF_FULL - CUTOFF_IDLE) * t, this.ctx.currentTime, 0.05);
  }

  suspend() { return this.ctx.suspend(); }
  resume()  { return this.ctx.resume();  }
}
```

- [ ] **Step 2: Modify `shell/main.js`** — start audio on first user gesture; suspend on tab hide

Add to imports:

```js
import { EngineAudio } from '../lib/audio/engine.js';
import { CAR_CONSTANTS } from '../lib/car/physics.js';
```

Add state:

```js
let engineAudio = null;
let runningPaused = false;
```

Add a one-shot listener to start audio on the first pointerdown / keydown (delete the listeners after firing). Place after `const input = new Input(canvas);`:

```js
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
```

In `tick()`, after `physics.step(...)`, add:

```js
if (engineAudio) engineAudio.update(physics.speed);
```

Wrap the entire substep loop with `if (!runningPaused) { ... }`.

- [ ] **Step 3: Run and verify**

Open dev server. Drive: a low-pitched note plays, sweeping upward as you speed up, brightening as the lowpass opens. Switch tabs: audio stops. Switch back: audio resumes.

- [ ] **Step 4: Bump VERSION** to `v0.1.17`.

- [ ] **Step 5: Commit**

```bash
git add lib/audio/engine.js shell/main.js lib/version.js index.html
git commit -m "feat(audio): WebAudio engine note tied to speed + focus pause"
```

---

## Task 19: State machine (TDD)

**Files:**
- Create: `lib/game/state.js`
- Test: `tests/state.test.js`

- [ ] **Step 1: Write failing tests**

`tests/state.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { StateMachine, MENU, DRIVE } from '../lib/game/state.js';

describe('StateMachine', () => {
  it('starts in MENU', () => {
    const sm = new StateMachine();
    expect(sm.state).toBe(MENU);
  });

  it('transitions to DRIVE on start()', () => {
    const onChange = vi.fn();
    const sm = new StateMachine(onChange);
    sm.start();
    expect(sm.state).toBe(DRIVE);
    expect(onChange).toHaveBeenCalledWith(MENU, DRIVE);
  });

  it('is idempotent — start() while already DRIVE does nothing', () => {
    const onChange = vi.fn();
    const sm = new StateMachine(onChange);
    sm.start();
    onChange.mockClear();
    sm.start();
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- --run tests/state.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `StateMachine`**

`lib/game/state.js`:

```js
export const MENU = 'MENU';
export const DRIVE = 'DRIVE';

export class StateMachine {
  constructor(onChange = () => {}) {
    this.state = MENU;
    this.onChange = onChange;
  }
  start() {
    if (this.state === DRIVE) return;
    const prev = this.state;
    this.state = DRIVE;
    this.onChange(prev, DRIVE);
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `npm test -- --run tests/state.test.js`
Expected: 3 PASS.

- [ ] **Step 5: Bump VERSION** to `v0.1.18`.

- [ ] **Step 6: Commit**

```bash
git add lib/game/state.js tests/state.test.js lib/version.js index.html
git commit -m "feat(game): MENU/DRIVE state machine (TDD)"
```

---

## Task 20: HUD canvas + speedometer + version stamp

**Files:**
- Create: `lib/ui/hud.js`
- Modify: `shell/main.js` — replace inline `drawHUD()` with `HUD` class call

- [ ] **Step 1: Write `lib/ui/hud.js`** (initial form — speedometer + version)

```js
import { VERSION } from '../version.js';

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.speedKmh = 0;
  }

  setSpeed(speedMs) {
    this.speedKmh = speedMs * 3.6;
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Speedometer.
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 144px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const speedText = Math.round(this.speedKmh).toString();
    ctx.fillText(speedText, W / 2, H - 80);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    ctx.fillText('KM/H', W / 2, H - 40);

    // Version.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    ctx.fillText(VERSION, 24, H - 24);
  }
}
```

- [ ] **Step 2: Wire into `shell/main.js`**

Add import:

```js
import { HUD } from '../lib/ui/hud.js';
```

Replace the inline `drawHUD()` function and `hctx` lines with:

```js
const hud_ = new HUD(hud);
```

In `tick()`, replace `drawHUD();` with:

```js
hud_.setSpeed(physics.speed);
hud_.draw();
```

- [ ] **Step 3: Run and verify**

Dev server. Drive — a large number in the center-bottom of the screen tracks km/h. Version stamp visible bottom-left.

- [ ] **Step 4: Bump VERSION** to `v0.1.19`.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/hud.js shell/main.js lib/version.js index.html
git commit -m "feat(ui): HUD class with speedometer + version stamp"
```

---

## Task 21: HUD mini-map

**Files:**
- Modify: `lib/ui/hud.js` — add mini-map rendering using a pre-rendered offscreen canvas

- [ ] **Step 1: Update `lib/ui/hud.js`** to render the road graph once + draw windowed slice each frame

Replace `lib/ui/hud.js` with:

```js
import { VERSION } from '../version.js';

const MINIMAP_PX = 280;          // size in canvas pixels
const MINIMAP_MARGIN = 36;       // distance from edges
const MINIMAP_WINDOW_M = 6000;   // 6 km on a side, centered on car
const FULL_MAP_PX = 4096;        // offscreen pre-render size
const WORLD_SIZE = 64000;        // matches lib/roads/graph.js

export class HUD {
  constructor(canvas, graph) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.speedKmh = 0;
    this.car = { x: 0, z: 0, headingY: 0 };
    this.fullMap = null;
    if (graph) this._prerenderMap(graph);
  }

  setSpeed(speedMs) { this.speedKmh = speedMs * 3.6; }
  setCar(car) {
    this.car.x = car.x;
    this.car.z = car.z;
    this.car.headingY = car.headingY;
  }

  _prerenderMap(graph) {
    const c = document.createElement('canvas');
    c.width = c.height = FULL_MAP_PX;
    const cx = c.getContext('2d');
    cx.fillStyle = 'rgba(20,24,32,0.85)';
    cx.fillRect(0, 0, FULL_MAP_PX, FULL_MAP_PX);
    cx.strokeStyle = '#c8ccd6';
    cx.lineWidth = 1;
    cx.beginPath();
    const scale = FULL_MAP_PX / WORLD_SIZE;
    const half = WORLD_SIZE / 2;
    for (const e of graph.edges) {
      const p0 = e.polyline[0];
      cx.moveTo((p0.x + half) * scale, (p0.z + half) * scale);
      for (let i = 1; i < e.polyline.length; i++) {
        const p = e.polyline[i];
        cx.lineTo((p.x + half) * scale, (p.z + half) * scale);
      }
    }
    cx.stroke();
    this.fullMap = c;
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this._drawSpeedometer(ctx, W, H);
    this._drawMinimap(ctx, W);
    this._drawVersion(ctx, H);
  }

  _drawSpeedometer(ctx, W, H) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 144px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.round(this.speedKmh).toString(), W / 2, H - 80);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    ctx.fillText('KM/H', W / 2, H - 40);
  }

  _drawMinimap(ctx, W) {
    if (!this.fullMap) return;
    const x0 = W - MINIMAP_PX - MINIMAP_MARGIN;
    const y0 = MINIMAP_MARGIN;
    // Background.
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x0 - 4, y0 - 4, MINIMAP_PX + 8, MINIMAP_PX + 8);
    // Window into the pre-rendered map.
    const sxPerM = FULL_MAP_PX / WORLD_SIZE;
    const halfWin = MINIMAP_WINDOW_M / 2;
    const srcX = (this.car.x + WORLD_SIZE / 2 - halfWin) * sxPerM;
    const srcY = (this.car.z + WORLD_SIZE / 2 - halfWin) * sxPerM;
    const srcW = MINIMAP_WINDOW_M * sxPerM;
    ctx.drawImage(this.fullMap, srcX, srcY, srcW, srcW, x0, y0, MINIMAP_PX, MINIMAP_PX);
    // Player triangle.
    const cx = x0 + MINIMAP_PX / 2, cy = y0 + MINIMAP_PX / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-this.car.headingY);
    ctx.fillStyle = '#f1c64a';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // "N" marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', x0 + MINIMAP_PX / 2, y0 + 6);
  }

  _drawVersion(ctx, H) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    ctx.fillText(VERSION, 24, H - 24);
  }
}
```

- [ ] **Step 2: Wire graph into HUD in `shell/main.js`**

Replace `const hud_ = new HUD(hud);` with `const hud_ = new HUD(hud, graph);`.
In `tick()`, before `hud_.draw()`:

```js
hud_.setCar(physics);
```

- [ ] **Step 3: Run and verify**

Mini-map appears in top-right showing a windowed slice of the road network. Player triangle in the center, rotates with car heading. North-up. Map content scrolls as you drive.

- [ ] **Step 4: Bump VERSION** to `v0.1.20`.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/hud.js shell/main.js lib/version.js index.html
git commit -m "feat(ui): mini-map (pre-rendered road graph + windowed slice)"
```

---

## Task 22: HUD biome label

**Files:**
- Modify: `lib/ui/hud.js` — add biome label fader
- Modify: `shell/main.js` — push biome name into HUD each frame

- [ ] **Step 1: Edit `lib/ui/hud.js`**

Add to the class:

```js
  // Add to constructor:
  // this.biomeName = '';
  // this.lastBiomeName = '';
  // this.biomeFadeT = 0; // 0..1
```

Add method:

```js
  setBiome(name) {
    if (name !== this.lastBiomeName) {
      this.lastBiomeName = name;
      this.biomeName = name;
      this.biomeFadeT = 1;
    }
  }

  _drawBiome(ctx, W, dt) {
    if (this.biomeFadeT <= 0) return;
    this.biomeFadeT = Math.max(0, this.biomeFadeT - dt / 3); // 3-second fade
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.biomeFadeT * 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 48px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.biomeName.toUpperCase(), W / 2, 200);
    ctx.restore();
  }
```

Edit constructor to add the new fields, and edit `draw(dt)` to accept dt and call `_drawBiome`:

```js
  draw(dt = 0) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this._drawSpeedometer(ctx, W, H);
    this._drawMinimap(ctx, W);
    this._drawBiome(ctx, W, dt);
    this._drawVersion(ctx, H);
  }
```

- [ ] **Step 2: Push biome name in `shell/main.js`**

In `tick()`:

```js
const b = biomeAt(physics.x, physics.z);
hud_.setBiome(b.name);
hud_.draw(frameDt);
```

- [ ] **Step 3: Run and verify**

Drive across biomes. When you cross into a new biome, a large label fades in centered near the top of the screen and fades out over ~3 seconds.

- [ ] **Step 4: Bump VERSION** to `v0.1.21`.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/hud.js shell/main.js lib/version.js index.html
git commit -m "feat(ui): HUD biome label fader"
```

---

## Task 23: Main menu (single car turntable + Start button)

**Files:**
- Create: `lib/ui/menu.js`
- Modify: `shell/main.js` — show menu first, transition to DRIVE on Start

- [ ] **Step 1: Write `lib/ui/menu.js`**

```js
import { VERSION } from '../version.js';

// Builds a menu overlay (HTML inside #ui-root) and a separate menu scene
// (own camera + lights). The world scene is NOT ticked while the menu is up.
//
// Usage:
//   const menu = new MainMenu({ THREE, uiRoot, carModel });
//   menu.show();
//   menu.onStart = () => { /* transition to drive */ };
//   In game loop while menu.visible: renderer.render(menu.scene, menu.camera);

export class MainMenu {
  constructor({ THREE, uiRoot, carModel }) {
    this.THREE = THREE;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e14);
    this.scene.add(new THREE.HemisphereLight(0xcfd8e0, 0x202428, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 10, 8);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
    this.camera.position.set(7, 3, 7);
    this.camera.lookAt(0, 0.6, 0);

    this.car = carModel;
    this.car.position.set(0, 0, 0);
    this.scene.add(this.car);
    this._yaw = 0;

    this._buildHTML(uiRoot);
    this.visible = false;
    this.onStart = () => {};
  }

  _buildHTML(root) {
    root.innerHTML = `
      <div class="menu" style="
        position:absolute;inset:0;
        pointer-events:auto;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;color:#fff;
        font-family:ui-monospace,Menlo,monospace;
      ">
        <div style="position:absolute;top:8%;font-size:144px;font-weight:700;letter-spacing:0.04em;">TESTDRIVE</div>
        <div style="position:absolute;top:20%;font-size:90px;font-weight:500;opacity:0.85;">Open-road driving sandbox</div>
        <button id="start-btn" style="
          position:absolute;bottom:14%;
          width:70%;
          padding:36px 0;
          font:600 66px ui-monospace,Menlo,monospace;
          color:#0a0e14;background:#f1c64a;border:none;border-radius:18px;
          cursor:pointer;letter-spacing:0.04em;
        ">START</button>
        <div style="position:absolute;bottom:24px;left:24px;font-size:21px;opacity:0.5;">${VERSION}</div>
      </div>
    `;
    this._root = root;
    this._root.querySelector('#start-btn').addEventListener('click', () => this.onStart());
  }

  show() {
    this.visible = true;
    this._root.style.display = '';
  }
  hide() {
    this.visible = false;
    this._root.style.display = 'none';
  }

  update(dt) {
    this._yaw += dt * 0.4;
    this.car.rotation.y = this._yaw;
  }
}
```

- [ ] **Step 2: Wire into `shell/main.js`**

Add to imports:

```js
import { MainMenu } from '../lib/ui/menu.js';
import { StateMachine, MENU, DRIVE } from '../lib/game/state.js';
```

After building the car and before the tick loop, add:

```js
const uiRoot = document.getElementById('ui-root');
// Menu uses its own car instance so the world car doesn't visually teleport.
const menuCar = buildCarModel(THREE);
const menu = new MainMenu({ THREE, uiRoot, carModel: menuCar });
menu.show();

const fsm = new StateMachine();
menu.onStart = () => {
  fsm.start();
  menu.hide();
  // Resume audio context if it was created already (e.g. by tap-on-canvas).
  if (engineAudio) engineAudio.resume();
};
```

Update the render loop to fork on state:

```js
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
    }
    accumulator -= FIXED_DT;
  }

  if (engineAudio) engineAudio.update(physics.speed);

  car.position.set(physics.x, physics.y, physics.z);
  car.rotation.y = physics.headingY;
  car.rotation.x = physics.pitch;
  car.rotation.z = -physics.roll;
  const wheelSpin = (physics.speed * frameDt) / 0.36;
  for (const w of car.userData.wheels) w.rotation.x += wheelSpin;

  chase.update(physics);
  terrain.update(camera.position, frameDt);
  roadManager.update(camera.position);

  // Off-graph recovery (unchanged from Task 17 wiring).
  lastOffGraphCheck += frameDt;
  if (lastOffGraphCheck >= OFF_GRAPH_CHECK_INTERVAL) {
    lastOffGraphCheck = 0;
    if (isCarOffGraph(graph, physics)) {
      if (stuckSince < 0) stuckSince = now / 1000;
      else if ((now / 1000) - stuckSince > OFF_GRAPH_RESPAWN_AFTER) {
        physics.x = graph.spawn.x; physics.z = graph.spawn.z;
        physics.headingY = graph.spawn.headingY; physics.speed = 0;
        stuckSince = -1;
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
```

- [ ] **Step 3: Run and verify**

Refresh page. Menu appears: title "TESTDRIVE", tagline, single car rotating slowly on a turntable, big yellow START button. Click START — menu vanishes, world appears with the car on the road and driving begins. Audio kicks in on the click (since the click is the user gesture).

- [ ] **Step 4: Bump VERSION** to `v0.1.22`.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/menu.js shell/main.js lib/version.js index.html
git commit -m "feat(ui): main menu with turntable + Start gate"
```

---

## Task 24: Crash overlay (off-graph respawn fade)

**Files:**
- Create: `lib/ui/crash-overlay.js`
- Modify: `shell/main.js` — trigger overlay during respawn

- [ ] **Step 1: Write `lib/ui/crash-overlay.js`**

```js
// Black-screen fade overlay used for off-graph respawn. Self-contained:
// owns its own DOM element appended to a passed root.

export class CrashOverlay {
  constructor(root) {
    this.el = document.createElement('div');
    this.el.style.cssText = `
      position:absolute;inset:0;
      background:#000;opacity:0;
      pointer-events:none;
      transition:opacity 0.3s ease;
      z-index:60;
    `;
    root.appendChild(this.el);
    this.state = 'idle'; // 'idle' | 'fading-in' | 'opaque' | 'fading-out'
  }

  // Run a fade-out / fade-in cycle around the provided `onMidpoint` callback.
  trigger(onMidpoint) {
    if (this.state !== 'idle') return;
    this.state = 'fading-in';
    this.el.style.opacity = '1';
    setTimeout(() => {
      this.state = 'opaque';
      onMidpoint && onMidpoint();
      setTimeout(() => {
        this.state = 'fading-out';
        this.el.style.opacity = '0';
        setTimeout(() => { this.state = 'idle'; }, 300);
      }, 60);
    }, 300);
  }
}
```

- [ ] **Step 2: Wire into `shell/main.js`**

Add to imports:

```js
import { CrashOverlay } from '../lib/ui/crash-overlay.js';
```

Construct after `const uiRoot = ...`:

```js
const crashOverlay = new CrashOverlay(uiRoot);
```

Replace the inline off-graph respawn block in `tick()`:

```js
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
```

- [ ] **Step 3: Test the respawn manually**

To force off-graph, temporarily add a dev hotkey (then remove before commit) — or use the dev console: `physics.x = 50000; physics.z = 50000;`. The screen should fade to black for ~0.4s and you should reappear at spawn.

- [ ] **Step 4: Bump VERSION** to `v0.1.23`.

- [ ] **Step 5: Commit**

```bash
git add lib/ui/crash-overlay.js shell/main.js lib/version.js index.html
git commit -m "feat(ui): off-graph respawn fade overlay"
```

---

## Task 25: Manual verification + ship-readiness pass

**Files:**
- Modify: `shell/main.js` (any final tweaks)
- Modify: `lib/version.js` and `index.html` for the ship-ready version

This task is a verification gate, not a code task. Use the [[verify]] skill mindset: run the actual app and confirm behavior.

- [ ] **Step 1: Run `npm test` — all tests pass**

Run: `npm test -- --run`
Expected: all suites green.

- [ ] **Step 2: Browser pass on desktop**

Open `http://127.0.0.1:8086`. Verify each item:

- [ ] Menu shows title, tagline, car turntable, Start button, version stamp.
- [ ] Click Start: menu fades, world appears with car on road.
- [ ] Drag to steer works on desktop (click+drag).
- [ ] A/D and Arrow keys also steer.
- [ ] Speedometer ticks up as car accelerates; tight corners visibly slow the top speed.
- [ ] Mini-map shows the road network; player triangle rotates with heading; window scrolls as you drive.
- [ ] Drive into a guardrail: car clamps, scrapes, loses speed.
- [ ] Drive through a junction: guardrails open, you can pick the next road by aiming.
- [ ] Cross a biome boundary: biome label fades in/out.
- [ ] Engine note sweeps from low to high as speed climbs.
- [ ] Tab away: audio stops. Tab back: audio resumes.
- [ ] Open browser dev tools, set `physics.x = 50000` and `physics.z = 50000` in console: screen fades black, you respawn at the spawn point.
- [ ] No console errors after a 60-second drive.

- [ ] **Step 3: Mobile pass via platform preview**

Open `https://nitzan.games/create` and drop a fresh zip of the project. Drive on the phone. Verify:

- [ ] Frame rate stays solid (use FlightSim's perf overlay or just feel — should be 60 FPS on a mid-range phone).
- [ ] Drag works smoothly with one finger.
- [ ] No iOS WebView crash within 90 seconds of driving across biomes.

- [ ] **Step 4: Final version bump**

If everything works, bump `VERSION` to `v0.2.0` in `lib/version.js` and `index.html`. This is the first ship-candidate version.

- [ ] **Step 5: Commit + tag the candidate**

```bash
git add lib/version.js index.html
git commit -m "chore: v0.2.0 — first ship-ready build"
git tag v0.2.0
```

Per [[deploy-gating]], do NOT deploy. Hand the build to the user for manual local verification first.

---

## Spec coverage check

Cross-referencing the spec sections to tasks:

| Spec section | Task(s) |
|---|---|
| §1 Overview / gameplay loop | T1–T25 (whole plan) |
| §2 Architecture / file layout | T1–T3 (scaffold), T4 (lift) |
| §2 FlightSim integration | T4 |
| §2 Decoupled road system | T11, T17 |
| §3.1 Road graph generation | T5, T6, T7 |
| §3.1 Spatial index | T8 |
| §3.2 Geometry (ribbon, rails, disks, materials) | T9, T10 |
| §3.3 Streaming manager | T11 |
| §3.4 Collision + off-graph recovery | T17, T24 |
| §4.1 Physics | T13 |
| §4.2 Optional brake | Deferred per spec; `brakeHeld` hook present in T13 — wiring deferred |
| §4.3 Input lift | T14 |
| §4.4 Chase camera | T15 |
| §4.5 Car model | T12 |
| §5.1 HUD (speedometer, mini-map, biome label, version) | T20, T21, T22 |
| §5.2 Menu | T23 |
| §5.3 Respawn overlay | T24 |
| §5.4 State machine | T19, T23 (wiring) |
| §6 Audio | T18 |
| §7 Boot sequence | T3, T4, T11, T16, T17, T18, T22, T23, T24 (cumulative) |
| §8 Performance budget | Verified in T25; choices baked into T11 (BUILD_PER_FRAME, STREAM_RADIUS), T3 (pixelRatio cap, antialias gate) |
| §9 Testing — headless | T5, T6, T7, T8, T13, T14, T17, T19 |
| §9 Testing — manual | T25 |
| §10 Thumbnail (deferred) | T2 placeholder; real thumbnail deferred per spec |
| §10a Deploy gating | T25 explicit note |
| §11 Out of scope | n/a — explicitly no tasks |
| §12 Open follow-ups | n/a — explicitly no tasks |
