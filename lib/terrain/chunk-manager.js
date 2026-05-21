import { CHUNK_SIZE } from './chunk-build.js';
import { buildTreeInstancedMesh } from './trees.js';
import { densityAt } from '../game/biomes.js';

export function lodForDistance(d, ranges) {
  if (d <= ranges.l0) return 0;
  if (d <= ranges.l1) return 1;
  if (d <= ranges.l2) return 2;
  return -1;
}

// Returns Map<key, lod> for every chunk that should be resident.
export function computeDesiredChunks({ camCx, camCz }, ranges, chunkSize) {
  const out = new Map();
  const radius = Math.ceil(ranges.l2 / chunkSize) + 1;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = camCx + dx, cz = camCz + dz;
      const centerX = (cx + 0.5) * chunkSize;
      const centerZ = (cz + 0.5) * chunkSize;
      const camCenterX = (camCx + 0.5) * chunkSize;
      const camCenterZ = (camCz + 0.5) * chunkSize;
      const d = Math.sqrt((centerX - camCenterX) ** 2 + (centerZ - camCenterZ) ** 2);
      const lod = lodForDistance(d, ranges);
      if (lod < 0) continue;
      out.set(cx + ',' + cz, lod);
    }
  }
  return out;
}

// Vertex-grid table per LOD per perf mode.
export const VERTEX_GRID = {
  high: { 0: 128, 1: 64, 2: 32 },
  low:  { 0: 64,  1: 32, 2: 16 },
};

// Per-LOD ring radii in meters.
export const RANGES = {
  high: { l0: 768,  l1: 1536, l2: 3072 },
  low:  { l0: 768,  l1: 1280, l2: 1500 },
};

// ChunkManager: orchestrates streaming. Owns Three.js objects.
export class ChunkManager {
  constructor({ THREE, scene, runner, terrainMaterial, treeMaterial, treeGeometry,
                billboardMaterial, billboardMaterialNear = null,
                billboardGeometry, perfMode = 'high',
                biomeAt = null, scatterGeometries = null,
                villageRegistry = null, tunnelRegistry = null,
                buildingMaterial = null,
                windmillBladeMaterial = null, buildingGeometries = null,
                chunkPostprocessor = null }) {
    this.THREE = THREE;
    this.scene = scene;
    this.chunkPostprocessor = chunkPostprocessor;
    this.runner = runner;
    this.terrainMaterial = terrainMaterial;
    this.treeMaterial = treeMaterial;
    this.treeGeometry = treeGeometry;
    this.billboardMaterial = billboardMaterial;
    this.billboardMaterialNear = billboardMaterialNear;
    this.billboardGeometry = billboardGeometry;
    this.perfMode = perfMode;
    this.biomeAt = biomeAt;
    this.scatterGeometries = scatterGeometries;
    // POI infrastructure: registry produces per-chunk village lists; buildings
    // are rendered via shared geometries + materials, cloned-per-chunk to keep
    // per-instance color attributes isolated.
    this.villageRegistry = villageRegistry || { all: [], inChunk: () => [], affectingChunk: () => [] };
    this.tunnelRegistry  = tunnelRegistry  || { all: [], inChunk: () => [], affectingChunk: () => [] };
    this.buildingMaterial = buildingMaterial;
    this.windmillBladeMaterial = windmillBladeMaterial;
    this.buildingGeometries = buildingGeometries || {};
    this.resident = new Map();      // key → { mesh, treeMesh, lod, cx, cz }
    this.inFlight = new Map();      // key → desired lod
    this.maxInFlight = 4;
    this.lastCamChunk = { cx: NaN, cz: NaN };
    this.group = new THREE.Group();
    this.group.name = 'TerrainChunks';
    this.scene.add(this.group);
  }

  setPerfMode(mode) { this.perfMode = mode; }

  ranges() { return RANGES[this.perfMode]; }
  vertexGrid() { return VERTEX_GRID[this.perfMode]; }

  update(cameraPos) {
    const camCx = Math.floor(cameraPos.x / CHUNK_SIZE);
    const camCz = Math.floor(cameraPos.z / CHUNK_SIZE);
    const teleport = Math.abs(camCx - this.lastCamChunk.cx) > 4 || Math.abs(camCz - this.lastCamChunk.cz) > 4;
    if (teleport && Number.isFinite(this.lastCamChunk.cx)) {
      this._flushAll();
    }
    this.lastCamChunk = { cx: camCx, cz: camCz };

    const desired = computeDesiredChunks({ camCx, camCz }, this.ranges(), CHUNK_SIZE);

    // Unload chunks no longer desired
    for (const [key, entry] of this.resident) {
      if (!desired.has(key)) this._unload(key);
    }

    // Enqueue any missing or wrong-LOD chunks
    for (const [key, lod] of desired) {
      const cur = this.resident.get(key);
      if (cur && cur.lod === lod) continue;
      if (this.inFlight.has(key)) continue;
      this._enqueue(key, lod);
    }
  }

