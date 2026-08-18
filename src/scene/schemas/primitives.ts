import { z } from "zod";
import {
  BaseElementSchema,
  ColorSchema,
  FiniteNumber,
  NonNegative,
  Positive,
  PointSchema,
  StyleSchema,
  TextStyleSchema,
  LabelStyleSchema,
  TextAnchorSchema,
  BaselineSchema,
  DashSchema,
} from "./common.js";

/**
 * Primitive elements: the closed set of shapes the SVG renderer knows how to
 * draw. Every semantic element is compiled down to these before rendering.
 *
 * The model is allowed to use primitives directly, but should prefer semantic
 * elements (`node`, `connection`, ...) whenever one fits - see semantic.ts.
 */

const withBase = <T extends z.ZodRawShape>(shape: T) =>
  BaseElementSchema.extend(StyleSchema.shape).extend(shape);

export const CircleSchema = withBase({
  type: z.literal("circle"),
  x: FiniteNumber.describe("Center x."),
  y: FiniteNumber.describe("Center y."),
  radius: Positive.describe("Radius in pixels. Must be greater than 0."),
  label: z.string().max(400).optional().describe("Text drawn centered inside the circle."),
  labelStyle: LabelStyleSchema.optional(),
}).describe("A circle centered at (x, y).");

export const EllipseSchema = withBase({
  type: z.literal("ellipse"),
  x: FiniteNumber.describe("Center x."),
  y: FiniteNumber.describe("Center y."),
  rx: Positive.describe("Horizontal radius."),
  ry: Positive.describe("Vertical radius."),
  label: z.string().max(400).optional(),
  labelStyle: LabelStyleSchema.optional(),
}).describe("An ellipse centered at (x, y).");

export const RectangleSchema = withBase({
  type: z.literal("rectangle"),
  x: FiniteNumber.describe("Top-left x (or center x when `anchor` is 'center')."),
  y: FiniteNumber.describe("Top-left y (or center y when `anchor` is 'center')."),
  width: Positive,
  height: Positive,
  anchor: z
    .enum(["topLeft", "center"])
    .optional()
    .describe("How (x, y) is interpreted. Default 'topLeft'."),
  radius: NonNegative.max(200).optional().describe("Corner radius. Default 8 for soft corners."),
  label: z.string().max(400).optional().describe("Text drawn centered inside the rectangle."),
  labelStyle: LabelStyleSchema.optional(),
}).describe("A rectangle. Use it for boxes, panels and plain containers.");

export const LineSchema = withBase({
  type: z.literal("line"),
  x1: FiniteNumber,
  y1: FiniteNumber,
  x2: FiniteNumber,
  y2: FiniteNumber,
  label: z.string().max(200).optional().describe("Text drawn at the middle of the line."),
  labelStyle: LabelStyleSchema.optional(),
}).describe("A straight line segment. For a line with an arrowhead use type 'arrow'.");

export const ArrowSchema = withBase({
  type: z.literal("arrow"),
  x1: FiniteNumber.describe("Tail x."),
  y1: FiniteNumber.describe("Tail y."),
  x2: FiniteNumber.describe("Head x - the arrowhead is drawn here."),
  y2: FiniteNumber.describe("Head y."),
  heads: z
    .enum(["end", "start", "both", "none"])
    .optional()
    .describe("Where arrowheads are drawn. Default 'end'."),
  curve: FiniteNumber.min(-1)
    .max(1)
    .optional()
    .describe(
      "Bend the arrow. 0 = straight (default), positive bends one way, negative the other. Use small values like 0.2.",
    ),
  label: z.string().max(200).optional().describe("Text drawn at the middle of the arrow."),
  labelStyle: LabelStyleSchema.optional(),
}).describe(
  "An arrow between two points. The arrowhead marker is generated for you - never draw arrowheads by hand with paths or polygons.",
);

