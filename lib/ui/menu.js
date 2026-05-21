import { VERSION } from '../version.js';

// Builds a menu overlay (HTML inside #ui-root) and a separate menu scene
// (own camera + lights). The world scene is NOT ticked while the menu is up.
//
// Usage:
//   const menu = new MainMenu({ THREE, uiRoot, carModel });
//   menu.show();
//   menu.onStart = () => { /* transition to drive */ };
//   In game loop while menu.visible: renderer.render(menu.scene, menu.camera);

// Names match the keys in lib/terrain/style-system.js's STYLES table.
const STYLE_OPTIONS = [
  { value: 'cartograph', label: 'Cartograph' },
  { value: 'lowpoly',    label: 'Lowpoly' },
  { value: 'stylized',   label: 'Stylized' },
  { value: 'realistic',  label: 'Realistic' },
];

export class MainMenu {
  constructor({ THREE, uiRoot, carModel, initialStyle = 'cartograph' }) {
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

    this.style = initialStyle;
    this._buildHTML(uiRoot);
    this.visible = false;
    this.onStart = () => {};
    this.onStyleChange = () => {};
  }

  _buildHTML(root) {
    const opts = STYLE_OPTIONS
      .map(o => `<option value="${o.value}" ${o.value === this.style ? 'selected' : ''}>${o.label}</option>`)
      .join('');
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
        <div style="position:absolute;bottom:30%;width:84%;display:flex;flex-direction:column;align-items:stretch;gap:18px;">
          <label style="font:500 42px ui-monospace,Menlo,monospace;opacity:0.85;text-align:left;letter-spacing:0.04em;">Style</label>
          <select id="style-select" style="
            font:500 54px ui-monospace,Menlo,monospace;
            padding:24px 30px;
            background:#1d2128;color:#fff;
            border:2px solid #f1c64a;border-radius:14px;
            -webkit-appearance:none;-moz-appearance:none;appearance:none;
            text-align:left;
          ">${opts}</select>
        </div>
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
    this._root.querySelector('#style-select').addEventListener('change', (e) => {
      this.style = e.target.value;
      this.onStyleChange(this.style);
    });
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
