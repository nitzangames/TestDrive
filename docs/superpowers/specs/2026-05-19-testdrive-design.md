# TestDrive — Design Spec

Date: 2026-05-19
Status: Approved — ready for implementation plan
Slug: `test-drive`
Platform: nitzan.games (1080×1920 portrait iframe)

## 1. Overview

TestDrive is an open-road driving sandbox on the FlightSim procedural terrain.
The player drives a single well-tuned car along a procedurally generated road
network that spans the entire 64 km FlightSim world. There is no score, no
timer, no traffic — the loop is "pick a direction, drive across mountains,
rivers, forests, and the other biomes." Roads are bounded by guardrails on
both sides, so the playable surface is the road network itself; the surrounding
terrain is visual context.

### Gameplay loop

1. Player starts on the main menu (single car on a turntable).
2. Player taps Start.
3. Camera fades into the world at the spawn point (graph node nearest origin).
4. Player drives. Auto-throttle keeps the car rolling; player drags to steer.
   At junctions the player picks the next road by aiming the car at it.
5. Player drives indefinitely. No win condition. No game over.

### Design pillars

- **Calm sandbox.** No score, no failure. The fun is the drive itself.
- **Reuse FlightSim terrain unchanged.** Same biomes, same chunk pipeline,
  same lighting. Only the POI/village layer is disabled at the call site.
- **Single new system.** The "road" system is the only substantial new code.
  Everything else (chunked terrain, biome palette lerp, scatter, chase camera,
  drag-to-steer input, engine audio) is lifted from existing JSGames projects.
- **Mobile WebGL budget.** Stream road geometry near the camera; never build
  the whole 64 km road as one mesh.

## 2. Architecture overview

TestDrive ships as a standalone JSGames game with its own zip. It does NOT
import from sibling project directories at runtime.

```
TestDrive/
├── index.html
├── meta.json                ← slug "test-drive", title "TestDrive"
├── thumbnail.png            ← 512×512; placeholder during dev (see §10)
├── package.json
├── shell/
│   └── main.js              ← boot, scene setup, game loop
├── lib/
│   ├── version.js
│   ├── terrain/             ← lifted from FlightSim, UNTOUCHED
│   ├── scatter/             ← lifted from FlightSim, UNTOUCHED
│   ├── poi/                 ← lifted from FlightSim, UNTOUCHED but inactive
│   ├── game/
│   │   ├── biomes.js        ← lifted from FlightSim, UNTOUCHED
│   │   └── state.js         ← MENU / DRIVE
│   ├── roads/               ← NEW
│   │   ├── graph.js
│   │   ├── geometry.js
│   │   ├── manager.js
│   │   └── collision.js
│   ├── car/
│   │   ├── model.js
│   │   ├── physics.js
│   │   ├── input.js         ← lifted from FormulaChampions3D js/input.js
│   │   └── camera.js
│   ├── audio/
│   │   └── engine.js
│   └── ui/
│       ├── menu.js
│       ├── hud.js
│       └── crash-overlay.js
└── tests/
    ├── road-graph.test.js
    ├── road-collision.test.js
    └── car-physics.test.js
```

### FlightSim integration

- `lib/terrain/`, `lib/scatter/`, `lib/poi/`, and `lib/game/biomes.js` are
  copied from `JSGames/FlightSim/lib/...` at project setup. They are not
  modified.
