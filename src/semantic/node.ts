import { round } from "../scene/geometry.js";
import { color, mix, type Theme } from "../scene/theme.js";
import type {
  BoundingBox,
  ElementBox,
  NodeLikeElement,
  NodeShape,
  PrimitiveElement,
} from "../scene/types.js";
import { NODE_PRESETS } from "../scene/schemas/semantic.js";
import { layoutText } from "../utils/text.js";
import type { ResolveContext } from "./context.js";

/**
 * `node` and its domain presets (server, database, router, switch, computer,
 * cloud) are the workhorse of Visual MCP.
 *
 * The model gives a label; everything else - size, shape geometry, text
 * centring, icon glyphs - is computed here.
 */

const PAD_X = 22;
const PAD_Y = 16;
const MIN_W = 116;
const MIN_H = 58;
const DEFAULT_FONT = 15;
const DEFAULT_WRAP = 200;

export function shapeOf(element: NodeLikeElement): NodeShape {
  if (element.type !== "node") return NODE_PRESETS[element.type] ?? "rounded";
  return element.shape ?? "rounded";
}

export interface NodeMetrics {
  width: number;
  height: number;
  shape: NodeShape;
  label: ReturnType<typeof layoutText> | null;
  sublabel: ReturnType<typeof layoutText> | null;
  fontSize: number;
  /** Vertical nudge for the text block, e.g. below a cylinder rim. */
  textOffsetY: number;
}

/** Intrinsic size of a node, honouring explicit width/height overrides. */
export function nodeMetrics(element: NodeLikeElement): NodeMetrics {
  const shape = shapeOf(element);
  const fontSize = element.fontSize ?? DEFAULT_FONT;
  const label = element.label
    ? layoutText(element.label, { fontSize, maxWidth: DEFAULT_WRAP, bold: true, lineHeight: 1.25 })
    : null;
  const sublabel = element.sublabel
    ? layoutText(element.sublabel, { fontSize: fontSize * 0.8, maxWidth: DEFAULT_WRAP, lineHeight: 1.25 })
    : null;

  const textW = Math.max(label?.width ?? 0, sublabel?.width ?? 0);
  const textH = (label?.height ?? 0) + (sublabel ? sublabel.height + 4 : 0);

  let width = Math.max(MIN_W, textW + PAD_X * 2);
  let height = Math.max(MIN_H, textH + PAD_Y * 2);
  let textOffsetY = 0;

  switch (shape) {
    case "circle": {
      const d = Math.max(width, height, Math.hypot(textW, textH) + PAD_X * 1.6);
      width = d;
      height = d;
      break;
    }
    case "ellipse":
      width = width * 1.2;
      height = height * 1.35;
      break;
    case "diamond":
      width = width * 1.55;
      height = height * 1.7;
      break;
    case "hexagon":
      width = width * 1.28;
      break;
    case "cylinder": {
      const rim = cylinderRim(height);
      height = height + rim * 1.6;
      textOffsetY = rim * 0.5;
      break;
    }
    case "cloud":
      width = width * 1.34;
      height = height * 1.62;
      break;
    case "stack":
      width = width + 10;
      height = height + 12;
      textOffsetY = 4;
      break;
    case "screen":
      height = height + 20;
      textOffsetY = -8;
      break;
    case "pill":
      width = width + height * 0.4;
      break;
    default:
      break;
  }

  if (element.width !== undefined) width = element.width;
  if (element.height !== undefined) height = element.height;
  return { width: round(width), height: round(height), shape, label, sublabel, fontSize, textOffsetY };
}

function cylinderRim(height: number): number {
  return Math.max(8, Math.min(16, height * 0.2));
}

export function nodeBox(element: NodeLikeElement, x: number, y: number): ElementBox {
  const m = nodeMetrics(element);
  const roundShape = m.shape === "circle" || m.shape === "ellipse" || m.shape === "cloud";
  return {
    id: element.id,
    x: x - m.width / 2,
    y: y - m.height / 2,
    width: m.width,
    height: m.height,
    cx: x,
    cy: y,
    shape: roundShape ? "ellipse" : "rect",
    radius: m.shape === "pill" ? m.height / 2 : 12,
  };
}

interface NodeColors {
  fill: string;
  stroke: string;
  text: string;
  strokeWidth: number;
  opacity: number | undefined;
}

