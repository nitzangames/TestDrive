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
    this.steering = 0;
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
  setSteering(s) { this.steering = s; }
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
    this._drawSteeringWheel(ctx, W, H);
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

  // FC RX-7 style three-spoke steering wheel — round black-leather rim,
  // two horizontal spokes (9 o'clock + 3 o'clock) and one vertical
  // spoke (6 o'clock), with a rounded rectangular hub pad in the
  // middle. Rotates with steering input (max ~135° in either direction).
  _drawSteeringWheel(ctx, W, H) {
    const cx = 220, cy = H - 220;     // bottom-left
    const R = 160;                    // outer rim radius
    const rotation = this.steering * (Math.PI * 0.75);   // ±135° at full lock

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(cx, cy);
    ctx.rotate(rotation);

    // --- Outer rim (leather wrap). Medium gray so it reads clearly
    //     against the dark asphalt instead of disappearing into it.
    ctx.strokeStyle = '#62646a';
    ctx.lineWidth = 26;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(0, 0, R - 13, 0, Math.PI * 2);
    ctx.stroke();
    // Inner highlight band — slight sheen on the inside edge of the rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(0, 0, R - 13, 0, Math.PI * 2);
    ctx.stroke();
    // Outer hairline — keeps the rim crisp.
    ctx.strokeStyle = '#202024';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();

    // --- Three spokes. Tapered bars from the central hub out to the
    //     rim. 9 o'clock + 3 o'clock are horizontal, 6 o'clock is vertical.
    const hubR = 56;       // half-extent of central hub pad
    const spokeW = 36;     // spoke thickness at the hub end
    const spokeTip = 16;   // spoke thickness at the rim end
    const rimInside = R - 26;
    function drawSpoke(angle) {
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = '#56585e';
      ctx.beginPath();
      ctx.moveTo(-spokeW / 2, hubR * 0.4);
      ctx.lineTo(-spokeTip / 2, rimInside);
      ctx.lineTo( spokeTip / 2, rimInside);
      ctx.lineTo( spokeW / 2, hubR * 0.4);
      ctx.closePath();
      ctx.fill();
      // Highlight along one edge.
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-spokeW / 2 + 2, hubR * 0.4);
      ctx.lineTo(-spokeTip / 2 + 1, rimInside - 2);
      ctx.stroke();
      ctx.restore();
    }
    // 6 o'clock spoke — going DOWN from the hub. Rotated 0 in local
    // frame draws the spoke along +Y (canvas Y is down), which is what
    // we want for "down" from center.
    drawSpoke(0);
    // 9 o'clock and 3 o'clock — rotate the down-spoke by ±90°.
    drawSpoke( Math.PI / 2);
    drawSpoke(-Math.PI / 2);

    // --- Central hub pad (rounded rectangle). Slightly darker than the
    //     spokes/rim so it reads as a separate inset element, but still
    //     well above asphalt color.
    ctx.fillStyle = '#3a3c42';
    ctx.beginPath();
    ctx.roundRect(-hubR, -hubR * 0.72, hubR * 2, hubR * 1.44, 10);
    ctx.fill();
    ctx.strokeStyle = '#1c1e22';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Faint embossed center mark (no real brand logo).
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '600 22px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RX-7', 0, 0);

    ctx.restore();
  }

  _drawVersion(ctx, H) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = '21px ui-monospace, Menlo, monospace';
    ctx.fillText(VERSION, 24, H - 24);
  }
}
