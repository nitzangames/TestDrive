import { buildRiverGraph } from './river-graph.js';
import { ChunkManager } from './chunk-manager.js';
import { ChunkRunner } from './chunk-runner.js';
import { ChunkWorkerProxy } from './chunk-worker-proxy.js';
import { buildTerrainMaterial, applyStyle, buildSkyDome, STYLES } from './style-system.js';
import { atmosphereAt } from '../game/biomes.js';
import { buildWaterPlane } from './water.js';
import { buildConiferGeometry, buildBillboardGeometry, buildBillboardMaterial } from './trees.js';
import { terrainHeight } from './height.js';
import { riverDepthAt } from './carve.js';
import { buildVillageRegistry } from '../poi/villages.js';
import { buildTunnelRegistry } from '../poi/tunnels.js';
import { buildTunnelMCMesh }   from '../poi/tunnel-mc.js';
import { LandmarkMarkers } from '../poi/markers.js';
import {
  buildHouseGeometry, buildFlatHouseGeometry, buildSteepHouseGeometry,
  buildBarnGeometry, buildChurchGeometry,
  buildWindmillTowerGeometry, buildWindmillBladeGeometry,
  buildRunwayGeometry,
  buildCastleKeepGeometry, buildCastleTowerGeometry, buildCastleWallGeometry,
  buildMonasteryChurchGeometry, buildMonasteryWingGeometry,
} from '../poi/buildings.js';

const SEED_KEY = 'terrain.seed';
const WORLD_SIZE = 64000;
const RIVER_GRID_N = 256;

