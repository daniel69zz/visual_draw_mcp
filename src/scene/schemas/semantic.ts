import { z } from "zod";
import {
  BaseElementSchema,
  ColorSchema,
  DashSchema,
  FiniteNumber,
  IdSchema,
  NonNegative,
  Positive,
  LabelStyleSchema,
  XY,
} from "./common.js";

/**
 * Semantic elements: high-level, meaning-carrying components.
 *
 * These exist so the model never has to do geometry. It says "a node here" or
 * "a connection from A to B" and the resolver computes sizes, anchor points,
 * edge intersections, arrowheads and text layout.
 *
 * Every semantic element is compiled into primitives before rendering
 * (see src/semantic/*).
 */

export const NodeShapeSchema = z
  .enum([
    "rounded",
    "rect",
    "circle",
    "ellipse",
    "pill",
    "diamond",
    "hexagon",
    "cylinder",
    "cloud",
    "stack",
    "screen",
  ])
  .describe(
    "Visual shape. 'rounded' (default) for generic boxes, 'cylinder' for stores, 'diamond' for decisions, 'cloud' for external networks, 'stack' for replicated services.",
  );

const NodeBody = {
  x: FiniteNumber.optional().describe(
    "Center x. OMIT IT and let the automatic layout place the node - only set it when the user asks for a specific position.",
  ),
  y: FiniteNumber.optional().describe("Center y. Omit to use automatic layout."),
  label: z
    .string()
    .max(300)
    .optional()
    .describe("Main text inside the node. '\\n' starts a new line, e.g. 'PC\\n192.168.20.10'."),
  sublabel: z
    .string()
    .max(200)
    .optional()
    .describe("Smaller secondary line under the label, e.g. a port, an IP or a role."),
  width: Positive.max(4000).optional().describe("Override the auto-computed width."),
  height: Positive.max(4000).optional().describe("Override the auto-computed height."),
  fill: ColorSchema.optional().describe("Body color. Defaults to a theme surface color."),
  stroke: ColorSchema.optional().describe("Border color. Defaults to the theme accent."),
  strokeWidth: NonNegative.max(20).optional(),
  dash: DashSchema.optional(),
  textColor: ColorSchema.optional(),
  fontSize: Positive.max(200).optional().describe("Label font size. Default 15."),
  opacity: FiniteNumber.min(0).max(1).optional(),
  emphasis: z
    .enum(["normal", "strong", "muted"])
    .optional()
    .describe("Relative visual weight. Use 'strong' for the subject of the explanation."),
};

export const NodeSchema = BaseElementSchema.extend({
  type: z.literal("node"),
  shape: NodeShapeSchema.optional(),
  ...NodeBody,
}).describe(
  "A labelled box - the main building block of architecture, network and flow diagrams. Size is computed from the label; position is computed by the layout engine unless you set x/y.",
);

/**
 * Domain presets: identical to `node` but with the shape already chosen.
 *
 * Their fields are declared without per-field documentation because `node`
 * above documents exactly the same properties, and this schema is emitted six
 * more times into the JSON Schema the model reads.
 */
const CompactNodeBody = {
  x: FiniteNumber.optional(),
  y: FiniteNumber.optional(),
  label: z.string().max(300).optional().describe("Main text. '\\n' starts a new line."),
  sublabel: z.string().max(200).optional().describe("Smaller secondary line."),
  width: Positive.max(4000).optional(),
  height: Positive.max(4000).optional(),
  fill: ColorSchema.optional(),
  stroke: ColorSchema.optional(),
  strokeWidth: NonNegative.max(20).optional(),
  dash: DashSchema.optional(),
  textColor: ColorSchema.optional(),
  fontSize: Positive.max(200).optional(),
  opacity: FiniteNumber.min(0).max(1).optional(),
  emphasis: z.enum(["normal", "strong", "muted"]).optional(),
};

const preset = <T extends string>(type: T, doc: string) =>
  BaseElementSchema.extend({
    type: z.literal(type),
    ...CompactNodeBody,
  }).describe(`${doc} Same properties as 'node' (x, y, label, sublabel, fill, stroke, emphasis, ...); omit x/y to use automatic layout.`);