- The single point of behavioral difference is the `createTerrain(...)` call
  in `shell/main.js`, which passes `enableVillages: false`. This bypasses
  the village registry, so no POI meshes are ever placed in the world. POI
  module code is loaded and POI geometry constructors are still called (to
  populate the chunk-worker's geometry dictionary), but with no villages
  registered nothing references that geometry — it sits unused. This keeps
  the lifted terrain code modification-free.
- `lib/plane/`, `lib/game/planes.js`, `lib/game/collision.js`,
  `lib/ui/*` from FlightSim are NOT copied — they are replaced by the
  car/road/UI modules above.

### Decoupled road system

The road system is intentionally **not** wired into FlightSim's chunk worker.
It is a parallel module that:

1. Generates the road graph once at boot from a deterministic seed.
2. Streams per-segment ribbon and guardrail meshes near the camera each frame.
3. Owns collision between the car and road / guardrails.

This keeps the lifted terrain code clean and re-syncable from upstream.

## 3. Road system

### 3.1 Graph generation (`lib/roads/graph.js`)

Deterministic from `seed`. Built once on the main thread at boot. Expected
~50–150 ms for a 64 km world (comparable to FlightSim's village registry).

**Node candidates.** Scatter ~400 candidate junction points on a jittered grid
across the 64 km world (~3.2 km cell). For each candidate:

- Sample terrain slope in a small neighborhood (4 height samples ±50 m around
  the candidate). Reject if average absolute slope > **18°**.
- Reject if `riverDepthAt(x, z, riverSegments, 1) > 0` — the candidate sits on
  a river. Bank avoidance is handled by the slope check. (Matches FlightSim's
  own pattern for village rejection.)
- Reject if within **600 m** (Poisson-disk style) of any previously-accepted
  node. Prevents node clumping.

Expected accepted nodes: ~150–250.

**Edges.**

1. Delaunay triangulation over accepted nodes → candidate edges.
2. Prune any candidate edge that:
   - Is longer than **6000 m**, OR
   - Has any 50-m sub-segment whose slope exceeds **12°**, OR
   - Has total height delta > **200 m**, OR
   - Crosses water at any 50-m sample point — checked via
     `riverDepthAt(x, z, riverSegments, 1) > 0`.
3. Compute MST over surviving edges → guarantees a single connected component.
4. Add the shortest surviving non-MST edges until total edge count is
   **1.25 × MST edge count**. Gives loops and choices at junctions.

Expected total edges: ~300–500.

**Per-edge polyline.** Each edge is converted from a straight A→B line into
a polyline of ~20–40 points that follows terrain gently:

- Sample terrain height every ~50 m along the line.
- Smooth the path in XZ with a 1D low-pass filter (3-tap moving average,
  applied 2 passes) so it curves naturally instead of zig-zagging.
- The polyline plus a fixed `roadHalfWidth = 5 m` defines the corridor.

**Spawn point.** The accepted node nearest world origin. Car heading aligned
with the first outgoing edge.

**Spatial index.** Bucketed grid (~200 m cells) keyed by edge polyline points
so the manager and collision code can do O(1) average "edges near (x, z)"
lookups each frame.

**Output shape** (returned from `buildRoadGraph(opts)`):

```js
{
  nodes:  [{ id, x, y, z, edges: [edgeIds...] }, ...],
  edges:  [{ id, nodeA, nodeB, polyline: [{x, y, z}, ...], length }, ...],
  spawn:  { x, y, z, headingY },
  spatialIndex: { nearEdges(x, z, radius) -> edgeIds[] },
}
```

### 3.2 Geometry (`lib/roads/geometry.js`)

For each edge the builder returns three `THREE.BufferGeometry`s:

- **Road ribbon.** For each polyline point, compute the XZ-plane perpendicular
  and emit two vertices at `terrainHeight(x, z) + roadOffsetY` where
  `roadOffsetY = 0.05 m`. Triangle strip down the ribbon. Vertex count ~80
  per typical edge. Material: a single shared `MeshBasicMaterial` with a
  procedurally-painted asphalt texture (drawn into a small canvas at boot
  with a subtle center stripe).
- **Left guardrail / right guardrail.** Two separate strip meshes, one per
  side. Each vertex pair: a bottom point at terrain height and a top point
  at terrain height + `guardrailHeight = 0.8 m`. Material: shared
  `MeshLambertMaterial`, light grey.

**Junction disks.** At every graph node with degree ≥ 3 (a real junction —
degree-2 nodes are just smooth bends in a road and need no disk) a small
terrain-conforming disk (~12 m radius) is built and added at that node.
Its vertices also sample `terrainHeight`. Guardrails on incoming edges
stop at `nodeRadius = 12 m` from any degree-≥3 node so the player can
transition freely.

### 3.3 Streaming manager (`lib/roads/manager.js`)

State: `activeEdges: Map<edgeId, { road, leftRail, rightRail }>`,
`lruCache: Map<edgeId, geometries>` (max ~80 entries).

Each frame:

1. Read `camera.position`.
2. `nearEdges = spatialIndex.nearEdges(camera.x, camera.z, streamRadius=1500)`.
3. For each `id` in `nearEdges` but not in `activeEdges`:
   - If `id` is in `lruCache`, restore its meshes to the scene.
   - Else, append `id` to a build queue.
4. For each `id` in `activeEdges` whose nearest polyline point is more than
   `streamRadius + 300 m` from the camera: remove meshes from scene, move
   entry to `lruCache`, evict oldest if cache exceeds 80.
5. Pop up to **2** entries off the build queue, build their geometries
   synchronously, add meshes to the scene, place them in `activeEdges`.
   Spreading the build work limits per-frame stalls to ~3–6 ms.

A separate "junction disks" loop applies the same scheme to graph nodes.

### 3.4 Collision (`lib/roads/collision.js`)

Per **substep** (1/120 s — see §4.1), after the car position is integrated:

1. `candidates = spatialIndex.nearEdges(car.x, car.z, 20)`.
2. For each candidate edge, find the nearest polyline segment via squared
   distance to line segments. Track global nearest. Return `{ edgeId,
   segIndex, lateralOffset, forwardT }`.
3. If `globalNearestDist > 30 m`: trigger off-graph recovery (see below).
4. If the car is inside a junction radius (`12 m` of any incident node),
   skip the lateral clamp.
5. Otherwise if `|lateralOffset| > roadHalfWidth − carHalfWidth (~3.5 m)`:
   - Clamp lateral position back to the corridor wall.
   - Project velocity onto the segment tangent (kill lateral component).
   - Multiply speed by **0.88** (12 % loss per impact).

**Junction direction selection.** When the car leaves a junction radius, the
manager finds the outgoing edge whose tangent at the junction node has the
highest dot product with the car's heading. That edge becomes the next
"active edge" hint passed to subsequent collision queries (so we don't reset
candidate search every frame from scratch).

**Off-graph recovery.** A safety check runs every ~0.5 s. If the car has
been more than 30 m from any road edge for a full check interval, trigger
a 600 ms fade-to-black, snap car position to `graph.spawn`, snap camera,
fade back in.

## 4. Vehicle

### 4.1 Physics (`lib/car/physics.js`)

FC3D-style auto-throttle. Speed and steering only; no separate gas/brake
input. Fixed timestep `1/120 s` (2 substeps per 60-fps frame; matches the
platform's recommendation for stacking/contact-heavy physics, applied here
for guardrail-clamp stability). Variable-dt is fine for visuals but
substepped for physics & collision stability.

```
const MAX_SPEED        = 60;     // m/s (~215 km/h)
const ACCELERATION     = 12;     // m/s²
const BRAKE_FROM_TURN  = 0.55;   // up to 55% top-speed cut at full lock
const STEER_RATE_LOW   = 1.2;    // rad/s at low speed
const STEER_RATE_HIGH  = 0.5;    // rad/s at top speed
const CAR_RIDE_HEIGHT  = 0.5;    // m above terrain
const CAR_HALF_WIDTH   = 0.9;    // m (for guardrail clamp)
```

Per substep:

1. Read steering input `s ∈ [−1, +1]` from `car/input.js`.
2. `effMax = MAX_SPEED × (1 − BRAKE_FROM_TURN × |s|)`.
3. Lerp speed toward `effMax`: accel at `ACCELERATION`, decel at
   `2 × ACCELERATION`.
4. `rate = lerp(STEER_RATE_LOW, STEER_RATE_HIGH, speed / MAX_SPEED)`.
5. `headingY += s × rate × dt`.
6. `vx = sin(headingY) × speed`, `vz = cos(headingY) × speed`.
7. `x += vx × dt`, `z += vz × dt`.
8. `y = terrainHeight(x, z) + CAR_RIDE_HEIGHT`.
9. Sample terrain ±1.2 m fore/aft + side/side for visual pitch/roll. Lerp
   the car mesh's local pitch/roll toward those targets at 0.15.

### 4.2 Optional tap-to-brake

Marked optional in v1. A second pointer-down (a tap outside the steering
drag range) or a held `Space` key clamps `effMax` to 10 m/s while held.
Decision deferred to first playtest — easy to add or remove.

### 4.3 Input (`lib/car/input.js`)

Lifted verbatim from `JSGames/FormulaChampions3D/js/input.js`:

- Pointer-capture on canvas, raw clientX stored on pointermove, processed
  once per frame via `update()` into a `steering ∈ [−1, +1]` value with
  `maxDragPx = 150`.
- A/D and Arrow Left/Right keyboard fallback with discrete tap bump +
  hold-rate ramp + decay to zero on release. Reverse-direction multiplier
  speeds up crossing zero.
- Blur cleanup; clean handling of mouse, touch, pen via pointer events.

Only the file's import path changes. No behavioral changes from FC3D.

### 4.4 Camera (`lib/car/camera.js`)

Chase camera, FlightSim `ChaseCamera`-style. Local target offset behind and
above the car (default 7 m back, 3 m up; look-at point 4 m ahead at 1 m
height). Lerp position toward target at **0.12**, yaw/pitch toward target
at **0.10** per frame — per [[camera-input-smoothing]], raw target-following
will stutter even at 120 Hz. Auto-aim: target yaw eases toward `headingY`
plus a speed-proportional lookahead (disabled below 8 m/s). FOV 60°,
near/far 0.5 / 4000.

### 4.5 Car model (`lib/car/model.js`)

Geometry-only three.js mesh. Single car: sports coupe proportions.
Approximate dimensions: 4.4 m long × 1.8 m wide × 1.3 m tall. Body, two
side glass strips, four wheels with simple cylinders, headlights as small
emissive quads. Designed to be readable from the chase camera distance.

Exact body proportions/color will be sketched as a real-three.js mockup
served via the local dev server (per [[3d-mockups]]) before committing to
the model.

## 5. UI

### 5.1 HUD (`lib/ui/hud.js`)

All canvas-2D, drawn in a separate `<canvas>` overlay above the WebGL
canvas (Pattern A from the platform's developer guide; avoids the
compositor stalls described in [[mobile-webgl-budget]]).

Elements (sizes from the canonical [[type-ladder]]):

- **Speedometer.** Digital km/h, bottom-center. Value at **Display 144 px**,
  label "KM/H" at **Caption 21 px**.
- **Mini-map.** 280×280 canvas-px, top-right with safe-area padding. The
  full road graph is pre-rendered once at boot to an offscreen canvas as
  1-px lines. Per frame, `drawImage` a 6 km × 6 km windowed sub-region
  centered on the car, then overlay a small triangle for the player and an
  "N" at the top edge. **Always north-up.** Frame budget < 0.4 ms.
- **Biome label.** Centered top. Fades in for ~3 s when
  `biomeAt(car.x, car.z).name` changes. **Body Large 48 px**.
- **Version stamp.** Bottom-left, opacity 0.5, **Caption 21 px**, per
  [[per-commit-version-bump]].

### 5.2 Menu (`lib/ui/menu.js`)

Single screen. Layout:

- Title "TestDrive" at **Display 144 px**, top-center.
- Tagline (one line) at **Heading 90 px**.
- Single car on a slow turntable rendered in its own `menuScene` with its
  own `menuCam` and lights (same pattern FlightSim uses) so the world
  scene is not running while in the menu.
- Single full-width **Start** button at **Subheading 66 px**.
- Version stamp bottom-left.

No car selector, no settings screen at v1.

### 5.3 Respawn overlay (`lib/ui/crash-overlay.js`)

Triggered only by the stuck/off-graph recovery in §3.4. Brief black fade
(~600 ms), car and camera snap to `graph.spawn`, fade back. No "you
crashed" text.

### 5.4 State machine (`lib/game/state.js`)

Two states:

- `MENU` — `menuScene` ticks; world scene paused (chunk worker idle, road
  manager idle, audio suspended).
- `DRIVE` — world scene ticks; menu suspended.

Transition `MENU → DRIVE` on Start. No `DRIVE → MENU` at v1.

## 6. Audio (`lib/audio/engine.js`)

WebAudio procedural engine note tied to speed.

- Two `OscillatorNode`s (square @ `f0`, sawtooth @ `2 × f0`, mixed ~70/30)
  → `BiquadFilterNode` (lowpass) → `GainNode` → destination.
- `f0 = 60 Hz`. `freq = f0 × (1 + speed / MAX_SPEED × 6)` → sweeps
  ~60 → ~420 Hz.
- Gain: `lerp(0.04, 0.18, speed / MAX_SPEED)`.
- Lowpass cutoff: `lerp(1200, 4000, speed / MAX_SPEED)`.
- `AudioContext` created on the first user gesture (Start button).
  Suspended on focus loss / PlaySDK pause; resumed on focus.

No music, no other SFX at v1.

## 7. Boot sequence (`shell/main.js`)

```
1.  Read or mint LocalStorage seed (key "testdrive.seed").
2.  Build renderer (antialias off on mobile per [[mobile-webgl-budget]];
    setPixelRatio capped at 2).
3.  Build worldScene + worldCam + menuScene + menuCam.
4.  buildScatterRegistry(THREE).
5.  createTerrain({ THREE, scene: worldScene, renderer, seed, biomeAt,
    scatterGeometries, enableVillages: false }).
6.  buildRoadGraph({ seed, terrainHeightFn, biomeAt, riverSegments }).
7.  Initialize RoadManager(graph, worldScene).
8.  Build car model, place at graph.spawn.
9.  Initialize ChaseCamera, Input, EnginePhysics.
10. Build HUD overlay; pre-render road graph to mini-map offscreen canvas.
11. Show menu. On Start: build engine audio (first user gesture),
    transition to DRIVE.
12. Game loop: fixed-dt substeps for physics + collision; variable-dt for
    rendering, road streaming, biome lerp, HUD.
```

## 8. Performance budget

- **Road system per-frame:** ~30 visible segments × 3 meshes = ~90 draw
  calls, ~7 k verts. Mesh build spread to 2 segments/frame max (3–6 ms).
- **Terrain (inherited):** unchanged from FlightSim.
- **Total per-frame work target:** ≤ 8 ms on mid-range mobile (60 fps).
- **Renderer:** `setPixelRatio(Math.min(devicePixelRatio, 2))`; `antialias`
  disabled on mobile UA per [[mobile-webgl-budget]].
- **Battery/focus:** rAF runs only while visible; physics + audio paused
  on `visibilitychange` per `GAME_DEV_NOTES` battery guidance.

## 9. Testing

### Headless (vitest)

- `tests/road-graph.test.js`
  - Same seed → identical node/edge lists.
  - Graph is a single connected component.
  - No edge violates slope / length / height-delta / river-cross thresholds.
  - Spawn node is reachable from any other node.
- `tests/road-collision.test.js`
  - Lateral clamp on a synthetic 3-segment polyline returns expected
    position and velocity.
  - Junction radius disables clamp.
  - Off-graph recovery triggers at > 30 m after a full check interval.
- `tests/car-physics.test.js`
  - Full-lock steering yields `effMax = MAX_SPEED × (1 − BRAKE_FROM_TURN)`.
  - Heading integration is stable over a 10 s simulated drive (no NaN,
    no monotonic drift in straight-line speed).
  - Drag input handler produces correct `steering` for synthetic pointer
    events.

### Manual verification (per [[verify]])

Before each commit that ships:

- Launch dev server (`npm run dev` on port 8086). Drive in browser.
- Confirm: spawn lands on road; junctions are traversable; guardrails
  clamp cleanly; mini-map matches actual visible road; speedometer feels
  right; engine note sweeps audibly; biome label appears on biome change.
- Smoke-test on mobile via the platform preview.

## 10. Thumbnail

**Deferred.** A placeholder 512×512 PNG ships during development so the
deploy passes platform validation. The real thumbnail is designed once the
car + roads + terrain are rendering together in-game — at that point a
small three.js mockup harness is added (`thumbnails.html`) that renders
several composition/palette/camera presets the player can flip between in
a browser, and we pick from real renders. The chosen composition is then
captured by `render-thumbnail.js` and committed.

Per the platform rule, the final thumbnail must be a real three.js render
(no CSS/SVG approximations) and must include the title "TestDrive"
overlaid on the image.

## 10a. Deploy gating

Per the project's [[deploy-gating]] rule, this spec does NOT authorize any
platform deploy. The user verifies builds locally first. Each deploy is an
explicit, per-action confirmation when the user asks for it.

## 11. Out of scope (v1)

Listed explicitly so the implementation plan does not drift:

- AI traffic.
- Multiple cars, car select, car unlocks, cosmetics.
- Career, missions, checkpoints, time trials, leaderboards.
- Off-road driving (guardrails enforce the road network).
- Day/night cycle, headlights, weather.
- Bridges, overpasses, tunnels.
- Music or non-engine SFX.
- In-game pause / settings / mute UI (rely on PlaySDK mute + focus pause).
- Multi-touch beyond the optional brake tap.

## 12. Open follow-ups (non-blocking)

- Final car body proportions/color — sketched as a real-three.js mockup
  served via the local dev server before committing to the model.
- Whether to add a thin striped center line to the road texture — small
  follow-up after first drive feels.
- Optional tap-to-brake — decision after first playtest.
- **Thumbnail design** — pick from real three.js renders after the car,
  road, and terrain are in-game together. See §10.