function resolveSeed(opts) {
  if (opts.seed !== undefined && opts.seed !== null) return opts.seed | 0;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('seed');
  if (fromUrl !== null) {
    const parsed = parseInt(fromUrl, 36);
    if (Number.isFinite(parsed)) return parsed;
  }
  const stored = window.localStorage.getItem(SEED_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const buf = new Uint32Array(1);
  window.crypto.getRandomValues(buf);
  const seed = buf[0] >>> 0;
  window.localStorage.setItem(SEED_KEY, String(seed));
  return seed;
}

export function createTerrain(opts) {
  const { THREE, scene, renderer, biomeAt = null, scatterGeometries = null } = opts;
  if (!THREE || !scene || !renderer) {
    throw new Error('createTerrain requires { THREE, scene, renderer }');
  }
  const seed = resolveSeed(opts);

  // 1. River graph (one-time, main thread).
  const graph = buildRiverGraph({ seed, gridN: RIVER_GRID_N, worldSize: WORLD_SIZE });

  // Forest village registry — anchor grid scan, deterministic per seed.
  // Sync, ~10–30ms for 4096 cells. Eligibility uses the same biomeAt,
  // terrainHeight, and river segments the chunk pipeline uses, so renderer
  // and registry agree on which cells qualify.
  const villageRegistry = (biomeAt && opts.enableVillages !== false)
    ? buildVillageRegistry({
        seed,
        biomeAt,
        terrainHeightFn: (x, z) => terrainHeight(x, z, seed),
        riverDepthAtFn: (x, z) => riverDepthAt(x, z, graph.segments, 1),
      })
    : { all: [], inChunk: () => [], affectingChunk: () => [] };
  console.log('[poi] villages:', villageRegistry.all.length);

  // Tunnel registry — experimental. Phase 1: a small fixed test set near
  // spawn, no terrain interaction. Later phases add procedural placement
  // and heightfield carving along the tunnel corridor.
  const tunnelRegistry = buildTunnelRegistry({
    terrainHeightFn: (x, z) => terrainHeight(x, z, seed),
  });
  console.log('[poi] tunnels:', tunnelRegistry.all.length);

  // Per-tunnel marching-cubes meshes — each tunnel gets its own "mountain
  // mass" with the passage carved out. Built once at world init (cost is
  // hidden behind the loading screen) and added directly to the scene as
  // global meshes (NOT chunk-managed) since the volumes are small and
  // fixed for the world's lifetime.
  const tunnelMcMaterial = new THREE.MeshLambertMaterial({
    color: 0x7a7570,         // warm stone grey
    flatShading: false,
    // The MC mesh winds triangles for the standard Bourke convention, but
    // small numerical instabilities at the `min(mountainSDF, -tunnelSDF)`
    // seam can flip winding on a handful of triangles. DoubleSide papers
    // over that so the cavity interior reads cleanly from either side
    // (cheap — per-tunnel meshes are ~10–30k triangles).
    side: THREE.DoubleSide,
  });
  const tunnelMcGroup = new THREE.Group();
  tunnelMcGroup.name = 'TunnelMCMeshes';
  scene.add(tunnelMcGroup);
  for (const T of tunnelRegistry.all) {
    const geom = buildTunnelMCMesh(THREE, T, (x, z) => terrainHeight(x, z, seed));
    const mesh = new THREE.Mesh(geom, tunnelMcMaterial);
    mesh.name = `tunnel-mc:${T.id}`;
    tunnelMcGroup.add(mesh);
  }

  // 2. Worker (or main-thread fallback).
  let runner;
  let runnerType;
  try {
    runner = new ChunkWorkerProxy({ seed, riverSegments: graph.segments });
    runnerType = 'worker';
  } catch (err) {
    console.warn('[terrain] Worker unavailable, falling back to main-thread chunk gen.', err);
    runner = new ChunkRunner({ seed, riverSegments: graph.segments });
    runnerType = 'main-thread';
  }
  console.log('[terrain] chunk runner:', runnerType, 'seed:', seed);

  // 3. Materials, water, lights.
  const terrainMaterial = buildTerrainMaterial(THREE);
  // MeshPhongMaterial supports flatShading; MeshLambertMaterial in r128 doesn't.
  const treeMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 });
  // Wind sway: cone vertices (y > 1.2) sway based on time + per-instance world-XZ phase.
  // Trunk vertices (y ≤ 1.2) stay fixed so the base doesn't visibly slide.
  // Distance fade: trees scale toward 0 at the LOD-0 ring edge so newly-loaded
  // chunks grow their trees in from zero rather than popping in at full size.
  treeMaterial.userData.uTime          = { value: 0 };
  // Doubled from 600/750 — trees emit at LOD 0 AND LOD 1 now, so visibility
  // extends to ~1.5 km from camera.
  treeMaterial.userData.uTreeFadeStart = { value: 1200 };
  treeMaterial.userData.uTreeFadeEnd   = { value: 1500 };
  treeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime          = treeMaterial.userData.uTime;
    shader.uniforms.uTreeFadeStart = treeMaterial.userData.uTreeFadeStart;
    shader.uniforms.uTreeFadeEnd   = treeMaterial.userData.uTreeFadeEnd;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uTreeFadeStart;\nuniform float uTreeFadeEnd;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
         {
           // instanceMatrix[3].xyz is the per-tree translation (world XZ via modelMatrix).
           vec3 _instOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           float _swayH = max(0.0, position.y - 1.2);
           float _phase = _instOrigin.x * 0.05 + _instOrigin.z * 0.03;
           transformed.x += sin(uTime * 1.2 + _phase) * 0.020 * _swayH;
           transformed.z += cos(uTime * 0.9 + _phase * 1.1) * 0.015 * _swayH;
           // Shrink-fade at LOD ring edge. Tree is scaled around its local
           // origin (trunk base), so fade→0 collapses to a point at ground level.
           vec4 _worldInst = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
           float _distToCam = distance(_worldInst.xyz, cameraPosition);
           float _fade = 1.0 - smoothstep(uTreeFadeStart, uTreeFadeEnd, _distToCam);
           transformed *= _fade;
         }
         #endif`
      );
  };
  const treeGeometry = buildConiferGeometry(THREE);
  const billboardMaterial = buildBillboardMaterial(THREE);
  // Near-mode billboard overlay used in LOD-0 chunks. Visible at the far edge
  // of LOD 0 and fades OUT as the tree at the same position grows in. The two
  // fade ranges are mirror images: tree fade 750→600 in, billboard fade
  // 750→600 out, so the silhouette stays unbroken through LOD 1→0 transition.
  const billboardMaterialNear = buildBillboardMaterial(THREE, {
    fadeMode: 'near', fadeStart: 600, fadeEnd: 750,
  });
  const billboardGeometry = buildBillboardGeometry(THREE);

  // --- Building material ---
  // Shared by all village building types (house, barn, windmill tower, church).
  // Distance shrink-fade matches the tree pattern (600–750m). Per-instance
  // colors via two InstancedBufferAttributes (aWallColor, aRoofColor), routed
  // in the vertex shader by per-vertex `colorRole` (0 = wall, 1 = roof).
  const buildingMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true, flatShading: true, shininess: 0,
    // DoubleSide because the prism-roof triangles in buildings.js have
    // inward-facing winding (the explicit per-face normals are outward, so
    // lighting is correct, but FrontSide culling would hide them).
    side: THREE.DoubleSide,
  });
  // Doubled from 900/1200 — buildings emit at LOD 0 AND LOD 1, visible
  // out to ~2.4 km.
  buildingMaterial.userData.uFadeStart = { value: 1800 };
  buildingMaterial.userData.uFadeEnd   = { value: 2400 };
  buildingMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeStart = buildingMaterial.userData.uFadeStart;
    shader.uniforms.uFadeEnd   = buildingMaterial.userData.uFadeEnd;
    shader.vertexShader =
      `uniform float uFadeStart;\n` +
      `uniform float uFadeEnd;\n` +
      `attribute vec3 aWallColor;\n` +
      `attribute vec3 aRoofColor;\n` +
      `attribute float colorRole;\n` +
      shader.vertexShader
        .replace('#include <color_vertex>',
          `vColor = mix(aWallColor, aRoofColor, colorRole);`)
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
           {
             vec4 _worldInst = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             float _dist = distance(_worldInst.xyz, cameraPosition);
             float _fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, _dist);
             transformed *= _fade;
           }
           #endif`);
  };

  // --- Windmill blade material ---
  // Spinning blades — uTime drives rotation around the LOCAL X axis. Same fade
  // behaviour. Shares the wall/roof color attributes (both get the same accent
  // tone per instance so the shader path matches buildingMaterial).
  const windmillBladeMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true, flatShading: true, shininess: 0,
    side: THREE.DoubleSide,
  });
  windmillBladeMaterial.userData.uTime      = { value: 0 };
  windmillBladeMaterial.userData.uFadeStart = { value: 1800 };
  windmillBladeMaterial.userData.uFadeEnd   = { value: 2400 };
  windmillBladeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime      = windmillBladeMaterial.userData.uTime;
    shader.uniforms.uFadeStart = windmillBladeMaterial.userData.uFadeStart;
    shader.uniforms.uFadeEnd   = windmillBladeMaterial.userData.uFadeEnd;
    shader.vertexShader =
      `uniform float uTime;\n` +
      `uniform float uFadeStart;\n` +
      `uniform float uFadeEnd;\n` +
      `attribute vec3 aWallColor;\n` +
      `attribute vec3 aRoofColor;\n` +
      `attribute float colorRole;\n` +
      shader.vertexShader
        .replace('#include <color_vertex>',
          `vColor = mix(aWallColor, aRoofColor, colorRole);`)
        .replace('#include <begin_vertex>',
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
           {
             // Rotate around local Z by uTime * 0.6 rad/s — the blade
             // geometry is a 4-armed cross in the XY plane; Z is the
             // hub axis perpendicular to the fan plane.
             float _ang = uTime * 0.6;
             float _c = cos(_ang), _s = sin(_ang);
             vec3 _r = vec3(
               transformed.x * _c - transformed.y * _s,
               transformed.x * _s + transformed.y * _c,
               transformed.z
             );
             transformed = _r;
             // Distance fade as for the building material.
             vec4 _worldInst = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             float _dist = distance(_worldInst.xyz, cameraPosition);
             float _fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, _dist);
             transformed *= _fade;
           }
           #endif`);
  };

  // --- Building geometries ---
  // One BufferGeometry per building type, built once and shared across all
  // chunks. ChunkManager clones per-chunk before setting per-instance color
  // attributes so chunks don't stomp each other's attribute data.
  const buildingGeometries = {
    // Default per type (used when no biome variant matches)
    house:          buildHouseGeometry(THREE),
    barn:           buildBarnGeometry(THREE),
    church:         buildChurchGeometry(THREE),
    windmill:       buildWindmillTowerGeometry(THREE),
    windmillBlades: buildWindmillBladeGeometry(THREE),
    // Biome-specific house variants — ChunkManager looks up `${type}_${templateKey}`
    // first and falls back to plain `type` if no variant exists.
    house_forest:   buildHouseGeometry(THREE),
    house_desert:   buildFlatHouseGeometry(THREE),
    house_arctic:   buildSteepHouseGeometry(THREE),
    runway:         buildRunwayGeometry(THREE),
    // Castle pieces
    castle_keep:    buildCastleKeepGeometry(THREE),
    castle_tower:   buildCastleTowerGeometry(THREE),
    castle_wall:    buildCastleWallGeometry(THREE),
    castle_chapel:  buildHouseGeometry(THREE),   // small inner chapel — reuses house shape
    // Monastery pieces
    monastery_church: buildMonasteryChurchGeometry(THREE),
    monastery_wing:   buildMonasteryWingGeometry(THREE),
    // Tunnels are NOT in this map — they render via marching-cubes meshes
    // built per-tunnel and added directly to the scene below.
  };

  // Water plane is sized to comfortably exceed camera far-plane; we move it to follow
  // the camera in XZ each frame so the edge is never visible and depth precision stays
  // useful (a fixed 64 km plane at origin caused horizon flicker when viewed from far).
  const water = buildWaterPlane(THREE, 16000);
  scene.add(water);

  const skyDome = buildSkyDome(THREE);
  scene.add(skyDome);

  // Sun + hemi intensities tuned so vertex colors stay saturated (don't
  // clip toward white). Total scene exposure ~1.0 instead of 1.55.
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(80, 120, 60);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xb8e0ff, 0x6a8050, 0.35);
  scene.add(hemi);

  // 4. Style.
  const styleName = opts.style || 'lowpoly';
  applyStyle(THREE, scene, terrainMaterial, sun, hemi, water, styleName, skyDome);

  // Nearest-village beacon: a single tall pillar that snaps to the closest
  // village on every update(). Renders OUTSIDE the chunk system so it's
  // visible from any distance (buildings themselves only emit within the
  // LOD-0 chunk ring, so without this you can't spot a village until you
  // are nearly on top of it). Tracks the same village the HUD arrow points
  // at — so the player can sight the pillar in the world to fly toward it.
  let villageBeacon = null;
  if (villageRegistry.all.length > 0) {
    const geom = new THREE.CylinderGeometry(4.0, 6.0, 120, 8, 1, false);
    geom.translate(0, 60, 0);
    // X-ray through terrain so the beacon is findable even when a mountain is
    // between the camera and the village (otherwise depth-test hides it and
    // the player has nothing to fly toward).
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8830, transparent: true, opacity: 0.55,
      depthTest: false, depthWrite: false,
    });
    villageBeacon = new THREE.Mesh(geom, mat);
    villageBeacon.frustumCulled = false;
    villageBeacon.renderOrder = 10;
    scene.add(villageBeacon);
  }

  // Fly-through markers — one billboarded vertical ring per landmark. The
  // ring rotates around Y each frame to face the plane, so the pilot can
  // fly through it from any approach direction.
  const landmarks = [];
  for (const v of villageRegistry.all) {
    const t = v.markerTarget;
    if (!t) continue;
    landmarks.push({ id: `v:${v.id}`, x: t.x, y: t.y, z: t.z });
  }
  const markers = new LandmarkMarkers(THREE, scene, landmarks);

  // 5. Chunk manager.
  const perfMode = opts.perfMode === 'auto' ? 'high' : (opts.perfMode || 'high');
  const cm = new ChunkManager({
    THREE, scene, runner, terrainMaterial, treeMaterial, treeGeometry,
    billboardMaterial, billboardMaterialNear, billboardGeometry, perfMode,
    biomeAt, scatterGeometries,
    villageRegistry,
    tunnelRegistry,
    buildingMaterial,
    windmillBladeMaterial,
    buildingGeometries,
    chunkPostprocessor: opts.chunkPostprocessor || null,
  });

  return {
    seed,
    riverSegments: graph.segments,
    lakes: graph.lakes,
    update(cameraPos) {
      cm.update(cameraPos);
      water.position.x = cameraPos.x;
      water.position.z = cameraPos.z;
      skyDome.position.copy(cameraPos);
      // Drive the water + tree wind shaders. Seconds since page load is monotonic and
      // independent of any per-frame dt drift, so wave phase stays continuous through stalls.
      const t = performance.now() / 1000;
      water.material.userData.uTime.value = t;
      treeMaterial.userData.uTime.value = t;
      windmillBladeMaterial.userData.uTime.value = t;
      // Snap the beacon to the nearest village's anchor so the player can
      // sight it in the world while flying toward the HUD arrow direction.
      if (villageBeacon) {
        const all = villageRegistry.all;
        if (all.length === 0) {
          villageBeacon.visible = false;
        } else {
          let best = all[0];
          let bestD2 = (best.x - cameraPos.x) ** 2 + (best.z - cameraPos.z) ** 2;
          for (let i = 1; i < all.length; i++) {
            const v = all[i];
            const d2 = (v.x - cameraPos.x) ** 2 + (v.z - cameraPos.z) ** 2;
            if (d2 < bestD2) { bestD2 = d2; best = v; }
          }
          villageBeacon.position.set(best.x, best.groundY, best.z);
          // Hide when player is right on top of the village — at that point the
          // buildings themselves are visible and the beacon would just be in
          // the way. Show again as soon as they fly away.
          const d = Math.sqrt(bestD2);
          villageBeacon.visible = d > 150;
        }
      }
    },
    getHeight(x, z) { return terrainHeight(x, z, seed); },
    villageRegistry,
    markers,
    nearestVillage(x, z) {
      // Linear scan over ~50 villages — cheap. Returns the full village
      // object with a `distance` field tacked on, or null. Callers may use
      // x/z/distance for HUD nav and buildings/falloffRadius for collision.
      const all = villageRegistry.all;
      if (all.length === 0) return null;
      let best = all[0];
      let bestD2 = (best.x - x) ** 2 + (best.z - z) ** 2;
      for (let i = 1; i < all.length; i++) {
        const v = all[i];
        const d2 = (v.x - x) ** 2 + (v.z - z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = v; }
      }
      return Object.assign({ distance: Math.sqrt(bestD2) }, best);
    },
    getRiverWidthAt(x, z) {
      const d = riverDepthAt(x, z, graph.segments, 1);
      return d > 0 ? 1 : 0;
    },
    setStyle(name) { applyStyle(THREE, scene, terrainMaterial, sun, hemi, water, name, skyDome); },
    setPerfMode(mode) { cm.setPerfMode(mode === 'auto' ? 'high' : mode); },
    // Lerp the atmospheric values toward the biome at the player's
    // position. Hemi + sun + sky background + fog all transition with the
    // current biome so the world LOOKS like the biome you're in, not just
    // the style you chose. ~0.04 per frame ≈ 1 s biome transition.
    updateAtmosphere(x, z) {
      const target = atmosphereAt(x, z);
      const k = 0.04;
      if (sun) {
        sun.color.r += (target.sun[0] - sun.color.r) * k;
        sun.color.g += (target.sun[1] - sun.color.g) * k;
        sun.color.b += (target.sun[2] - sun.color.b) * k;
      }
      if (hemi) {
        hemi.color.r       += (target.hemiSky[0]    - hemi.color.r) * k;
        hemi.color.g       += (target.hemiSky[1]    - hemi.color.g) * k;
        hemi.color.b       += (target.hemiSky[2]    - hemi.color.b) * k;
        hemi.groundColor.r += (target.hemiGround[0] - hemi.groundColor.r) * k;
        hemi.groundColor.g += (target.hemiGround[1] - hemi.groundColor.g) * k;
        hemi.groundColor.b += (target.hemiGround[2] - hemi.groundColor.b) * k;
        hemi.intensity     += (target.hemiIntensity - hemi.intensity) * k;
      }
      if (scene.background && scene.background.r !== undefined) {
        scene.background.r += (target.sky[0] - scene.background.r) * k;
        scene.background.g += (target.sky[1] - scene.background.g) * k;
        scene.background.b += (target.sky[2] - scene.background.b) * k;
      }
      if (scene.fog && scene.fog.color) {
        scene.fog.color.r += (target.fog[0] - scene.fog.color.r) * k;
        scene.fog.color.g += (target.fog[1] - scene.fog.color.g) * k;
        scene.fog.color.b += (target.fog[2] - scene.fog.color.b) * k;
        if (scene.fog.near !== undefined) {
          scene.fog.near += (target.fogNear - scene.fog.near) * k;
          scene.fog.far  += (target.fogFar  - scene.fog.far)  * k;
        }
      }
    },
    // Hand a serialized road graph to whichever runner is active (worker or
    // main-thread fallback). All subsequent chunks built will route their
    // heights / colours / tree placement through this graph so the road is
    // baked in at generation time instead of being post-processed later.
    setRoadGraph(serializedRoadGraph) {
      return runner.setRoadGraph(serializedRoadGraph);
    },
    dispose() {
      cm.dispose();
      scene.remove(water);
      water.geometry.dispose();
      water.material.dispose();
      scene.remove(skyDome);
      skyDome.geometry.dispose();
      skyDome.material.dispose();
      scene.remove(sun);
      scene.remove(hemi);
      terrainMaterial.dispose();
      treeMaterial.dispose();
      treeGeometry.dispose();
      billboardMaterial.dispose();
      billboardGeometry.dispose();
    },
  };
}
