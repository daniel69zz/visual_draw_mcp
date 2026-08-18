import { z } from "zod";

/**
 * Shared building blocks for every element schema.
 *
 * Design rule: property names must be short, explicit and predictable, because
 * an LLM reads these schemas and fills them in without trial and error.
 */

/** Stable, human-meaningful identifier. Used for conversational editing. */
export const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/,
    "id must start with a letter or digit and contain only letters, digits, '_', '-', '.' or ':'",
  )
  .describe("Stable, meaningful id (e.g. 'backend'). Reuse it later to update or remove this element.");

/**
 * Colors are restricted to a safe, closed grammar.
 * Arbitrary strings are rejected so a model can never inject `url(javascript:...)`
 * or other active content into the SVG output.
 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB = /^rgba?\(\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*[, ]\s*[\d.]+%?\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/;
const HSL = /^hsla?\(\s*[\d.]+(?:deg|rad|turn)?\s*[, ]\s*[\d.]+%\s*[, ]\s*[\d.]+%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/;

/** Theme tokens the renderer resolves against the active {@link Theme}. */
export const THEME_TOKENS = [
  "background",
  "surface",
  "foreground",
  "muted",
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "grid",
  "border",
  "none",
  "transparent",
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];

export const ColorSchema = z
  .string()
  .refine(
    (v) =>
      HEX.test(v) ||
      RGB.test(v) ||
      HSL.test(v) ||
      (THEME_TOKENS as readonly string[]).includes(v) ||
      /^[a-z]{3,20}$/.test(v), // plain CSS color keywords: 'white', 'tomato'
    {
      message:
        "color must be a hex value (#8B5CF6), rgb()/hsl(), a CSS color keyword, or a theme token (primary, secondary, accent, foreground, muted, success, warning, danger, none)",
    },
  )
  // Kept short on purpose: this string is repeated dozens of times in the
  // JSON Schema the model receives, so every character is paid for many times.
  .describe("Hex, rgb()/hsl(), CSS keyword, or theme token (primary/secondary/accent/muted/success/warning/danger/surface/foreground/none).");

export const FiniteNumber = z
  .number()
  .refine(Number.isFinite, { message: "must be a finite number (NaN and Infinity are not allowed)" });

export const NonNegative = FiniteNumber.refine((v) => v >= 0, {
  message: "must be zero or positive",
});

export const Positive = FiniteNumber.refine((v) => v > 0, { message: "must be greater than zero" });

export const DashSchema = z
  .enum(["solid", "dashed", "dotted"])
  .describe("Stroke pattern. 'dashed' reads as optional/async, 'dotted' as weak coupling.");

export const PointSchema = z
  .object({ x: FiniteNumber, y: FiniteNumber })
  .describe("A point in canvas coordinates (0,0 = top-left, y grows downwards).");

export const XY = z.tuple([FiniteNumber, FiniteNumber]).describe("[x, y] pair.");

/** Style properties shared by every drawable element. */
export const StyleSchema = z.object({
  fill: ColorSchema.optional().describe("Interior color. Use 'none' for outline-only shapes."),
  stroke: ColorSchema.optional().describe("Outline color."),
  strokeWidth: NonNegative.max(40).optional().describe("Outline thickness in pixels. Default 2."),
  dash: DashSchema.optional(),
  opacity: FiniteNumber.min(0).max(1).optional().describe("0 = invisible, 1 = fully opaque."),
});

export const TextAnchorSchema = z
  .enum(["start", "middle", "end"])
  .describe("Horizontal alignment relative to x. 'middle' centers the text on x.");

export const BaselineSchema = z
  .enum(["top", "middle", "bottom"])
  .describe("Vertical alignment relative to y. 'middle' centers the text block on y.");

export const FontWeightSchema = z
  .union([z.enum(["normal", "medium", "semibold", "bold"]), z.number().int().min(100).max(900)])
  .describe("Font weight. Keywords or a numeric CSS weight (100-900).");

/** Text styling shared by `text`, `label` and every labelled semantic element. */
export const TextStyleSchema = z.object({
  fontSize: Positive.max(400).optional().describe("Font size in pixels. Default 14."),
  fontWeight: FontWeightSchema.optional(),
  color: ColorSchema.optional().describe("Text color. Defaults to the theme foreground."),
  lineHeight: FiniteNumber.min(0.5)
    .max(4)
    .optional()
    .describe("Line spacing as a multiple of fontSize. Default 1.35."),
  italic: z.boolean().optional(),
  /**
   * Word wrapping is done by the renderer, not by the model: SVG has no native
   * wrapping and we never want the LLM computing line breaks.
   */
  maxWidth: Positive.optional().describe(
    "Wrap the text so lines stay under this pixel width. The renderer breaks lines for you - never insert manual line breaks for wrapping, only for deliberate breaks.",
  ),
});

/**
 * Style for the convenience `label` on a shape.
 *
 * Only the three properties the renderer actually honours for shape labels -
 * promising the full TextStyle here would be a lie, and it would cost several
 * kilobytes in the model's tool schema for nothing.
 */
export const LabelStyleSchema = z.object({
  fontSize: Positive.max(400).optional(),
  fontWeight: FontWeightSchema.optional(),
  color: ColorSchema.optional(),
});

/** Every element carries an id and a type. */
export const BaseElementSchema = z.object({
  id: IdSchema,
  /** Free-form note for the model's own bookkeeping; never rendered. */
  note: z.string().max(280).optional().describe("Optional private note. Not rendered."),
});

export type Style = z.infer<typeof StyleSchema>;
export type TextStyle = z.infer<typeof TextStyleSchema>;
export type Dash = z.infer<typeof DashSchema>;
export type TextAnchor = z.infer<typeof TextAnchorSchema>;
export type Baseline = z.infer<typeof BaselineSchema>;
export type FontWeight = z.infer<typeof FontWeightSchema>;
