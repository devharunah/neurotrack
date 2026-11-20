/**
 * Camera views for the 3D brain explorer.
 *
 * Angles follow camera-controls' spherical convention around the +Y axis: azimuth 0 puts the
 * camera on +Z (in front of the brain, since the model's +Z is anterior), +π/2 on +X (the
 * right side), −π/2 on −X (the left side). Polar 0 is straight above, π straight below.
 */

export type ViewPresetId =
  | "default"
  | "left"
  | "right"
  | "anterior"
  | "posterior"
  | "superior"
  | "inferior"
  | "medial-left"
  | "front-left"
  | "back-left"
  | "top-left"
  | "below-back-left"
  | "below-left";

export interface ViewPreset {
  label: string;
  azimuth: number;
  polar: number;
  /** Hemisphere to hide, so the inner (medial) surface of the other one is visible. */
  hideSide?: "lh" | "rh";
}

const HALF_PI = Math.PI / 2;
/** Keep clear of the poles, where camera-controls' up vector degenerates. */
const POLE_MARGIN = 0.06;

export const VIEW_PRESETS: Readonly<Record<ViewPresetId, ViewPreset>> = {
  default: { label: "Default", azimuth: -0.85, polar: 1.15 },
  left: { label: "Left side", azimuth: -HALF_PI, polar: HALF_PI },
  right: { label: "Right side", azimuth: HALF_PI, polar: HALF_PI },
  anterior: { label: "Front", azimuth: 0, polar: HALF_PI },
  posterior: { label: "Back", azimuth: Math.PI, polar: HALF_PI },
  superior: { label: "Top", azimuth: 0, polar: POLE_MARGIN },
  inferior: { label: "Underside", azimuth: 0, polar: Math.PI - POLE_MARGIN },
  "medial-left": {
    label: "Inner surface (left)",
    azimuth: HALF_PI,
    polar: HALF_PI,
    hideSide: "rh",
  },
  "front-left": { label: "Front left", azimuth: -0.6, polar: 1.2 },
  "back-left": { label: "Back left", azimuth: -2.4, polar: 1.2 },
  "top-left": { label: "Top left", azimuth: -1.2, polar: 0.6 },
  "below-back-left": { label: "Below, back left", azimuth: -2.6, polar: 1.8 },
  "below-left": { label: "Below left", azimuth: -1.2, polar: 1.85 },
};

/** Views offered by the explorer's view menu, in menu order. */
export const MENU_VIEWS: readonly ViewPresetId[] = [
  "default",
  "left",
  "right",
  "anterior",
  "posterior",
  "superior",
  "inferior",
  "medial-left",
];

export function isViewPresetId(value: string): value is ViewPresetId {
  return Object.hasOwn(VIEW_PRESETS, value);
}

export const CAMERA_FOV_DEG = 35;
export const DEFAULT_DISTANCE = 4.4;
export const MIN_DISTANCE = 1.4;
export const MAX_DISTANCE = 8;

/**
 * Camera distance that frames a bounding sphere of `radius`, with `padding` (> 1) around it,
 * clamped to [MIN_DISTANCE, DEFAULT_DISTANCE] so focusing never zooms out past the default.
 */
export function framingDistance(radius: number, padding = 1.45, minimum = MIN_DISTANCE): number {
  const halfFov = (CAMERA_FOV_DEG * Math.PI) / 360;
  const distance = (radius / Math.sin(halfFov)) * padding;
  return Math.min(DEFAULT_DISTANCE, Math.max(minimum, distance));
}

/**
 * Closest the camera comes when focusing a deep structure: outside the see-through cortex
 * (the model is 2 units long), so the structure is seen in the context of the whole brain.
 */
export const DEEP_FOCUS_DISTANCE = 2.7;

/** Camera position for a view, orbiting `target` at `distance`. */
export function viewPosition(
  view: ViewPreset,
  target: readonly [number, number, number],
  distance: number,
): [number, number, number] {
  const sinPolar = Math.sin(view.polar);
  return [
    target[0] + distance * sinPolar * Math.sin(view.azimuth),
    target[1] + distance * Math.cos(view.polar),
    target[2] + distance * sinPolar * Math.cos(view.azimuth),
  ];
}
