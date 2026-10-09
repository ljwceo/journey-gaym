/**
 * Ground height under a point. In the world this is the TerrainField, so the player stands on
 * the same ground everywhere, whatever mesh detail is drawn.
 */
export interface Ground {
  heightAt(x: number, z: number): number;
}
