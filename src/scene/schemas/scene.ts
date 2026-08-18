import { z } from "zod";
import { ColorSchema, FiniteNumber, IdSchema, NonNegative, Positive } from "./common.js";
import { VisualElementSchema } from "./element.js";

/**
 * A Scene is the whole structured description of a picture.
 * It is what the model builds; SVG is only an output format of it.
 */

export const SceneLayoutSchema = z
  .enum(["auto", "layered", "horizontal", "vertical", "grid", "manual"])
  .describe(
    "How elements without explicit x/y are placed. 'auto' (default) builds a layered flow from the connections when there are any, otherwise a row. 'layered' forces the flow layout, 'horizontal'/'vertical'/'grid' force a simple arrangement, 'manual' means you provide every x/y yourself.",
  );

export const DirectionSchema = z
  .enum(["right", "down", "left", "up"])
  .describe("Direction the layered flow grows in. Default 'right'.");

export const ThemeNameSchema = z
  .enum(["dark", "light", "blueprint", "paper"])
  .describe(
    "Visual theme. 'dark' (default) is a modern technical look, 'light' is for documents, 'blueprint' is a blue schematic, 'paper' is warm and printable.",
  );

/** User-supplied palette overrides on top of the chosen theme. */
export const ThemeOverrideSchema = z
  .object({
    background: ColorSchema.optional(),
    surface: ColorSchema.optional(),
    foreground: ColorSchema.optional(),
    muted: ColorSchema.optional(),
    primary: ColorSchema.optional(),
    secondary: ColorSchema.optional(),
    accent: ColorSchema.optional(),
    success: ColorSchema.optional(),
    warning: ColorSchema.optional(),
    danger: ColorSchema.optional(),
    grid: ColorSchema.optional(),
    border: ColorSchema.optional(),
    fontFamily: z.string().max(200).optional(),
  })
  .describe("Optional palette overrides. Only set what you actually want to change.");

export const SceneBodySchema = z.object({
  title: z
    .string()
    .max(160)
    .optional()
    .describe("Diagram title, drawn at the top. Keep it short - it is a caption, not a sentence."),
  subtitle: z.string().max(240).optional().describe("Optional second line under the title."),
  width: Positive.max(6000)
    .optional()
    .describe("Canvas width in pixels. Default 960. Use 1200+ for wide flows."),
  height: Positive.max(6000)
    .optional()
    .describe("Canvas height in pixels. Default 600."),
  autoFit: z
    .boolean()
    .optional()
    .describe(
      "Grow the canvas so nothing is clipped. Default true - leave it on and stop worrying about exact sizes.",
    ),
  background: ColorSchema.optional().describe("Canvas background. Defaults to the theme background."),
  theme: ThemeNameSchema.optional(),
  themeOverrides: ThemeOverrideSchema.optional(),
  layout: SceneLayoutSchema.optional(),
  direction: DirectionSchema.optional(),
  gap: NonNegative.max(600).optional().describe("Spacing used by the automatic layout. Default 90."),
  padding: NonNegative.max(400).optional().describe("Margin around the drawing. Default 48."),
  legend: z
    .boolean()
    .optional()
    .describe("Show a legend built from the `label` of scatter/cluster series. Default true."),
  elements: z
    .array(VisualElementSchema)
    .max(2000)
    .describe("Everything in the picture. Order matters: later elements are drawn on top."),
});

export const SceneSchema = SceneBodySchema.extend({
  id: IdSchema.optional().describe("Scene id. Generated when omitted."),
}).describe("A complete visual scene.");

/**
 * Canvas settings only, no elements - used by create_scene.
 *
 * Leaving `elements` out is not just tidiness: it keeps the full element union
 * out of that tool's JSON Schema, which is the difference between a 4 KB and a
 * 55 KB tool definition in the model's context.
 */
export const SceneInitSchema = SceneBodySchema.omit({ elements: true }).extend({
  id: IdSchema.optional(),
});

export const ViewportSchema = z.object({
  x: FiniteNumber,
  y: FiniteNumber,
  width: Positive,
  height: Positive,
});
