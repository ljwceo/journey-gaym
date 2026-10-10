import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import type { SharedLightUniforms } from './ToonMaterial';

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 lightDir, sunCol, skyTop, skyHorizon;
  uniform float sunDisk, moonDisk, stars;
  varying vec3 vDir;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -0.2, 1.0);
    // Horizon (the same color as the fog) up to the top color, through a slightly warmer band.
    vec3 band = mix(skyHorizon, skyTop, 0.45);
    vec3 col = mix(skyHorizon, band, smoothstep(0.0, 0.18, h));
    col = mix(col, skyTop, smoothstep(0.15, 0.75, h));
    float s = max(dot(dir, lightDir), 0.0);
    // Sun: a bright disk with a soft halo (style guide L4: never a hard lens flare).
    col += sunCol * sunDisk * (pow(s, 600.0) * 6.0 + pow(s, 12.0) * 0.45);
    // Moon: a pale disk with a faint halo.
    col += sunCol * moonDisk * (smoothstep(0.9993, 0.9996, s) * 2.5 + pow(s, 40.0) * 0.25);
    // Stars: tiny points on a grid of directions, only high enough above the horizon.
    if (stars > 0.0) {
      vec3 cell = floor(dir * 220.0);
      float star = step(0.9965, hash(cell));
      float twinkle = 0.6 + 0.4 * hash(cell + 7.0);
      col += vec3(star * twinkle * stars * smoothstep(0.05, 0.3, h));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * The sky around the camera: a sphere drawn behind everything, with the day-night colors, the sun
 * or the moon at the key light's direction, and stars at night. Move it with the camera.
 */
export function createSkyDome(shared: SharedLightUniforms, radius: number): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      lightDir: shared.lightDir,
      sunCol: shared.sunCol,
      skyTop: shared.skyTop,
      skyHorizon: shared.skyHorizon,
      sunDisk: shared.sunDisk,
      moonDisk: shared.moonDisk,
      stars: shared.stars,
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new Mesh(new SphereGeometry(radius, 32, 16), material);
  sky.name = 'sky';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