export const TextSchema = BaseElementSchema.extend(TextStyleSchema.shape)
  .extend({
    type: z.literal("text"),
    x: FiniteNumber,
    y: FiniteNumber,
    text: z
      .string()
      .max(2000)
      .describe(
        "The text. '\\n' starts a new line; the renderer also wraps automatically when `maxWidth` is set.",
      ),
    align: TextAnchorSchema.optional().describe("Horizontal alignment. Default 'middle'."),
    baseline: BaselineSchema.optional().describe("Vertical alignment. Default 'middle'."),
    background: ColorSchema.optional().describe(
      "Optional pill behind the text, useful over busy areas.",
    ),
    rotate: FiniteNumber.min(-360)
      .max(360)
      .optional()
      .describe("Rotation in degrees around (x, y). Use -90 for a vertical axis caption."),
  })
  .describe("A standalone text block with automatic multi-line layout.");

export const PolygonSchema = withBase({
  type: z.literal("polygon"),
  points: z
    .array(PointSchema)
    .min(3, "a polygon needs at least 3 points")
    .max(500)
    .describe("Vertices in order. The shape is closed automatically."),
  label: z.string().max(400).optional(),
  labelStyle: LabelStyleSchema.optional(),
}).describe("A closed polygon. Needs at least 3 points.");

export const PolylineSchema = withBase({
  type: z.literal("polyline"),
  points: z
    .array(PointSchema)
    .min(2, "a polyline needs at least 2 points")
    .max(2000)
    .describe("Vertices in order. The shape is NOT closed."),
  smooth: z.boolean().optional().describe("Round the corners into a smooth curve. Default false."),
  heads: z.enum(["end", "start", "both", "none"]).optional().describe("Arrowheads. Default 'none'."),
}).describe("An open path through a list of points. Good for curves and signal traces.");

/** Only real SVG path commands and numbers are accepted - nothing else can reach the DOM. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+\-eE]+$/;

export const PathSchema = withBase({
  type: z.literal("path"),
  d: z
    .string()
    .min(1)
    .max(20000)
    .regex(PATH_DATA, "path data may only contain SVG path commands and numbers")
    .describe(
      "Raw SVG path data (e.g. 'M 10 10 L 90 90'). Escape hatch only - prefer polyline, arrow or a semantic element.",
    ),
}).describe("A raw SVG path. Use only when no other primitive can express the shape.");

export const LayoutSchema = z
  .enum(["horizontal", "vertical", "grid", "manual"])
  .describe(
    "How children are arranged. 'horizontal' = left to right, 'vertical' = top to bottom, 'grid' = wrapped rows, 'manual' = use each child's own x/y.",
  );

export const GroupSchema = BaseElementSchema.extend({
  type: z.literal("group"),
  x: FiniteNumber.optional().describe("Top-left x of the group box. Auto-placed when omitted."),
  y: FiniteNumber.optional().describe("Top-left y of the group box. Auto-placed when omitted."),
  label: z
    .string()
    .max(200)
    .optional()
    .describe("Title drawn on the group frame, e.g. 'AWS' or 'VLAN 10'."),
  layout: LayoutSchema.optional().describe("Default 'manual'."),
  gap: NonNegative.max(500).optional().describe("Space between children. Default 40."),
  columns: z.number().int().min(1).max(20).optional().describe("Columns when layout is 'grid'."),
  padding: NonNegative.max(200).optional().describe("Inner padding of the frame. Default 28."),
  frame: z
    .boolean()
    .optional()
    .describe("Draw a labelled box around the children. Default true when `label` is set."),
  fill: ColorSchema.optional().describe("Frame background."),
  stroke: ColorSchema.optional().describe("Frame border color."),
  dash: DashSchema.optional(),
  opacity: FiniteNumber.min(0).max(1).optional(),
  // Recursive: a group can contain any element, including other groups.
  // The return type is annotated explicitly because TypeScript cannot infer
  // through the cycle (schema -> type -> schema).
  get children(): z.ZodArray<z.ZodType<VisualElement>> {
    return z.array(VisualElementSchema as unknown as z.ZodType<VisualElement>).max(500);
  },
}).describe(
  "A container that groups elements and can lay them out automatically. Use it to draw boundaries like 'AWS', 'VLAN 10' or 'Data layer'.",
);

export const PRIMITIVE_TYPES = [
  "circle",
  "ellipse",
  "rectangle",
  "line",
  "arrow",
  "text",
  "polygon",
  "polyline",
  "path",
  "group",
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

// Imported at the bottom to break the cycle with the group's recursive children.
import { VisualElementSchema } from "./element.js";
import type { VisualElement } from "../types.js";
