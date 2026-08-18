import type { BoundingBox, GroupElement, NodeLikeElement, VisualElement } from "../scene/types.js";
import { boxFromPoints } from "../scene/geometry.js";
import { nodeMetrics } from "../semantic/node.js";
import { layoutText, isBold } from "../utils/text.js";

/** Element types that take part in automatic layout (they can be auto-placed). */
const FLOW_TYPES = new Set([
  "node",
  "server",
  "database",
  "router",
  "switch",
  "computer",
  "cloud",
  "group",
]);

export function isFlowElement(element: VisualElement): element is NodeLikeElement | GroupElement {
  return FLOW_TYPES.has(element.type);
}

export function isNodeLike(element: VisualElement): element is NodeLikeElement {
  return FLOW_TYPES.has(element.type) && element.type !== "group";
}

/** Intrinsic size of anything that has one, before layout. */
export function intrinsicSize(element: VisualElement): { width: number; height: number } {
  switch (element.type) {
    case "circle":
      return { width: element.radius * 2, height: element.radius * 2 };
    case "ellipse":
      return { width: element.rx * 2, height: element.ry * 2 };
    case "rectangle":
      return { width: element.width, height: element.height };
    case "axis":
      return { width: element.width, height: element.height };
    case "text": {
      const m = layoutText(element.text, {
        fontSize: element.fontSize ?? 14,
        ...(element.lineHeight !== undefined ? { lineHeight: element.lineHeight } : {}),
        ...(element.maxWidth !== undefined ? { maxWidth: element.maxWidth } : {}),
        bold: isBold(element.fontWeight),
      });
      return { width: m.width, height: m.height };
    }
    case "polygon":
    case "polyline": {
      const b = boxFromPoints(element.points);
      return { width: b.width, height: b.height };
    }
    case "point":
      return { width: (element.radius ?? 5) * 2, height: (element.radius ?? 5) * 2 };
    default:
      if (isNodeLike(element)) {
        const m = nodeMetrics(element as never);
        return { width: m.width, height: m.height };
      }
      return { width: 0, height: 0 };
  }
}

/** Static bounding box of elements whose position is always explicit. */
export function staticBox(element: VisualElement): BoundingBox | null {
  const size = intrinsicSize(element);
  switch (element.type) {
    case "circle":
    case "ellipse":
      return { x: element.x - size.width / 2, y: element.y - size.height / 2, ...size };
    case "rectangle":
      return element.anchor === "center"
        ? { x: element.x - size.width / 2, y: element.y - size.height / 2, ...size }
        : { x: element.x, y: element.y, ...size };
    case "axis":
      return { x: element.x, y: element.y, ...size };
    case "text": {
      const align = element.align ?? "middle";
      const baseline = element.baseline ?? "middle";
      const x =
        align === "start" ? element.x : align === "end" ? element.x - size.width : element.x - size.width / 2;
      const y =
        baseline === "top" ? element.y : baseline === "bottom" ? element.y - size.height : element.y - size.height / 2;
      return { x, y, ...size };
    }
    case "polygon":
    case "polyline":
      return boxFromPoints(element.points);
    case "line":
      return {
        x: Math.min(element.x1, element.x2),
        y: Math.min(element.y1, element.y2),
        width: Math.abs(element.x2 - element.x1),
        height: Math.abs(element.y2 - element.y1),
      };
    case "arrow":
      return {
        x: Math.min(element.x1, element.x2),
        y: Math.min(element.y1, element.y2),
        width: Math.abs(element.x2 - element.x1),
        height: Math.abs(element.y2 - element.y1),
      };
    default:
      return null;
  }
}
