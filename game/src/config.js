// Shared tuning constants for Solmar Bay: city geometry, player and car physics,
// wanted-system timing. All original values, tuned by playtesting.
export const WORLD = {
  pitch: 48,
  streets: [-96, -48, 0, 48, 96],
  roadHalf: 7,
  sidewalkOuter: 11,
  blockCenters: [-72, -24, 24, 72],
  blockHalf: 13,
  extent: 150,
  ground: 340,
  waterZ: -132,
};

export const PLAYER_CFG = {
  walkSpeed: 5,
  sprintSpeed: 8.5,
  radius: 0.6,
  maxHealth: 100,
};

export const CAR_CFG = {
  accel: 15,
  brake: 30,
  reverseAccel: 10,
  maxSpeed: 27,
  maxReverse: 9,
  steerMax: 0.62,
  turnRate: 2.1,
  radius: 2.2,
};

export const WANTED_CFG = {
  max: 5,
  decayDelay: 15,
  decayInterval: 8,
  bustSeconds: 2.5,
  bustRange: 4,
};

export const SAVE_KEY = 'solmar-bay-save-v1';

export const MISSION_REWARDS = [800, 1200, 1500, 2000, 5000];

export const PALETTE = {
  sky: 0x8ec3ea,
  fog: 0xa8c8e8,
  asphalt: 0x33373d,
  sidewalk: 0x9aa0a6,
  blockBase: 0x7d838a,
  water: 0x1e6f9e,
};
