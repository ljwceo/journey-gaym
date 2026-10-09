/**
 * Ground height under a point. The open world (step 1.7) samples the terrain heightmaps of the
 * loaded chunks; until then the test floor is flat.
 */
export interface Ground {
  heightAt(x: number, z: number): number;
}

export const flatGround: Ground = {
  heightAt: () => 0,
};
