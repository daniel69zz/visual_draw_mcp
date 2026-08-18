import type { Theme } from "../scene/theme.js";
import type { ElementBox, PrimitiveElement, Scene, VisualElement } from "../scene/types.js";

/** A data coordinate system declared by an `axis` element. */
export interface AxisFrame {
  id: string;
  /** Plot area in canvas pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  xRange: [number, number];
  yRange: [number, number];
  /** Maps a data point to canvas pixels (y is flipped: data grows upwards). */
  toCanvas(dx: number, dy: number): { x: number; y: number };
  /** Pixels per data unit. */
  scaleX: number;
  scaleY: number;
}

export interface LegendEntry {
  label: string;
  color: string;
  shape: string;
}

/**
 * Everything an expander needs to turn one semantic element into primitives:
 * the palette, where every element ended up after layout, and the data frames.
 */
export interface ResolveContext {
  scene: Scene;
  theme: Theme;
  /** Post-layout geometry of every anchorable element, by id. */
  boxes: Map<string, ElementBox>;
  frames: Map<string, AxisFrame>;
  legend: LegendEntry[];
  /** Auto-assigns a palette colour to series that did not pick one. */
  nextSeriesColor(): string;
  /** Used by expanders to emit derived ids that cannot collide with user ids. */
  derivedId(ownerId: string, suffix: string): string;
  warnings: string[];
}

export type Expander<T extends VisualElement = VisualElement> = (
  element: T,
  ctx: ResolveContext,
) => PrimitiveElement[];

/**
 * Draw layers. Within a layer the author's order is preserved, but a
 * connection can never end up on top of the node it points at, no matter what
 * order the model happened to emit them in.
 */
export const DRAW_LAYER: Record<string, number> = {
  group: 0,
  axis: 1,
  connection: 2,
  circle: 3,
  ellipse: 3,
  rectangle: 3,
  polygon: 3,
  polyline: 3,
  path: 3,
  line: 3,
  arrow: 3,
  node: 3,
  server: 3,
  database: 3,
  router: 3,
  switch: 3,
  computer: 3,
  cloud: 3,
  cluster: 4,
  scatter: 4,
  point: 4,
  plotLine: 5,
  text: 6,
  label: 6,
};

export function layerOf(type: string): number {
  return DRAW_LAYER[type] ?? 3;
}
