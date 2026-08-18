import { z } from "zod";
import {
  ArrowSchema,
  CircleSchema,
  EllipseSchema,
  GroupSchema,
  LineSchema,
  PathSchema,
  PolygonSchema,
  PolylineSchema,
  PRIMITIVE_TYPES,
  RectangleSchema,
  TextSchema,
} from "./primitives.js";
import {
  AxisSchema,
  CloudSchema,
  ClusterSchema,
  ComputerSchema,
  ConnectionSchema,
  DatabaseSchema,
  LabelSchema,
  NodeSchema,
  PlotLineSchema,
  PointSemanticSchema,
  RouterSchema,
  ScatterSchema,
  SEMANTIC_TYPES,
  ServerSchema,
  SwitchSchema,
} from "./semantic.js";

/**
 * The single closed union of everything a scene may contain.
 *
 * Discriminated on `type`, so validation errors point at the exact field of the
 * exact variant - which is what makes them useful to a model.
 */
export const VisualElementSchema = z.discriminatedUnion("type", [
  // primitives
  CircleSchema,
  EllipseSchema,
  RectangleSchema,
  LineSchema,
  ArrowSchema,
  TextSchema,
  PolygonSchema,
  PolylineSchema,
  PathSchema,
  GroupSchema,
  // semantic
  NodeSchema,
  ConnectionSchema,
  AxisSchema,
  PointSemanticSchema,
  ScatterSchema,
  ClusterSchema,
  PlotLineSchema,
  LabelSchema,
  // domain presets
  ServerSchema,
  DatabaseSchema,
  RouterSchema,
  SwitchSchema,
  ComputerSchema,
  CloudSchema,
]);

export const ELEMENT_TYPES = [...PRIMITIVE_TYPES, ...SEMANTIC_TYPES] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export function isKnownElementType(type: string): type is ElementType {
  return (ELEMENT_TYPES as readonly string[]).includes(type);
}