  _enqueue(key, lod) {
    if (this.inFlight.size >= this.maxInFlight) {
      // Soft cap: drop low-priority pending chunks (LOD 2 farthest from camera) when full.
      // Simple approach: skip; will retry next frame.
      return;
    }
    this.inFlight.set(key, lod);
    const [cxStr, czStr] = key.split(',');
    const cx = parseInt(cxStr, 10), cz = parseInt(czStr, 10);
    const grid = this.vertexGrid()[lod];
    // Villages whose pad/falloff overlaps this chunk — feeds chunk-build's
    // terrain flattening, tree exclusion, and (for villages owned by this
    // chunk) building emission.
    const villages = this.villageRegistry.affectingChunk(cx, cz, CHUNK_SIZE);
    // Tunnels whose footprint (corridor + falloff) overlaps this chunk —
    // chunk-build uses them for heightfield carving and re-filters to
    // anchors-in-chunk for instance emission (same pattern as villages).
    const tunnels  = this.tunnelRegistry.affectingChunk(cx, cz, CHUNK_SIZE);
    this.runner.build({ cx, cz, lod, vertexGrid: grid, villages, tunnels }).then((out) => {
      // Camera may have moved — re-check if still wanted.
      this.inFlight.delete(key);
      this._install(key, cx, cz, lod, out);
    }).catch((err) => {
      this.inFlight.delete(key);
      console.error('chunk build failed', key, err);
    });
  }

  _install(key, cx, cz, lod, out) {
    // If we already have a chunk at this key, dispose the old before installing the new.
    const existing = this.resident.get(key);
    if (existing) this._dispose(existing);

    const THREE = this.THREE;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(out.positions, 3));
    geom.setAttribute('normal',   new THREE.BufferAttribute(out.normals,   3));
    geom.setAttribute('color',    new THREE.BufferAttribute(out.colors,    3));
    geom.setIndex(new THREE.BufferAttribute(out.indices, 1));
    geom.computeBoundingSphere();

    const mesh = new THREE.Mesh(geom, this.terrainMaterial);
    mesh.frustumCulled = true;
    if (this.chunkPostprocessor) this.chunkPostprocessor(mesh, cx, cz, lod, out);
    this.group.add(mesh);

    let treeMesh = null;
    if (out.trees && out.trees.length > 0 && (lod === 0 || lod === 1)) {
      // Pick the geometry for the biome at this chunk's center, or skip
      // scatter entirely for biomes whose scatterKey is null (e.g. arctic
      // = bare snow plains).
      let chunkGeometry = this.treeGeometry;
      let skipScatter = false;
      let densityFactor = 1.0;     // some biomes use sparser scatter
      if (this.biomeAt && this.scatterGeometries) {
        const centerX = (cx + 0.5) * CHUNK_SIZE;
        const centerZ = (cz + 0.5) * CHUNK_SIZE;
        const biome = this.biomeAt(centerX, centerZ);
        if (biome.scatterKey === null) skipScatter = true;
        else {
          chunkGeometry = this.scatterGeometries[biome.scatterKey] || this.treeGeometry;
          // Per-biome MAX densities — actual density is modulated below by a
          // slow noise channel so dense and sparse patches alternate.
          if (biome.scatterKey === 'cactus') densityFactor = 0.10;
          else if (biome.scatterKey === 'conifer' || biome.scatterKey === 'maple') densityFactor = 0.25;
          // Modulate by per-chunk density noise (~2.5km wavelength). Result
          // is forests with natural clearings, deserts with cactus clusters,
          // etc. Floor at 0.1 of max so areas don't go completely empty.
          const centerX = (cx + 0.5) * CHUNK_SIZE;
          const centerZ = (cz + 0.5) * CHUNK_SIZE;
          const dMod = 0.1 + 0.9 * densityAt(centerX, centerZ);   // [0.1, 1.0]
          densityFactor *= dMod;
        }
      }
      if (!skipScatter) {
        // Sample down the tree list to the desired density. Deterministic by
        // tree index so the same world has the same cacti across reloads.
        let scatterList = out.trees;
        if (densityFactor < 1.0) {
          const step = Math.max(1, Math.round(1 / densityFactor));
          scatterList = [];
          for (let i = 0; i < out.trees.length; i += step) scatterList.push(out.trees[i]);
        }
        if (scatterList.length > 0) {
          treeMesh = buildTreeInstancedMesh(THREE, chunkGeometry, this.treeMaterial, scatterList);
          this.group.add(treeMesh);
        }
      }
    }
    // No LOD-1 billboards and no LOD-0 overlay billboards — scatter only
    // exists at LOD 0, growing in from zero via the tree material's distance
    // shrink-fade as the camera approaches.

