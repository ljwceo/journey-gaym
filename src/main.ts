import {
  AmbientLight,
  BoxGeometry,
  Clock,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { palette, uiColors } from './render/palette';
import './style.css';

// Step 1.1 placeholder: an empty 3D scene with a spinning cube.
// The real game loop (fixed 60 Hz step + interpolation) arrives in step 1.2.

const MAX_PIXEL_RATIO = 2;
/** Cube spin speed in radians per second (never per frame). */
const SPIN_SPEED = 0.8;

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app element');
}

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setClearColor(uiColors.bg);
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.fog = new Fog(palette.mistpaars, 6, 20);

const camera = new PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 2.5, 5);
camera.lookAt(0, 0, 0);

scene.add(new AmbientLight(palette.schemerviolet, 1.5));
const sun = new DirectionalLight(palette.zonsondergang, 2.5);
sun.position.set(3, 5, 2);
scene.add(sun);

const cube = new Mesh(
  new BoxGeometry(1.2, 1.2, 1.2),
  new MeshStandardMaterial({ color: palette.lantaarnamber }),
);
scene.add(cube);

function resize(): void {
  const width = container?.clientWidth ?? window.innerWidth;
  const height = container?.clientHeight ?? window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new Clock();
renderer.setAnimationLoop(() => {
  // Clamp so a long pause (tab hidden) does not cause a jump.
  const dt = Math.min(clock.getDelta(), 0.25);
  cube.rotation.x += SPIN_SPEED * 0.6 * dt;
  cube.rotation.y += SPIN_SPEED * dt;
  renderer.render(scene, camera);
});
