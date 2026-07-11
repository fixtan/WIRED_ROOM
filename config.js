// config.js - Shared constants and configuration
// All tunable parameters in one place

// ============================================================
// Player
// ============================================================
export const MOVE_SPEED = 2.5;
export const MOUSE_SENSITIVITY = 0.002;
export const PLAYER_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.3;
export const GRAVITY = 15.0;

// ============================================================
// Camera
// ============================================================
export const CAM_DISTANCE = 3.0;
export const CAM_HEIGHT = 2.0;
export const CAM_LERP = 0.1;

// ============================================================
// Portal
// ============================================================
export const PORTAL_TRIGGER_DIST = 1.5;

export const PORTAL_COLORS = {
  global: '#00ff88',
  friend: '#ff8800',
};

export const PORTAL_RING_COUNT = 3;
export const PORTAL_RING_SEGMENTS = 64;
export const PORTAL_RING_SPEED = 0.45;
export const PORTAL_PARTICLE_COUNT = 15;
export const PORTAL_RADIUS = 0.8;

// ============================================================
// Loading progress bar stages (base%, range%)
// ============================================================
export const LOAD_STAGES = {
  skybox:  { base: 0,  range: 5,  label: 'Creating skybox...' },
  room:    { base: 5,  range: 35, label: 'Loading room...' },
  objects: { base: 40, range: 5,  label: 'Placing objects...' },
  avatar:  { base: 45, range: 40, label: 'Loading avatar...' },
  media:   { base: 85, range: 10, label: 'Loading media...' },
  vr:      { base: 95, range: 5,  label: 'Setting up VR...' },
};

// ============================================================
// Media adjust panel - movement/rotation pitch
// ============================================================
export const MEDIA_MOVE_STEP = 0.01; //
export const MEDIA_ROT_STEP = 1;      // degrees
export const MEDIA_SCALE_STEP = 0.05;