    // --- Building InstancedMeshes ---
    // One InstancedMesh per (chunk × building type). Geometry is cloned per
    // chunk because per-instance color attributes (aWallColor / aRoofColor)
    // attach to the geometry — if we used the shared geometry directly, every
    // chunk's villages would stomp the previous chunk's colors.
    const buildingMeshes = [];
    if (out.buildings && this.buildingMaterial && this.buildingGeometries) {
      const NORMAL_TYPES = [
        'runway', 'house', 'barn', 'church', 'windmill',
        'castle_wall', 'castle_keep', 'castle_tower', 'castle_chapel',
        'monastery_church', 'monastery_wing',
      ];
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const eul = new THREE.Euler();
      const s = new THREE.Vector3();
      const p = new THREE.Vector3();
      for (const type of NORMAL_TYPES) {
        const list = out.buildings[type];
        if (!list || list.length === 0) continue;
        // Pick biome variant when one is registered, otherwise the default
        // shape for this type. Chunks usually contain buildings from a single
        // village (so a single biome) — read the first building's templateKey.
        const tplKey = list[0] && list[0].templateKey;
        const variantGeom = tplKey ? this.buildingGeometries[`${type}_${tplKey}`] : null;
        const baseGeom = variantGeom || this.buildingGeometries[type];
        if (!baseGeom) continue;
        const geom = baseGeom.clone();
        const im = new THREE.InstancedMesh(geom, this.buildingMaterial, list.length);
        const wallColor = new Float32Array(list.length * 3);
        const roofColor = new Float32Array(list.length * 3);
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          p.set(b.x, b.y, b.z);
          eul.set(0, b.rotY, 0);
          q.setFromEuler(eul);
          s.set(b.scaleX, b.scaleY, b.scaleZ);
          m.compose(p, q, s);
          im.setMatrixAt(i, m);
          wallColor[i * 3]     = b.wallColor[0];
          wallColor[i * 3 + 1] = b.wallColor[1];
          wallColor[i * 3 + 2] = b.wallColor[2];
          roofColor[i * 3]     = b.roofColor[0];
          roofColor[i * 3 + 1] = b.roofColor[1];
          roofColor[i * 3 + 2] = b.roofColor[2];
        }
        im.instanceMatrix.needsUpdate = true;
        geom.setAttribute('aWallColor', new THREE.InstancedBufferAttribute(wallColor, 3));
        geom.setAttribute('aRoofColor', new THREE.InstancedBufferAttribute(roofColor, 3));
        this.group.add(im);
        buildingMeshes.push(im);
      }
      // Windmill blades — separate material (spinning).
      const bladeList = out.buildings.windmillBlades;
      if (bladeList && bladeList.length > 0 && this.windmillBladeMaterial) {
        const baseGeom = this.buildingGeometries.windmillBlades;
        if (baseGeom) {
          const geom = baseGeom.clone();
          const im = new THREE.InstancedMesh(geom, this.windmillBladeMaterial, bladeList.length);
          const wallColor = new Float32Array(bladeList.length * 3);
          const roofColor = new Float32Array(bladeList.length * 3);
          for (let i = 0; i < bladeList.length; i++) {
            const b = bladeList[i];
            p.set(b.x, b.y, b.z);
            eul.set(0, b.rotY, b.rotZ);
            q.setFromEuler(eul);
            s.set(b.scaleX, b.scaleY, b.scaleZ);
            m.compose(p, q, s);
            im.setMatrixAt(i, m);
            wallColor[i * 3]     = b.wallColor[0];
            wallColor[i * 3 + 1] = b.wallColor[1];
            wallColor[i * 3 + 2] = b.wallColor[2];
            roofColor[i * 3]     = b.roofColor[0];
            roofColor[i * 3 + 1] = b.roofColor[1];
            roofColor[i * 3 + 2] = b.roofColor[2];
          }
          im.instanceMatrix.needsUpdate = true;
          geom.setAttribute('aWallColor', new THREE.InstancedBufferAttribute(wallColor, 3));
          geom.setAttribute('aRoofColor', new THREE.InstancedBufferAttribute(roofColor, 3));
          this.group.add(im);
          buildingMeshes.push(im);
        }
      }
    }

    this.resident.set(key, { mesh, treeMesh, buildingMeshes, lod, cx, cz });
  }

  _unload(key) {
    const e = this.resident.get(key);
    if (!e) return;
    this._dispose(e);
    this.resident.delete(key);
  }

  _dispose(entry) {
    if (entry.mesh) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
    }
    if (entry.treeMesh) {
      this.group.remove(entry.treeMesh);
      entry.treeMesh.geometry.dispose();
    }
    if (entry.buildingMeshes) {
      for (const im of entry.buildingMeshes) {
        this.group.remove(im);
        // Geometry was cloned per chunk in _install — own it, dispose it.
        im.geometry.dispose();
      }
    }
  }

  _flushAll() {
    for (const [key] of this.resident) this._unload(key);
    // In-flight requests are not cancelable mid-flight; their results will be installed
    // and then unloaded on the next update if no longer desired. Acceptable.
  }

  dispose() {
    this._flushAll();
    this.scene.remove(this.group);
    this.runner.dispose && this.runner.dispose();
  }
}
