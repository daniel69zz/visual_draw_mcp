import { controlPoint, round, smoothCurve, smoothPoints, type Vec } from "../scene/geometry.js";
import type { Theme } from "../scene/theme.js";
import type { Dash } from "../scene/schemas/common.js";
import type { PrimitiveElement } from "../scene/types.js";
import { fontWeightValue, isBold, layoutText } from "../utils/text.js";
import type { Defs } from "./defs.js";
import { node, type AttrValue, type SvgNode } from "./svgNode.js";

/**
 * Primitive -> SvgNode. This is the only place that knows SVG syntax, and it
 * is intentionally boring: every hard decision was already made upstream by the
 * layout and semantic layers.
 */

export interface RenderContext {
  theme: Theme;
  defs: Defs;
}

function dashArray(dash: Dash | undefined, strokeWidth: number): string | undefined {
  if (!dash || dash === "solid") return undefined;
  if (dash === "dotted") return `${round(strokeWidth * 0.1)} ${round(strokeWidth * 2.2)}`;
  return `${round(strokeWidth * 3.5)} ${round(strokeWidth * 2.5)}`;
}

/** Shared fill/stroke attributes for shape primitives. */
function shapeAttrs(el: Record<string, unknown>, theme: Theme): Record<string, AttrValue | undefined> {
  const strokeWidth = typeof el.strokeWidth === "number" ? el.strokeWidth : 1.5;
  const stroke = typeof el.stroke === "string" ? el.stroke : undefined;
  const fill = typeof el.fill === "string" ? el.fill : undefined;
  return {
    fill: fill ?? "none",
    stroke: stroke === "none" ? undefined : stroke,
    "stroke-width": stroke && stroke !== "none" ? round(strokeWidth) : undefined,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-dasharray": dashArray(el.dash as Dash | undefined, strokeWidth),
    opacity: typeof el.opacity === "number" ? el.opacity : undefined,
  };
}

export function renderElement(element: PrimitiveElement, ctx: RenderContext): SvgNode[] {
  const common = { "data-element-id": element.id };

  switch (element.type) {
    case "circle":
      return [
        node("circle", {
          ...common,
          cx: round(element.x),
          cy: round(element.y),
          r: round(element.radius),
          ...shapeAttrs(element, ctx.theme),
        }),
      ];

    case "ellipse":
      return [
        node("ellipse", {
          ...common,
          cx: round(element.x),
          cy: round(element.y),
          rx: round(element.rx),
          ry: round(element.ry),
          ...shapeAttrs(element, ctx.theme),
        }),
      ];

    case "rectangle": {
      const x = element.anchor === "center" ? element.x - element.width / 2 : element.x;
      const y = element.anchor === "center" ? element.y - element.height / 2 : element.y;
      const r = element.radius ?? 8;
      return [
        node("rect", {
          ...common,
          x: round(x),
          y: round(y),
          width: round(element.width),
          height: round(element.height),
          rx: round(Math.min(r, element.width / 2, element.height / 2)),
          ...shapeAttrs(element, ctx.theme),
        }),
      ];
    }

    case "line":
      return [
        node("line", {
          ...common,
          x1: round(element.x1),
          y1: round(element.y1),
          x2: round(element.x2),
          y2: round(element.y2),
          ...shapeAttrs(element, ctx.theme),
          fill: undefined,
          stroke: element.stroke ?? ctx.theme.muted,
        }),
      ];

    case "arrow":
      return [renderArrow(element, ctx, common)];

    case "polygon":
      return [
        node("polygon", {
          ...common,
          points: pointsAttr(element.points),
          ...shapeAttrs(element, ctx.theme),
        }),
      ];

    case "polyline":
      return [renderPolyline(element, ctx, common)];

    case "path":
      return [node("path", { ...common, d: element.d, ...shapeAttrs(element, ctx.theme) })];

    case "text":
      return renderText(element, ctx, common);

    default:
      return [];
  }
}

