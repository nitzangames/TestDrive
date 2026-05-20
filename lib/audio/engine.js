// Procedural engine note. Mixes a square wave (base) and saw (octave) into a
// lowpass filter and gain stage. Frequency, gain, and cutoff sweep with speed.
//
// Construct only AFTER a user gesture (Start button or canvas tap). AudioContext
// is suspended on visibilitychange and resumed on focus.

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
