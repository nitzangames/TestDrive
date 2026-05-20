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