export const ServerSchema = preset("server", "A server or backend service. Rendered as a stacked box.");
export const DatabaseSchema = preset(
  "database",
  "A database. Rendered as a cylinder. Use it for PostgreSQL, MySQL, MongoDB, Redis, etc.",
);
export const RouterSchema = preset("router", "A network router. Rendered as a circular network device.");
export const SwitchSchema = preset("switch", "A network switch. Rendered as a wide network device.");
export const ComputerSchema = preset("computer", "A client computer, PC or workstation, with a screen and base.");
export const CloudSchema = preset("cloud", "A cloud or external network (Internet, WAN, a third-party API).");

export const ConnectionSchema = BaseElementSchema.extend({
  type: z.literal("connection"),
  from: IdSchema.describe("Source element id. The renderer finds its border automatically."),
  to: IdSchema.describe("Target element id."),
  arrow: z.boolean().optional().describe("Draw an arrowhead at the target. Default true."),
  bidirectional: z.boolean().optional().describe("Arrowheads at both ends. Default false."),
  label: z
    .string()
    .max(200)
    .optional()
    .describe("Text on the connection, e.g. 'HTTPS', 'Ethernet', 'SQL', 'VLAN 10'."),
  routing: z
    .enum(["straight", "curved", "orthogonal"])
    .optional()
    .describe(
      "Line shape. 'straight' (default), 'curved' for parallel edges that would overlap, 'orthogonal' for right-angled network/rack diagrams.",
    ),
  fromSide: z
    .enum(["auto", "top", "right", "bottom", "left"])
    .optional()
    .describe("Force the exit side on the source. Default 'auto' (nearest border point)."),
  toSide: z
    .enum(["auto", "top", "right", "bottom", "left"])
    .optional()
    .describe("Force the entry side on the target."),
  stroke: ColorSchema.optional(),
  strokeWidth: NonNegative.max(20).optional(),
  dash: DashSchema.optional().describe("Use 'dashed' for async / optional links."),
  labelStyle: LabelStyleSchema.optional(),
}).describe(
  "A link between two elements, referenced BY ID. Never compute x1/y1/x2/y2 for links between nodes - use this and the renderer will attach it to the right borders and keep it correct after any element moves.",
);

export const AxisSchema = BaseElementSchema.extend({
  type: z.literal("axis"),
  x: FiniteNumber.describe("Left edge of the plot area, in canvas pixels."),
  y: FiniteNumber.describe("Top edge of the plot area, in canvas pixels."),
  width: Positive.describe("Plot area width in pixels."),
  height: Positive.describe("Plot area height in pixels."),
  xRange: XY.optional().describe("[min, max] of the horizontal data range. Default [0, 10]."),
  yRange: XY.optional().describe("[min, max] of the vertical data range. Default [0, 10]."),
  xLabel: z.string().max(120).optional().describe("Caption under the horizontal axis."),
  yLabel: z.string().max(120).optional().describe("Caption beside the vertical axis (rotated)."),
  ticks: z.number().int().min(0).max(40).optional().describe("Tick marks per axis. Default 5, 0 to hide."),
  grid: z.boolean().optional().describe("Draw a faint grid. Default true."),
  arrows: z.boolean().optional().describe("Arrowheads at the axis ends. Default true."),
  origin: z
    .enum(["corner", "zero"])
    .optional()
    .describe("'corner' (default) draws the axes on the box edges; 'zero' draws them through (0,0)."),
  stroke: ColorSchema.optional(),
}).describe(
  "A 2D coordinate system. It also defines a DATA FRAME: any `point`, `cluster`, `scatter` or `plotLine` whose `frame` is this axis id gives coordinates in DATA units and the renderer maps them to pixels. This is the base for regression, LDA, distributions and any chart-like explanation.",
);

const framed = {
  frame: IdSchema.optional().describe(
    "Id of an `axis` element. When set, coordinates are DATA coordinates inside that axis. When omitted, coordinates are canvas pixels.",
  ),
};

export const PointSemanticSchema = BaseElementSchema.extend({
  type: z.literal("point"),
  ...framed,
  x: FiniteNumber,
  y: FiniteNumber,
  radius: Positive.max(200).optional().describe("Dot radius in pixels. Default 5."),
  shape: z
    .enum(["dot", "cross", "square", "triangle", "ring"])
    .optional()
    .describe("Marker shape. Use different shapes to distinguish classes."),
  fill: ColorSchema.optional(),
  label: z.string().max(120).optional().describe("Small caption next to the point."),
}).describe("A single data point / marker. Combine with `axis` for plots.");

