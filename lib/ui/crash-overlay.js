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
