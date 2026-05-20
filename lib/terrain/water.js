// Animated water plane.
//
// Vertex shader injects two sin waves driven by uTime, giving a slow surface
// ripple. The plane is subdivided so the displacement is visible — at 1×1
// segments the ripple would have nowhere to render.
//
// Fragment shader adds a Blinn-Phong sun glint: analytical wave normals
// (computed from the same world-XZ phase as the vertex displacement, plus
// a higher-frequency sparkle layer) drive a specular highlight along the
// sun direction. The big low-freq wave gives the bulk-streak shape; the
// hi-freq layer scatters the highlight into glittering specks across it.
export function buildWaterPlane(THREE, size = 64000, opts = {}) {
  const sunDir       = opts.sunDir       || [0.51, 0.76, 0.38]; // normalized default
  const glintColor   = opts.glintColor   || [1.0, 0.95, 0.82];  // warm cream
  const shininess    = opts.shininess    != null ? opts.shininess    : 8.0;
  const glintStrength= opts.glintStrength!= null ? opts.glintStrength: 0.75;

  const geom = new THREE.PlaneGeometry(size, size, 64, 64);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x2d6ea3, transparent: false, opacity: 1 });
  mat.userData.uTime          = { value: 0 };
  mat.userData.uSunDir        = { value: new THREE.Vector3().fromArray(sunDir).normalize() };
  mat.userData.uGlintColor    = { value: new THREE.Color().fromArray(glintColor) };
  mat.userData.uShininess     = { value: shininess };
  mat.userData.uGlintStrength = { value: glintStrength };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime          = mat.userData.uTime;
    shader.uniforms.uSunDir        = mat.userData.uSunDir;
    shader.uniforms.uGlintColor    = mat.userData.uGlintColor;
    shader.uniforms.uShininess     = mat.userData.uShininess;
    shader.uniforms.uGlintStrength = mat.userData.uGlintStrength;

    // --- Vertex shader: wave displacement + pass world XZ to fragment ---
    shader.vertexShader =
      `uniform float uTime;\nvarying vec3 vWorldPosW;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           vec4 _wp = modelMatrix * vec4(position, 1.0);
           float wave =
             sin(uTime * 0.55 + _wp.x * 0.0040) * 0.20 +
             sin(uTime * 0.38 + _wp.z * 0.0055) * 0.16;
           transformed.y += wave;
           vWorldPosW = _wp.xyz;
         }`
      );

    // --- Fragment shader: Blinn-Phong sun glint on a perturbed wave normal ---
    shader.fragmentShader =
      `varying vec3 vWorldPosW;\n` +
      `uniform float uTime;\n` +
      `uniform vec3 uSunDir;\n` +
      `uniform vec3 uGlintColor;\n` +
      `uniform float uShininess;\n` +
      `uniform float uGlintStrength;\n` +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         {
           // Analytical wave normal: dY/dx and dY/dz from the same low-freq
           // displacement used in the vertex shader, plus a higher-frequency
           // sparkle layer that scatters the highlight without visibly
           // disturbing the silhouette.
           float wpx = vWorldPosW.x;
           float wpz = vWorldPosW.z;
           float dYdx_lo = cos(uTime * 0.55 + wpx * 0.0040) * 0.20 * 0.0040;
           float dYdz_lo = cos(uTime * 0.38 + wpz * 0.0055) * 0.16 * 0.0055;
           // High-frequency sparkle. Slopes are tuned to perturb the normal
           // by ~10–15° so the highlight scatters into glittering specks.
           float dYdx_hi = cos(uTime * 1.6 + wpx * 0.040) * 0.5 * 0.040
                        + cos(uTime * 2.1 + wpz * 0.052) * 0.3 * 0.052;
           float dYdz_hi = cos(uTime * 1.3 + wpz * 0.045) * 0.5 * 0.045
                        + cos(uTime * 1.9 + wpx * 0.058) * 0.3 * 0.058;
           vec3 nWave = normalize(vec3(-(dYdx_lo + dYdx_hi), 1.0, -(dYdz_lo + dYdz_hi)));

           vec3 viewDir = normalize(cameraPosition - vWorldPosW);
           vec3 sunDir  = normalize(uSunDir);
           vec3 halfVec = normalize(viewDir + sunDir);
           float spec = pow(max(dot(nWave, halfVec), 0.0), uShininess);
           gl_FragColor.rgb += uGlintColor * spec * uGlintStrength;
         }`
      );
  };
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = 0;
  mesh.renderOrder = -1;
  return mesh;
}