export const ScatterSchema = BaseElementSchema.extend({
  type: z.literal("scatter"),
  ...framed,
  points: z.array(XY).min(1).max(3000).describe("[[x, y], ...] coordinates."),
  radius: Positive.max(60).optional().describe("Marker radius. Default 4."),
  shape: z.enum(["dot", "cross", "square", "triangle", "ring"]).optional(),
  fill: ColorSchema.optional(),
  opacity: FiniteNumber.min(0).max(1).optional(),
  label: z.string().max(120).optional().describe("Series name, drawn in the legend area."),
}).describe("A set of markers sharing one style. Use it instead of many `point` elements.");

export const ClusterSchema = BaseElementSchema.extend({
  type: z.literal("cluster"),
  ...framed,
  x: FiniteNumber.describe("Cluster center x."),
  y: FiniteNumber.describe("Cluster center y."),
  count: z.number().int().min(1).max(500).optional().describe("Number of generated points. Default 24."),
  spread: Positive.optional().describe("Standard deviation of the scatter, in the same units as x/y."),
  spreadY: Positive.optional().describe("Vertical spread, when the cluster is not circular."),
  angle: FiniteNumber.optional().describe("Rotation of the cluster in degrees."),
  radius: Positive.max(60).optional().describe("Marker radius. Default 4."),
  shape: z.enum(["dot", "cross", "square", "triangle", "ring"]).optional(),
  fill: ColorSchema.optional(),
  label: z.string().max(120).optional().describe("Class name, drawn near the cluster."),
  hull: z.boolean().optional().describe("Draw a soft ellipse around the cluster. Default false."),
  seed: z.number().int().optional().describe("Seed for the point generation. Same seed = same picture."),
}).describe(
  "A generated blob of points around a center - the fastest way to show classes, distributions or groups (LDA, k-means, classification). The points are deterministic for a given seed.",
);

export const PlotLineSchema = BaseElementSchema.extend({
  type: z.literal("plotLine"),
  ...framed,
  from: XY.describe("[x, y] start, in frame coordinates."),
  to: XY.describe("[x, y] end, in frame coordinates."),
  stroke: ColorSchema.optional(),
  strokeWidth: NonNegative.max(20).optional(),
  dash: DashSchema.optional(),
  label: z.string().max(160).optional().describe("Caption near the line, e.g. 'y = 0.8x + 2'."),
  extend: z
    .boolean()
    .optional()
    .describe("Extend the line to the edges of the frame. Useful for decision boundaries."),
}).describe(
  "A straight line in data space. Use it for regression lines, decision boundaries, thresholds and projections.",
);

export const LabelSchema = BaseElementSchema.extend({
  type: z.literal("label"),
  text: z.string().max(600).describe("The caption text. '\\n' starts a new line."),
  target: IdSchema.optional().describe(
    "Attach the label to another element by id. Position is computed from that element's box.",
  ),
  position: z
    .enum(["above", "below", "left", "right", "center"])
    .optional()
    .describe("Placement relative to `target`. Default 'above'."),
  x: FiniteNumber.optional().describe("Used when there is no `target`."),
  y: FiniteNumber.optional(),
  offset: NonNegative.max(400).optional().describe("Extra distance from the target. Default 14."),
  color: ColorSchema.optional(),
  fontSize: Positive.max(200).optional(),
  fontWeight: z.union([z.enum(["normal", "medium", "semibold", "bold"]), z.number().int().min(100).max(900)]).optional(),
  background: ColorSchema.optional().describe("Pill behind the text for readability."),
  maxWidth: Positive.optional(),
}).describe(
  "An annotation. Prefer it over a raw `text` element when the caption belongs to something: give it `target` and it follows that element.",
);

export const SEMANTIC_TYPES = [
  "node",
  "connection",
  "axis",
  "point",
  "scatter",
  "cluster",
  "plotLine",
  "label",
  "server",
  "database",
  "router",
  "switch",
  "computer",
  "cloud",
] as const;

export type SemanticType = (typeof SEMANTIC_TYPES)[number];

/** Preset types that are rendered as a `node` with a fixed shape. */
export const NODE_PRESETS: Record<string, z.infer<typeof NodeShapeSchema>> = {
  server: "stack",
  database: "cylinder",
  router: "circle",
  switch: "rect",
  computer: "screen",
  cloud: "cloud",
};
