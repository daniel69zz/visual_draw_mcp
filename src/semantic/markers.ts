import { gaussian, makeRandom, type Vec } from "../scene/geometry.js";
import { color } from "../scene/theme.js";
import type {
  ClusterElement,
  PlotLineElement,
  PointElement,
  PrimitiveElement,
  ScatterElement,
} from "../scene/types.js";
import type { ResolveContext } from "./context.js";

/**
 * Data-space elements: point, scatter, cluster and plotLine.
 *
 * All of them accept an optional `frame` (an axis id). With a frame the model
 * thinks in data units - "class A is centred at (2, 6)" - and never converts to
 * pixels. Without one, the same fields mean canvas pixels.
 */

type MarkerShape = "dot" | "cross" | "square" | "triangle" | "ring";

function project(ctx: ResolveContext, frameId: string | undefined, x: number, y: number): Vec {
  if (!frameId) return { x, y };
  const frame = ctx.frames.get(frameId);
  if (!frame) return { x, y };
  return frame.toCanvas(x, y);
}

/** One marker, drawn as whichever primitive matches the requested shape. */
export function marker(
  id: string,
  at: Vec,
  radius: number,
  shape: MarkerShape,
  fill: string,
  opacity?: number,
): PrimitiveElement[] {
  const o = opacity !== undefined ? { opacity } : {};
  switch (shape) {
    case "square":
      return [
        {
          id,
          type: "rectangle",
          x: at.x - radius,
          y: at.y - radius,
          width: radius * 2,
          height: radius * 2,
          radius: 1,
          fill,
          stroke: "none",
          ...o,
        },
      ];
    case "cross":
      return [
        { id: `${id}-a`, type: "line", x1: at.x - radius, y1: at.y - radius, x2: at.x + radius, y2: at.y + radius, stroke: fill, strokeWidth: Math.max(1.4, radius * 0.45), ...o },
        { id: `${id}-b`, type: "line", x1: at.x + radius, y1: at.y - radius, x2: at.x - radius, y2: at.y + radius, stroke: fill, strokeWidth: Math.max(1.4, radius * 0.45), ...o },
      ];
    case "triangle":
      return [
        {
          id,
          type: "polygon",
          points: [
            { x: at.x, y: at.y - radius * 1.15 },
            { x: at.x + radius, y: at.y + radius * 0.8 },
            { x: at.x - radius, y: at.y + radius * 0.8 },
          ],
          fill,
          stroke: "none",
          ...o,
        },
      ];
    case "ring":
      return [
        { id, type: "circle", x: at.x, y: at.y, radius, fill: "none", stroke: fill, strokeWidth: Math.max(1.4, radius * 0.4), ...o },
      ];
    default:
      return [{ id, type: "circle", x: at.x, y: at.y, radius, fill, stroke: "none", ...o }];
  }
}

export const expandPoint = (element: PointElement, ctx: ResolveContext): PrimitiveElement[] => {
  const at = project(ctx, element.frame, element.x, element.y);
  const fill = color(ctx.theme, element.fill, ctx.theme.primary);
  const radius = element.radius ?? 5;
  const out = marker(ctx.derivedId(element.id, "marker"), at, radius, element.shape ?? "dot", fill);
  if (element.label) {
    out.push({
      id: ctx.derivedId(element.id, "label"),
      type: "text",
      x: at.x + radius + 6,
      y: at.y,
      text: element.label,
      fontSize: 11,
      color: ctx.theme.muted,
      align: "start",
      baseline: "middle",
    });
  }
  return out;
};

export const expandScatter = (element: ScatterElement, ctx: ResolveContext): PrimitiveElement[] => {
  const fill = element.fill ? color(ctx.theme, element.fill, ctx.theme.primary) : ctx.nextSeriesColor();
  const radius = element.radius ?? 4;
  const shape = element.shape ?? "dot";
  const out: PrimitiveElement[] = [];
  element.points.forEach(([x, y], i) => {
    out.push(
      ...marker(
        ctx.derivedId(element.id, `p${i}`),
        project(ctx, element.frame, x, y),
        radius,
        shape,
        fill,
        element.opacity,
      ),
    );
  });
  if (element.label) ctx.legend.push({ label: element.label, color: fill, shape });
  return out;
};