/** Local wrapper so call sites read `colorHelper(value, theme, fallback)`. */
function colorHelper(value: string | undefined, theme: Theme, fallback: string): string {
  return color(theme, value, fallback);
}

function nodeColors(element: NodeLikeElement, theme: Theme): NodeColors {
  const emphasis = element.emphasis ?? "normal";
  return {
    fill: colorHelper(element.fill, theme, mix(theme.surface, theme.background, 0.15)),
    stroke: colorHelper(
      element.stroke,
      theme,
      emphasis === "strong" ? theme.primary : emphasis === "muted" ? theme.grid : theme.border,
    ),
    text: colorHelper(element.textColor, theme, emphasis === "muted" ? theme.muted : theme.foreground),
    strokeWidth: element.strokeWidth ?? (emphasis === "strong" ? 2.5 : 1.5),
    opacity: element.opacity,
  };
}

export const expandNode = (element: NodeLikeElement, ctx: ResolveContext): PrimitiveElement[] => {
  const b = ctx.boxes.get(element.id);
  if (!b) return [];
  const m = nodeMetrics(element);
  const c = nodeColors(element, ctx.theme);
  const out: PrimitiveElement[] = [];
  const id = (suffix: string) => ctx.derivedId(element.id, suffix);

  const style = {
    fill: c.fill,
    stroke: c.stroke,
    strokeWidth: c.strokeWidth,
    ...(element.dash ? { dash: element.dash } : {}),
    ...(c.opacity !== undefined ? { opacity: c.opacity } : {}),
  };

  const { x, y, width: w, height: h } = b;

  switch (m.shape) {
    case "circle":
      out.push({ id: id("body"), type: "circle", x: b.cx, y: b.cy, radius: Math.min(w, h) / 2, ...style });
      break;
    case "ellipse":
      out.push({ id: id("body"), type: "ellipse", x: b.cx, y: b.cy, rx: w / 2, ry: h / 2, ...style });
      break;
    case "diamond":
      out.push({
        id: id("body"),
        type: "polygon",
        points: [
          { x: b.cx, y },
          { x: x + w, y: b.cy },
          { x: b.cx, y: y + h },
          { x, y: b.cy },
        ],
        ...style,
      });
      break;
    case "hexagon": {
      const inset = Math.min(w * 0.18, 30);
      out.push({
        id: id("body"),
        type: "polygon",
        points: [
          { x: x + inset, y },
          { x: x + w - inset, y },
          { x: x + w, y: b.cy },
          { x: x + w - inset, y: y + h },
          { x: x + inset, y: y + h },
          { x, y: b.cy },
        ],
        ...style,
      });
      break;
    }
    case "cylinder": {
      const rx = w / 2;
      const ry = cylinderRim(h);
      out.push({
        id: id("body"),
        type: "path",
        d:
          `M ${round(x)} ${round(y + ry)}` +
          ` L ${round(x)} ${round(y + h - ry)}` +
          ` A ${round(rx)} ${round(ry)} 0 0 0 ${round(x + w)} ${round(y + h - ry)}` +
          ` L ${round(x + w)} ${round(y + ry)} Z`,
        ...style,
      });
      out.push({
        id: id("rim"),
        type: "ellipse",
        x: b.cx,
        y: y + ry,
        rx,
        ry,
        ...style,
        fill: mixToward(c.fill, ctx.theme.foreground, 0.12),
      });
      break;
    }
    case "cloud":
      out.push({ id: id("body"), type: "path", d: cloudPath(x, y, w, h), ...style });
      break;
    case "stack": {
      const step = 5;
      for (let i = 2; i >= 1; i--) {
        out.push({
          id: id(`layer-${i}`),
          type: "rectangle",
          x: x + i * step,
          y: y - i * step + 6,
          width: w - i * step * 2 + i * step,
          height: h - 12,
          radius: 10,
          fill: mixToward(c.fill, ctx.theme.background, 0.35),
          stroke: c.stroke,
          strokeWidth: 1,
          opacity: 0.9,
        });
      }
      out.push({
        id: id("body"),
        type: "rectangle",
        x,
        y: y + 6,
        width: w - 10,
        height: h - 12,
        radius: 10,
        ...style,
      });
      break;
    }
    case "screen": {
      const baseH = 16;
      out.push({
        id: id("body"),
        type: "rectangle",
        x,
        y,
        width: w,
        height: h - baseH,
        radius: 8,
        ...style,
      });
      out.push({
        id: id("stand"),
        type: "polygon",
        points: [
          { x: b.cx - 16, y: y + h - baseH },
          { x: b.cx + 16, y: y + h - baseH },
          { x: b.cx + 30, y: y + h },
          { x: b.cx - 30, y: y + h },
        ],
        fill: c.stroke,
        stroke: c.stroke,
        strokeWidth: 1,
      });
      break;
    }
    case "pill":
      out.push({
        id: id("body"),
        type: "rectangle",
        x,
        y,
        width: w,
        height: h,
        radius: h / 2,
        ...style,
      });
      break;
    case "rect":
      out.push({ id: id("body"), type: "rectangle", x, y, width: w, height: h, radius: 2, ...style });
      break;
    default:
      out.push({ id: id("body"), type: "rectangle", x, y, width: w, height: h, radius: 12, ...style });
      break;
  }

  // Preset glyphs: a small visual cue so a router is not just "a circle".
  out.push(...presetGlyph(element, b, ctx, c.stroke));

  const textTop = b.cy + m.textOffsetY - ((m.label?.height ?? 0) + (m.sublabel ? m.sublabel.height + 4 : 0)) / 2;
  if (m.label) {
    out.push({
      id: id("label"),
      type: "text",
      x: b.cx,
      y: textTop + m.label.height / 2,
      text: element.label!,
      fontSize: m.fontSize,
      fontWeight: 600,
      color: c.text,
      align: "middle",
      baseline: "middle",
      lineHeight: 1.25,
      maxWidth: DEFAULT_WRAP,
    });
  }
  if (m.sublabel) {
    out.push({
      id: id("sublabel"),
      type: "text",
      x: b.cx,
      y: textTop + (m.label?.height ?? 0) + 4 + m.sublabel.height / 2,
      text: element.sublabel!,
      fontSize: m.fontSize * 0.8,
      color: colorHelper(undefined, ctx.theme, ctx.theme.muted),
      align: "middle",
      baseline: "middle",
      lineHeight: 1.25,
      maxWidth: DEFAULT_WRAP,
    });
  }

  return out;
};

