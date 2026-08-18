import type { BoundingBox, ElementBox } from "./types.js";

/** Geometry helpers. All of this exists so the model never has to do it. */

export interface Vec {
  x: number;
  y: number;
}

export const EMPTY_BOX: BoundingBox = { x: 0, y: 0, width: 0, height: 0 };

export function box(x: number, y: number, width: number, height: number): BoundingBox {
  return { x, y, width, height };
}

export function boxFromCenter(cx: number, cy: number, width: number, height: number): BoundingBox {
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

export function center(b: BoundingBox): Vec {
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function unionBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function unionAll(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((acc, b) => unionBox(acc, b));
}

export function expandBox(b: BoundingBox, by: number): BoundingBox {
  return { x: b.x - by, y: b.y - by, width: b.width + by * 2, height: b.height + by * 2 };
}

export function boxFromPoints(points: Vec[]): BoundingBox {
  if (points.length === 0) return EMPTY_BOX;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function round(v: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

export type Side = "top" | "right" | "bottom" | "left";

/**
 * Point where the segment from the box centre towards `target` leaves the box.
 * This is what makes `connection` work: edges touch borders, not centres.
 */
export function anchorOnBox(b: ElementBox, target: Vec, side?: Side | "auto"): Vec {
  const c = { x: b.cx, y: b.cy };
  if (side && side !== "auto") return anchorOnSide(b, side);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;

  if (b.shape === "ellipse") {
    const rx = b.width / 2;
    const ry = b.height / 2;
    const denom = Math.hypot(dx / rx, dy / ry);
    if (denom === 0) return c;
    return { x: c.x + dx / denom, y: c.y + dy / denom };
  }

  const halfW = b.width / 2;
  const halfH = b.height / 2;
  const scale = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

export function anchorOnSide(b: ElementBox, side: Side): Vec {
  switch (side) {
    case "top":
      return { x: b.cx, y: b.y };
    case "bottom":
      return { x: b.cx, y: b.y + b.height };
    case "left":
      return { x: b.x, y: b.cy };
    case "right":
      return { x: b.x + b.width, y: b.cy };
  }
}

/** Moves a point `by` pixels along the direction away from `from`. */
export function pushAlong(from: Vec, to: Vec, by: number): Vec {
  const d = distance(from, to);
  if (d === 0) return to;
  return { x: to.x + ((to.x - from.x) / d) * by, y: to.y + ((to.y - from.y) / d) * by };
}

export function midpoint(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Quadratic control point for a bowed connection. `curve` in roughly [-1, 1]. */
export function controlPoint(a: Vec, b: Vec, curve: number): Vec {
  const m = midpoint(a, b);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular offset, scaled by the segment length so short links bow less.
  const offset = curve * len * 0.28;
  return { x: m.x - (dy / len) * offset, y: m.y + (dx / len) * offset };
}

/** Point on a quadratic Bezier at t. Used to place labels on curved links. */
export function quadraticAt(a: Vec, c: Vec, b: Vec, t: number): Vec {
  const mt = 1 - t;
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  };
}

/** Right-angled route between two boxes: exits, turns once, enters. */
export function orthogonalRoute(a: Vec, b: Vec, preferHorizontal: boolean): Vec[] {
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b];
  const mid = preferHorizontal
    ? [
        { x: (a.x + b.x) / 2, y: a.y },
        { x: (a.x + b.x) / 2, y: b.y },
      ]
    : [
        { x: a.x, y: (a.y + b.y) / 2 },
        { x: b.x, y: (a.y + b.y) / 2 },
      ];
  return [a, ...mid, b];
}

/** Rounds the corners of a polyline into a path string-friendly point list. */
export function smoothPoints(points: Vec[], radius = 12): string {
  if (points.length < 2) return "";
  const first = points[0]!;
  let d = `M ${round(first.x)} ${round(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const next = points[i + 1]!;
    const r1 = Math.min(radius, distance(prev, cur) / 2);
    const r2 = Math.min(radius, distance(cur, next) / 2);
    const inP = pointTowards(cur, prev, r1);
    const outP = pointTowards(cur, next, r2);
    d += ` L ${round(inP.x)} ${round(inP.y)} Q ${round(cur.x)} ${round(cur.y)} ${round(outP.x)} ${round(outP.y)}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${round(last.x)} ${round(last.y)}`;
  return d;
}

function pointTowards(from: Vec, to: Vec, by: number): Vec {
  const d = distance(from, to);
  if (d === 0) return from;
  return { x: from.x + ((to.x - from.x) / d) * by, y: from.y + ((to.y - from.y) / d) * by };
}

/** Catmull-Rom to Bezier: a smooth curve through every point. */
export function smoothCurve(points: Vec[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    const [a, b] = points as [Vec, Vec];
    return `M ${round(a.x)} ${round(a.y)} L ${round(b.x)} ${round(b.y)}`;
  }
  let d = `M ${round(points[0]!.x)} ${round(points[0]!.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(p2.x)} ${round(p2.y)}`;
  }
  return d;
}

/** Deterministic PRNG (mulberry32) so a seeded cluster always looks the same. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: normally distributed samples for cluster generation. */
export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
