import {
  BoxGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { boxColliderAt, circleCollider, type Collider } from './Colliders';

/**
 * TEMPORARY test obstacles around the spawn point, to try walking, sliding along walls,
 * corners and dashing against a thin wall (step 1.6). Not game content: step 1.8 replaces
 * this with the placeholder buildings from data. Each obstacle stands on the terrain
 * (sunk in a little, so it never floats on a slope).
 * Positions are offsets in meters from the spawn point; +z is where the character first faces.
 */
const BOXES: readonly (readonly [
  dx: number,
  dz: number,
  width: number,
  depth: number,
  height: number,
])[] = [
  // A wall ahead with a 6 m gap.
  [-8, 14, 12, 1, 2.5],
  [9, 14, 10, 1, 2.5],
  // An inside corner on the left.
  [-16, 4, 1, 12, 2.5],
  [-12, -1.5, 8, 1, 2.5],
  // A thin wall on the right: a dash must stop against it.
  [12, 5, 0.3, 8, 2],
  // A "building" behind the wall.
  [-4, 26, 8, 6, 5],
];

/** How deep (m) obstacles reach into the ground. */
const SINK = 1.5;

const PILLARS: readonly (readonly [dx: number, dz: number, radius: number, height: number])[] = [
  [5, 5, 0.6, 3],
  [8, 8, 0.6, 3],
  [-5, 8, 1, 3],
  [2, 22, 0.5, 3],
];

/** Builds the test obstacles: colliders plus two InstancedMeshes (two draw calls). */
export function buildTestCourse(
  centerX: number,
  centerZ: number,
  wallColor: number,
  pillarColor: number,
  heightAt: (x: number, z: number) => number = () => 0,
): { colliders: Collider[]; meshes: InstancedMesh[] } {
  const colliders: Collider[] = [];
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();

  const boxGeometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const boxes = new InstancedMesh(
    boxGeometry,
    new MeshLambertMaterial({ color: wallColor }),
    BOXES.length,
  );
  BOXES.forEach(([dx, dz, width, depth, height], i) => {
    const x = centerX + dx;
    const z = centerZ + dz;
    colliders.push(boxColliderAt(x, z, width, depth));
    boxes.setMatrixAt(
      i,
      matrix.compose(
        position.set(x, heightAt(x, z) - SINK, z),
        rotation,
        scale.set(width, height + SINK, depth),
      ),
    );
  });

  const pillarGeometry = new CylinderGeometry(1, 1, 1, 16).translate(0, 0.5, 0);
  const pillars = new InstancedMesh(
    pillarGeometry,
    new MeshLambertMaterial({ color: pillarColor }),
    PILLARS.length,
  );
  PILLARS.forEach(([dx, dz, radius, height], i) => {
    const x = centerX + dx;
    const z = centerZ + dz;
    colliders.push(circleCollider(x, z, radius));
    pillars.setMatrixAt(
      i,
      matrix.compose(
        position.set(x, heightAt(x, z) - SINK, z),
        rotation,
        scale.set(radius, height + SINK, radius),
      ),
    );
  });

  for (const mesh of [boxes, pillars]) {
    mesh.computeBoundingSphere();
    mesh.name = 'test-course';
  }
  return { colliders, meshes: [boxes, pillars] };
}
