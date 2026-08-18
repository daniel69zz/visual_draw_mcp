import {
  anchorOnBox,
  controlPoint,
  midpoint,
  orthogonalRoute,
  quadraticAt,
  type Vec,
} from "../scene/geometry.js";
import { color } from "../scene/theme.js";
import type { ConnectionElement, PrimitiveElement } from "../scene/types.js";
import type { ResolveContext } from "./context.js";

/**
 * `connection` is the single most important ergonomic win in Visual MCP:
 * the model names two ids and gets a correct, border-to-border, arrow-headed
 * link - which stays correct after either endpoint moves.
 */

const GAP = 4; // breathing room between a border and the arrowhead

export const expandConnection = (
  element: ConnectionElement,
  ctx: ResolveContext,
): PrimitiveElement[] => {
  const a = ctx.boxes.get(element.from);
  const b = ctx.boxes.get(element.to);
  if (!a || !b) return []; // already reported by validation

  const routing = element.routing ?? "straight";
  const stroke = color(ctx.theme, element.stroke, ctx.theme.muted);
  const strokeWidth = element.strokeWidth ?? 1.8;
  const showArrow = element.arrow ?? true;
  const heads = element.bidirectional ? "both" : showArrow ? "end" : "none";
  const id = (suffix: string) => ctx.derivedId(element.id, suffix);

  const style = {
    stroke,
    strokeWidth,
    fill: "none" as const,
    ...(element.dash ? { dash: element.dash } : {}),
  };

  const out: PrimitiveElement[] = [];
  let labelAt: Vec;

  if (routing === "orthogonal") {
    const horizontal = Math.abs(b.cx - a.cx) >= Math.abs(b.cy - a.cy);
    const start = anchorOnBox(a, { x: b.cx, y: b.cy }, element.fromSide ?? (horizontal ? "right" : "bottom"));
    const end = anchorOnBox(b, { x: a.cx, y: a.cy }, element.toSide ?? (horizontal ? "left" : "top"));
    const points = orthogonalRoute(start, end, horizontal);
    out.push({ id: id("line"), type: "polyline", points, smooth: true, heads, ...style });
    labelAt = points.length >= 3 ? midpoint(points[1]!, points[points.length - 2]!) : midpoint(start, end);
  } else {
    const start = anchorOnBox(a, { x: b.cx, y: b.cy }, element.fromSide);
    const end = anchorOnBox(b, { x: a.cx, y: a.cy }, element.toSide);
    const trimmed = trim(start, end, GAP);
    const curve = routing === "curved" ? 0.28 : 0;
    out.push({
      id: id("line"),
      type: "arrow",
      x1: trimmed.a.x,
      y1: trimmed.a.y,
      x2: trimmed.b.x,
      y2: trimmed.b.y,
      heads,
      ...(curve ? { curve } : {}),
      ...style,
    });
    labelAt = curve
      ? quadraticAt(trimmed.a, controlPoint(trimmed.a, trimmed.b, curve), trimmed.b, 0.5)
      : midpoint(trimmed.a, trimmed.b);
  }

  if (element.label) {
    out.push({
      id: id("label"),
      type: "text",
      x: labelAt.x,
      y: labelAt.y,
      text: element.label,
      fontSize: element.labelStyle?.fontSize ?? 12,
      color: color(ctx.theme, element.labelStyle?.color, ctx.theme.muted),
      align: "middle",
      baseline: "middle",
      background: ctx.theme.background,
      ...(element.labelStyle?.fontWeight !== undefined
        ? { fontWeight: element.labelStyle.fontWeight }
        : {}),
    });
  }

  return out;
};

/** Pulls both endpoints back so the arrowhead does not overlap the border. */
function trim(a: Vec, b: Vec, gap: number): { a: Vec; b: Vec } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= gap * 2.5) return { a, b };
  const ux = dx / len;
  const uy = dy / len;
  return {
    a: { x: a.x + ux * gap, y: a.y + uy * gap },
    b: { x: b.x - ux * gap, y: b.y - uy * gap },
  };
}
