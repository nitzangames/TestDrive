import { VERSION } from '../version.js';

// Builds a menu overlay (HTML inside #ui-root) and a separate menu scene
// (own camera + lights). The world scene is NOT ticked while the menu is up.
//
// Usage:
//   const menu = new MainMenu({ THREE, uiRoot, carModel });
//   menu.show();
//   menu.onStart = () => { /* transition to drive */ };
//   In game loop while menu.visible: renderer.render(menu.scene, menu.camera);

export class MainMenu {
  constructor({ THREE, uiRoot, carModel }) {
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

    this._buildHTML(uiRoot);
    this.visible = false;
    this.onStart = () => {};
  }

  _buildHTML(root) {
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