function pointsAttr(points: Vec[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
}

function renderArrow(
  element: Extract<PrimitiveElement, { type: "arrow" }>,
  ctx: RenderContext,
  common: Record<string, AttrValue>,
): SvgNode {
  const stroke = element.stroke ?? ctx.theme.muted;
  const heads = element.heads ?? "end";
  const marker = heads === "none" ? undefined : ctx.defs.arrow(stroke);
  const a = { x: element.x1, y: element.y1 };
  const b = { x: element.x2, y: element.y2 };
  const curve = element.curve ?? 0;

  const d = curve
    ? `M ${round(a.x)} ${round(a.y)} Q ${(() => {
        const c = controlPoint(a, b, curve);
        return `${round(c.x)} ${round(c.y)}`;
      })()} ${round(b.x)} ${round(b.y)}`
    : `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)}`;

  return node("path", {
    ...common,
    d,
    ...shapeAttrs(element, ctx.theme),
    fill: "none",
    stroke,
    "stroke-width": round(element.strokeWidth ?? 1.8),
    "marker-end": heads === "end" || heads === "both" ? marker : undefined,
    "marker-start": heads === "start" || heads === "both" ? marker : undefined,
  });
}

function renderPolyline(
  element: Extract<PrimitiveElement, { type: "polyline" }>,
  ctx: RenderContext,
  common: Record<string, AttrValue>,
): SvgNode {
  const stroke = element.stroke ?? ctx.theme.muted;
  const heads = element.heads ?? "none";
  const marker = heads === "none" ? undefined : ctx.defs.arrow(stroke);
  const attrs = {
    ...common,
    ...shapeAttrs(element, ctx.theme),
    fill: "none" as const,
    stroke,
    "marker-end": heads === "end" || heads === "both" ? marker : undefined,
    "marker-start": heads === "start" || heads === "both" ? marker : undefined,
  };

  if (element.smooth) {
    // Right-angled routes get rounded corners; free curves get a spline.
    const d = isOrthogonal(element.points) ? smoothPoints(element.points, 14) : smoothCurve(element.points);
    return node("path", { ...attrs, d });
  }
  return node("polyline", { ...attrs, points: pointsAttr(element.points) });
}

function isOrthogonal(points: Vec[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) return false;
  }
  return true;
}

/**
 * Multi-line text with real wrapping, alignment and an optional background
 * pill. SVG gives us none of this, so it is all computed here.
 */
function renderText(
  element: Extract<PrimitiveElement, { type: "text" }>,
  ctx: RenderContext,
  common: Record<string, AttrValue>,
): SvgNode[] {
  const fontSize = element.fontSize ?? 14;
  const bold = isBold(element.fontWeight);
  const measured = layoutText(element.text, {
    fontSize,
    ...(element.lineHeight !== undefined ? { lineHeight: element.lineHeight } : {}),
    ...(element.maxWidth !== undefined ? { maxWidth: element.maxWidth } : {}),
    bold,
  });

  const align = element.align ?? "middle";
  const baseline = element.baseline ?? "middle";
  const blockTop =
    baseline === "top" ? element.y : baseline === "bottom" ? element.y - measured.height : element.y - measured.height / 2;

  const anchor = align === "start" ? "start" : align === "end" ? "end" : "middle";
  const out: SvgNode[] = [];

  if (element.background && element.background !== "none") {
    const padX = 6;
    const padY = 3;
    const boxX =
      align === "start" ? element.x : align === "end" ? element.x - measured.width : element.x - measured.width / 2;
    out.push(
      node("rect", {
        x: round(boxX - padX),
        y: round(blockTop - padY),
        width: round(measured.width + padX * 2),
        height: round(measured.height + padY * 2),
        rx: 5,
        fill: element.background,
        opacity: 0.92,
      }),
    );
  }

  const tspans = measured.lines.map((line, i) =>
    node(
      "tspan",
      {
        x: round(element.x),
        // Baseline of line i: centre of its box, nudged by the cap height.
        y: round(blockTop + i * measured.lineHeight + measured.lineHeight / 2 + fontSize * 0.34),
      },
      undefined,
      line,
    ),
  );

  out.push(
    node(
      "text",
      {
        ...common,
        x: round(element.x),
        y: round(element.y),
        "font-family": ctx.theme.fontFamily,
        "font-size": round(fontSize),
        "font-weight": fontWeightValue(element.fontWeight, 400),
        "font-style": element.italic ? "italic" : undefined,
        fill: element.color ?? ctx.theme.foreground,
        "text-anchor": anchor,
        opacity: undefined,
        transform: element.rotate ? `rotate(${round(element.rotate)} ${round(element.x)} ${round(element.y)})` : undefined,
      },
      tspans,
    ),
  );

  return out;
}
