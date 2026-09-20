export const BASE_RADIUS = 240;
export const LAYER_GAP = 260;
export const MIN_RING_GAP = 170;
export const POLYGON_SIDES = 12;
export const START_ANGLE = -Math.PI / 2;

export const ANIMATION_FRAMES_PER_RING = 10;
export const ANIMATION_FRAMES_PER_GROUP = 10;

export const BROKEN_NODE_COLOR = '#ff9a72';
export const BROKEN_EDGE_COLOR = '#ff7a3d';

export const DENSITY_SCALE_THRESHOLDS = [
  { minCount: 240, scale: 0.55 },
  { minCount: 140, scale: 0.65 },
  { minCount: 80, scale: 0.75 },
  { minCount: 40, scale: 0.85 },
];

export const FONT_SIZE_THRESHOLDS = [
  { minCount: 220, size: 9 },
  { minCount: 120, size: 10 },
  { minCount: 70, size: 11 },
];
export const DEFAULT_FONT_SIZE = 13;
export const CENTER_NODE_FONT_SIZE = 16;