export const expandCluster = (element: ClusterElement, ctx: ResolveContext): PrimitiveElement[] => {
  const fill = element.fill ? color(ctx.theme, element.fill, ctx.theme.primary) : ctx.nextSeriesColor();
  const count = element.count ?? 24;
  const shape = element.shape ?? "dot";
  const radius = element.radius ?? 4;
  const frame = element.frame ? ctx.frames.get(element.frame) : undefined;

  // Default spread: a fraction of the frame span in data units, or 45px raw.
  const spreadX = element.spread ?? (frame ? (frame.xRange[1] - frame.xRange[0]) * 0.07 : 45);
  const spreadY = element.spreadY ?? spreadX * (frame ? (frame.yRange[1] - frame.yRange[0]) / (frame.xRange[1] - frame.xRange[0]) : 1);
  const angle = ((element.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const rand = makeRandom(element.seed ?? hashSeed(element.id));
  const out: PrimitiveElement[] = [];
  const pts: Vec[] = [];

  for (let i = 0; i < count; i++) {
    const gx = gaussian(rand) * spreadX;
    const gy = gaussian(rand) * spreadY;
    const dx = element.x + gx * cos - gy * sin;
    const dy = element.y + gx * sin + gy * cos;
    pts.push(project(ctx, element.frame, dx, dy));
  }

  if (element.hull) {
    const center = project(ctx, element.frame, element.x, element.y);
    const rx = Math.abs(spreadX * (frame?.scaleX ?? 1)) * 2.2;
    const ry = Math.abs(spreadY * (frame?.scaleY ?? 1)) * 2.2;
    out.push({
      id: ctx.derivedId(element.id, "hull"),
      type: "ellipse",
      x: center.x,
      y: center.y,
      rx: Math.max(rx, radius * 3),
      ry: Math.max(ry, radius * 3),
      fill,
      stroke: fill,
      strokeWidth: 1.2,
      opacity: 0.12,
    });
  }

  pts.forEach((p, i) => {
    out.push(...marker(ctx.derivedId(element.id, `p${i}`), p, radius, shape, fill, 0.9));
  });

  if (element.label) {
    // A cluster labels itself in place, so it deliberately stays out of the
    // legend - two names for the same blob is noise.
    const anchor = project(ctx, element.frame, element.x, element.y);
    const dy = Math.abs(spreadY * (frame?.scaleY ?? 1)) * 2.4 + 16;
    out.push({
      id: ctx.derivedId(element.id, "label"),
      type: "text",
      x: anchor.x,
      y: anchor.y - dy,
      text: element.label,
      fontSize: 13,
      fontWeight: 600,
      color: fill,
      align: "middle",
      baseline: "middle",
    });
  }

  return out;
};

export const expandPlotLine = (element: PlotLineElement, ctx: ResolveContext): PrimitiveElement[] => {
  const frame = element.frame ? ctx.frames.get(element.frame) : undefined;
  const [x1, y1] = element.from as [number, number];
  const [x2, y2] = element.to as [number, number];

  let a = project(ctx, element.frame, x1, y1);
  let b = project(ctx, element.frame, x2, y2);

  if (element.extend && frame) {
    // Stretch the line far past the plot, then clip it to the plot rectangle.
    // Clipping in pixel space keeps the line inside the axes on both ends,
    // which extending in data space alone does not.
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const reach = frame.width + frame.height;
    const far = {
      a: { x: a.x - (dx / len) * reach, y: a.y - (dy / len) * reach },
      b: { x: b.x + (dx / len) * reach, y: b.y + (dy / len) * reach },
    };
    const clipped = clipToRect(far.a, far.b, frame);
    if (clipped) {
      a = clipped.a;
      b = clipped.b;
    }
  }
  const stroke = color(ctx.theme, element.stroke, ctx.theme.foreground);
  const out: PrimitiveElement[] = [
    {
      id: ctx.derivedId(element.id, "line"),
      type: "line",
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      stroke,
      strokeWidth: element.strokeWidth ?? 2.2,
      ...(element.dash ? { dash: element.dash } : {}),
    },
  ];
  if (element.label) {
    const t = 0.82;
    out.push({
      id: ctx.derivedId(element.id, "label"),
      type: "text",
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - 12,
      text: element.label,
      fontSize: 12,
      fontWeight: 600,
      color: stroke,
      align: "middle",
      baseline: "middle",
      background: ctx.theme.background,
    });
  }
  return out;
};

/** Liang-Barsky: clips a segment to an axis-aligned rectangle. */
function clipToRect(
  a: Vec,
  b: Vec,
  rect: { x: number; y: number; width: number; height: number },
): { a: Vec; b: Vec } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const tests: [number, number][] = [
    [-dx, a.x - rect.x],
    [dx, rect.x + rect.width - a.x],
    [-dy, a.y - rect.y],
    [dy, rect.y + rect.height - a.y],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return {
    a: { x: a.x + dx * t0, y: a.y + dy * t0 },
    b: { x: a.x + dx * t1, y: a.y + dy * t1 },
  };
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