function presetGlyph(
  element: NodeLikeElement,
  b: BoundingBox & { cx: number; cy: number },
  ctx: ResolveContext,
  stroke: string,
): PrimitiveElement[] {
  const id = (s: string) => ctx.derivedId(element.id, s);
  if (element.type === "router") {
    const r = Math.min(b.width, b.height) / 2;
    const arm = r * 0.42;
    return [
      {
        id: id("glyph"),
        type: "polyline",
        points: [
          { x: b.cx - arm, y: b.cy - r + 14 },
          { x: b.cx + arm, y: b.cy - r + 14 },
        ],
        stroke,
        strokeWidth: 1.5,
        heads: "both",
        fill: "none",
      },
    ];
  }
  if (element.type === "switch") {
    const ports = 5;
    const span = b.width * 0.5;
    const step = span / (ports - 1);
    const out: PrimitiveElement[] = [];
    for (let i = 0; i < ports; i++) {
      const px = b.cx - span / 2 + i * step;
      out.push({
        id: id(`port-${i}`),
        type: "line",
        x1: px,
        y1: b.y + b.height - 12,
        x2: px,
        y2: b.y + b.height - 5,
        stroke,
        strokeWidth: 2,
      });
    }
    return out;
  }
  return [];
}

function mixToward(from: string, to: string, amount: number): string {
  return mix(from, to, amount);
}

/** A cloud outline built from cubic curves, scaled into the element box. */
function cloudPath(x: number, y: number, w: number, h: number): string {
  const p = (fx: number, fy: number) => `${round(x + fx * w)} ${round(y + fy * h)}`;
  return (
    `M ${p(0.22, 0.86)}` +
    ` C ${p(0.04, 0.86)} ${p(-0.02, 0.6)} ${p(0.12, 0.52)}` +
    ` C ${p(0.06, 0.28)} ${p(0.26, 0.12)} ${p(0.4, 0.24)}` +
    ` C ${p(0.48, 0.02)} ${p(0.76, 0.04)} ${p(0.78, 0.26)}` +
    ` C ${p(0.96, 0.22)} ${p(1.06, 0.46)} ${p(0.92, 0.58)}` +
    ` C ${p(1.04, 0.7)} ${p(0.96, 0.88)} ${p(0.8, 0.86)}` +
    ` Z`
  );
}
