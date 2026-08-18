import { round } from "../scene/geometry.js";
import { color } from "../scene/theme.js";
import type { AxisElement, PrimitiveElement } from "../scene/types.js";
import type { AxisFrame, ResolveContext } from "./context.js";

/**
 * `axis` draws a coordinate system AND declares a data frame.
 *
 * Any element with `frame: "<axis id>"` gives coordinates in data units and
 * this module maps them to pixels. That is the seed for the whole future maths
 * layer (functions, distributions, projections): they will all be new element
 * types that resolve against an AxisFrame, with no renderer changes.
 */

export function makeFrame(element: AxisElement): AxisFrame {
  const xRange = (element.xRange ?? [0, 10]) as [number, number];
  const yRange = (element.yRange ?? [0, 10]) as [number, number];
  const spanX = xRange[1] - xRange[0] || 1;
  const spanY = yRange[1] - yRange[0] || 1;
  const scaleX = element.width / spanX;
  const scaleY = element.height / spanY;
  return {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    xRange,
    yRange,
    scaleX,
    scaleY,
    toCanvas(dx: number, dy: number) {
      return {
        x: element.x + (dx - xRange[0]) * scaleX,
        // Data y grows upwards; canvas y grows downwards.
        y: element.y + element.height - (dy - yRange[0]) * scaleY,
      };
    },
  };
}

export const expandAxis = (element: AxisElement, ctx: ResolveContext): PrimitiveElement[] => {
  const frame = ctx.frames.get(element.id) ?? makeFrame(element);
  const theme = ctx.theme;
  const stroke = color(theme, element.stroke, theme.muted);
  const grid = theme.grid;
  const ticks = element.ticks ?? 5;
  const showGrid = element.grid ?? true;
  const arrows = element.arrows ?? true;
  const id = (s: string) => ctx.derivedId(element.id, s);
  const out: PrimitiveElement[] = [];

  const { x, y, width: w, height: h } = frame;
  const zeroMode = element.origin === "zero";
  const axisY = zeroMode ? clampToFrame(frame.toCanvas(frame.xRange[0], 0).y, y, y + h) : y + h;
  const axisX = zeroMode ? clampToFrame(frame.toCanvas(0, frame.yRange[0]).x, x, x + w) : x;

  if (showGrid && ticks > 0) {
    for (let i = 0; i <= ticks; i++) {
      const gx = x + (w / ticks) * i;
      const gy = y + (h / ticks) * i;
      out.push({ id: id(`grid-v-${i}`), type: "line", x1: gx, y1: y, x2: gx, y2: y + h, stroke: grid, strokeWidth: 1 });
      out.push({ id: id(`grid-h-${i}`), type: "line", x1: x, y1: gy, x2: x + w, y2: gy, stroke: grid, strokeWidth: 1 });
    }
  }

  const axisStyle = { stroke, strokeWidth: 1.6, fill: "none" as const };
  if (arrows) {
    out.push({ id: id("x-axis"), type: "arrow", x1: x, y1: axisY, x2: x + w + 12, y2: axisY, heads: "end", ...axisStyle });
    out.push({ id: id("y-axis"), type: "arrow", x1: axisX, y1: y + h, x2: axisX, y2: y - 12, heads: "end", ...axisStyle });
  } else {
    out.push({ id: id("x-axis"), type: "line", x1: x, y1: axisY, x2: x + w, y2: axisY, ...axisStyle });
    out.push({ id: id("y-axis"), type: "line", x1: axisX, y1: y, x2: axisX, y2: y + h, ...axisStyle });
  }

  if (ticks > 0) {
    for (let i = 0; i <= ticks; i++) {
      const t = i / ticks;
      const dxVal = frame.xRange[0] + (frame.xRange[1] - frame.xRange[0]) * t;
      const dyVal = frame.yRange[0] + (frame.yRange[1] - frame.yRange[0]) * t;
      const px = x + w * t;
      const py = y + h - h * t;
      out.push({ id: id(`tick-x-${i}`), type: "line", x1: px, y1: axisY, x2: px, y2: axisY + 5, stroke, strokeWidth: 1.4 });
      out.push({
        id: id(`tick-x-label-${i}`),
        type: "text",
        x: px,
        y: axisY + 16,
        text: formatTick(dxVal),
        fontSize: 11,
        color: theme.muted,
        align: "middle",
        baseline: "middle",
      });
      out.push({ id: id(`tick-y-${i}`), type: "line", x1: axisX - 5, y1: py, x2: axisX, y2: py, stroke, strokeWidth: 1.4 });
      out.push({
        id: id(`tick-y-label-${i}`),
        type: "text",
        x: axisX - 10,
        y: py,
        text: formatTick(dyVal),
        fontSize: 11,
        color: theme.muted,
        align: "end",
        baseline: "middle",
      });
    }
  }

  if (element.xLabel) {
    out.push({
      id: id("x-label"),
      type: "text",
      x: x + w / 2,
      y: y + h + (ticks > 0 ? 40 : 22),
      text: element.xLabel,
      fontSize: 13,
      fontWeight: 600,
      color: theme.foreground,
      align: "middle",
      baseline: "middle",
    });
  }
  if (element.yLabel) {
    // Rotation is expressed as a path-free text element; the renderer applies
    // the transform, so the model never writes transform strings.
    out.push({
      id: id("y-label"),
      type: "text",
      x: x - (ticks > 0 ? 46 : 22),
      y: y + h / 2,
      text: element.yLabel,
      fontSize: 13,
      fontWeight: 600,
      color: theme.foreground,
      align: "middle",
      baseline: "middle",
      rotate: -90,
    });
  }

  return out;
};

function clampToFrame(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function formatTick(v: number): string {
  const r = round(v, 2);
  if (Math.abs(r) >= 1000) return r.toExponential(1);
  return String(r);
}
