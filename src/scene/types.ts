import type { z } from "zod";
import type {
  SceneBodySchema,
  SceneLayoutSchema,
  DirectionSchema,
  ThemeNameSchema,
  ThemeOverrideSchema,
} from "./schemas/scene.js";
import type {
  ArrowSchema,
  CircleSchema,
  EllipseSchema,
  LineSchema,
  PathSchema,
  PolygonSchema,
  PolylineSchema,
  RectangleSchema,
  TextSchema,
  LayoutSchema,
} from "./schemas/primitives.js";
import type {
  AxisSchema,
  CloudSchema,
  ClusterSchema,
  ComputerSchema,
  ConnectionSchema,
  DatabaseSchema,
  LabelSchema,
  NodeSchema,
  NodeShapeSchema,
  PlotLineSchema,
  PointSemanticSchema,
  RouterSchema,
  ScatterSchema,
  ServerSchema,
  SwitchSchema,
} from "./schemas/semantic.js";

/**
 * Public types.
 *
 * `VisualElement` and `GroupElement` are written out by hand rather than
 * inferred, because a group contains elements and TypeScript cannot resolve
 * that cycle through `z.infer`. Everything else is inferred from its schema, so
 * the schema stays the single source of truth.
 */

export type SceneLayout = z.infer<typeof SceneLayoutSchema>;
export type Direction = z.infer<typeof DirectionSchema>;
export type ThemeName = z.infer<typeof ThemeNameSchema>;
export type ThemeOverride = z.infer<typeof ThemeOverrideSchema>;
export type GroupLayout = z.infer<typeof LayoutSchema>;
export type Dash = "solid" | "dashed" | "dotted";

export type CircleElement = z.infer<typeof CircleSchema>;
export type EllipseElement = z.infer<typeof EllipseSchema>;
export type RectangleElement = z.infer<typeof RectangleSchema>;
export type LineElement = z.infer<typeof LineSchema>;
export type ArrowElement = z.infer<typeof ArrowSchema>;
export type TextElement = z.infer<typeof TextSchema>;
export type PolygonElement = z.infer<typeof PolygonSchema>;
export type PolylineElement = z.infer<typeof PolylineSchema>;
export type PathElement = z.infer<typeof PathSchema>;

export type NodeShape = z.infer<typeof NodeShapeSchema>;
export type NodeElement = z.infer<typeof NodeSchema>;
export type ServerElement = z.infer<typeof ServerSchema>;
export type DatabaseElement = z.infer<typeof DatabaseSchema>;
export type RouterElement = z.infer<typeof RouterSchema>;
export type SwitchElement = z.infer<typeof SwitchSchema>;
export type ComputerElement = z.infer<typeof ComputerSchema>;
export type CloudElement = z.infer<typeof CloudSchema>;
export type ConnectionElement = z.infer<typeof ConnectionSchema>;
export type AxisElement = z.infer<typeof AxisSchema>;
export type PointElement = z.infer<typeof PointSemanticSchema>;
export type ScatterElement = z.infer<typeof ScatterSchema>;
export type ClusterElement = z.infer<typeof ClusterSchema>;
export type PlotLineElement = z.infer<typeof PlotLineSchema>;
export type LabelElement = z.infer<typeof LabelSchema>;

/** A container. Written by hand because `children` makes the schema recursive. */
export interface GroupElement {
  id: string;
  type: "group";
  note?: string;
  x?: number;
  y?: number;
  label?: string;
  layout?: GroupLayout;
  gap?: number;
  columns?: number;
  padding?: number;
  frame?: boolean;
  fill?: string;
  stroke?: string;
  dash?: Dash;
  opacity?: number;
  children: VisualElement[];
}

/** Elements the SVG renderer can draw directly. */
export type PrimitiveElement =
  | CircleElement
  | EllipseElement
  | RectangleElement
  | LineElement
  | ArrowElement
  | TextElement
  | PolygonElement
  | PolylineElement
  | PathElement;

/** `node` plus every domain preset that resolves to a node. */
export type NodeLikeElement =
  | NodeElement
  | ServerElement
  | DatabaseElement
  | RouterElement
  | SwitchElement
  | ComputerElement
  | CloudElement;

export type SemanticElement =
  | NodeLikeElement
  | ConnectionElement
  | AxisElement
  | PointElement
  | ScatterElement
  | ClusterElement
  | PlotLineElement
  | LabelElement;

export type VisualElement = PrimitiveElement | GroupElement | SemanticElement;

export type Scene = Omit<z.infer<typeof SceneBodySchema>, "elements"> & {
  id?: string;
  elements: VisualElement[];
};

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The geometric footprint of an element after layout. Connection anchoring,
 * auto-fit, group frames and UI hit-testing all read this.
 */
export interface ElementBox extends BoundingBox {
  id: string;
  /** How connections should intersect this box. */
  shape: "rect" | "ellipse";
  cx: number;
  cy: number;
  radius?: number;
}

/**
 * A recorded change. Undo/redo is not implemented yet, but every mutation is
 * logged in this shape so history is a small addition rather than a rewrite.
 */
export interface SceneMutation {
  type: "create" | "add" | "update" | "remove" | "clear" | "replace";
  elementId?: string;
  timestamp: number;
  /** Short summary, e.g. "moved 'redis' to (420, 180)". */
  summary?: string;
}
