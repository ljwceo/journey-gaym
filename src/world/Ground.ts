/**
 * Ground height under a point. In the world this is the WorldStreamer (drawn chunk triangles
 * where loaded, the TerrainField elsewhere); tests use simple functions.
 */
export interface Ground {
  heightAt(x: number, z: number): number;
}
