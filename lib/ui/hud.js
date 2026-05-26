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
    this.biomeName = '';
    this.lastBiomeName = '';
    this.biomeFadeT = 0; // 0..1
    this.fullMap = null;
    if (graph) this._prerenderMap(graph);
  }

  // Display half of the real m/s→km/h conversion so the speedometer
  // tops out at 108 km/h (matches the perceived visual speed in-game).
  // Physics MAX_SPEED stays at 60 m/s; this just scales the readout.
  setSpeed(speedMs) { this.speedKmh = speedMs * 1.8; }
  setCar(car) {
    this.car.x = car.x;
    this.car.z = car.z;
    this.car.headingY = car.headingY;
  }

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

  draw(dt = 0) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this._drawSpeedometer(ctx, W, H);
    this._drawMinimap(ctx, W);
    this._drawBiome(ctx, W, dt);
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
    // Rotate so the triangle tip points along the car's motion direction
    // on the minimap (north-up, world +X→right, world +Z→down). Car's
    // world forward is (sin h, cos h). Triangle tip is at local (0,-10).
    // After ctx.rotate(θ) the tip lands at (10 sin θ, -10 cos θ); solving
    // for that to align with (sin h, cos h) gives θ = π − h.
    ctx.rotate(Math.PI - this.car.headingY);
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
