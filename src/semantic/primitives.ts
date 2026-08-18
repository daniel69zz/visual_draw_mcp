import { midpoint } from "../scene/geometry.js";
import { color } from "../scene/theme.js";
import type { PrimitiveElement, VisualElement } from "../scene/types.js";
import type { ResolveContext } from "./context.js";

/**
 * Normalisation pass for primitives.
 *
 * Shapes accept a convenience `label`, but the renderer should only ever have
 * to draw geometry. So we split labels out into real `text` elements here, and
 * resolve theme tokens to concrete colours. After this pass a primitive is
 * literally what the SVG will contain.
 */
export const expandPrimitive = (element: VisualElement, ctx: ResolveContext): PrimitiveElement[] => {
  const theme = ctx.theme;
  const base = { ...element } as Record<string, unknown>;

  for (const key of ["fill", "stroke", "color", "background"]) {
    if (typeof base[key] === "string") {
      base[key] = color(theme, base[key] as string, base[key] as string);
    }
  }

  const label = typeof base.label === "string" ? (base.label as string) : undefined;
  const labelStyle = base.labelStyle as { fontSize?: number; color?: string; fontWeight?: number } | undefined;
  delete base.label;
  delete base.labelStyle;

  const out: PrimitiveElement[] = [base as PrimitiveElement];
  if (!label) return out;

  const at = labelAnchor(element);
  if (!at) return out;

  out.push({
    id: ctx.derivedId(element.id, "label"),
    type: "text",
    x: at.x,
    y: at.y,
    text: label,
    fontSize: labelStyle?.fontSize ?? 14,
    color: color(theme, labelStyle?.color, theme.foreground),
    align: "middle",
    baseline: "middle",
    ...(labelStyle?.fontWeight !== undefined ? { fontWeight: labelStyle.fontWeight } : {}),
    ...(isEdge(element) ? { background: theme.background, fontSize: labelStyle?.fontSize ?? 12 } : {}),
  });
  return out;
};

function isEdge(element: VisualElement): boolean {
  return element.type === "line" || element.type === "arrow";
}

function labelAnchor(element: VisualElement): { x: number; y: number } | null {
  switch (element.type) {
    case "circle":
    case "ellipse":
      return { x: element.x, y: element.y };
    case "rectangle":
      return element.anchor === "center"
        ? { x: element.x, y: element.y }
        : { x: element.x + element.width / 2, y: element.y + element.height / 2 };
    case "line":
    case "arrow":
      return midpoint({ x: element.x1, y: element.y1 }, { x: element.x2, y: element.y2 });
    case "polygon": {
      const pts = element.points;
      const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return { x: sum.x / pts.length, y: sum.y / pts.length };
    }
    default:
      return null;
  }
}
