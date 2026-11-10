// Demo scene shared by the app and the tests. Units: metres, z-up, arm base at the origin.
const DOWN = [1, 0, 0, 0, -1, 0, 0, 0, -1]; // tool z pointing at the floor

export const SCENE = {
  obstacles: [
    { type: 'box', name: 'table A', lo: [0.30, -0.55, 0], hi: [0.62, -0.20, 0.15] },
    { type: 'box', name: 'table B', lo: [0.30, 0.20, 0], hi: [0.62, 0.55, 0.15] },
    { type: 'box', name: 'wall', lo: [0.22, -0.035, 0], hi: [0.80, 0.035, 0.52] },
  ],
  cube: { size: 0.05, pick: [0.46, -0.36, 0.175], place: [0.46, 0.36, 0.175] },
  approach: 0.15, // pre-grasp height above the grasp point
  // planning endpoints used by the tests: pre-grasp above A and pre-place above B
  poseA: { R: DOWN, p: [0.46, -0.36, 0.325] },
  poseB: { R: DOWN, p: [0.46, 0.36, 0.325] },
  DOWN,
};
