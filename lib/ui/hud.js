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
