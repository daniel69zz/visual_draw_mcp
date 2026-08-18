import type { Direction, SceneLayout, GroupLayout } from "../scene/types.js";

/**
 * A small, dependency-free flow layout.
 *
 * It exists so the model can send `{ id: "backend", type: "node", label: "NestJS" }`
 * with no coordinates at all and still get a readable diagram. The interface
 * (`FlowItem` in, centres out) is deliberately the same shape Dagre and ELK
 * expose, so swapping in a real layout engine later is a drop-in change.
 */

export interface FlowItem {
  id: string;
  width: number;
  height: number;
  /** Set when the model gave explicit coordinates; the engine will not move it. */
  pinned: boolean;
  cx: number;
  cy: number;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowOptions {
  layout: SceneLayout | GroupLayout;
  direction: Direction;
  gap: number;
  columns?: number;
  /** Top-left corner the resulting block is aligned to. */
  originX: number;
  originY: number;
}

/**
 * Assigns `cx`/`cy` to every item. Pinned items keep their coordinates but are
 * still used to compute the structure, so a diagram stays coherent when the
 * user nudges a single node ("move Redis above the backend").
 */
export function runFlowLayout(items: FlowItem[], edges: FlowEdge[], options: FlowOptions): void {
  if (items.length === 0) return;
  const mode = resolveMode(options.layout, edges.length > 0);

  if (mode === "manual") {
    for (const item of items) {
      if (!item.pinned) {
        item.cx = options.originX + item.width / 2;
        item.cy = options.originY + item.height / 2;
      }
    }
    return;
  }

  const ranks = mode === "layered" ? rankItems(items, edges) : sequentialRanks(items, mode, options.columns);
  placeRanks(items, ranks, options, mode);
}

function resolveMode(
  layout: SceneLayout | GroupLayout,
  hasEdges: boolean,
): "layered" | "horizontal" | "vertical" | "grid" | "manual" {
  if (layout === "auto") return hasEdges ? "layered" : "horizontal";
  return layout;
}

/**
 * Longest-path layering. Cycles are broken by only relaxing an edge when it
 * strictly increases the rank, with a bounded number of passes.
 */
function rankItems(items: FlowItem[], edges: FlowEdge[]): string[][] {
  const ids = new Set(items.map((i) => i.id));
  const valid = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to);
  const rank = new Map<string, number>();
  for (const item of items) rank.set(item.id, 0);

  const passes = Math.min(items.length, 64);
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (const edge of valid) {
      const next = rank.get(edge.from)! + 1;
      if (next > rank.get(edge.to)!) {
        rank.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxRank = Math.max(0, ...rank.values());
  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  // Insertion order inside a rank keeps the picture aligned with how the model
  // described it, which is usually the order the user said things in.
  for (const item of items) ranks[rank.get(item.id)!]!.push(item.id);
  return ranks.filter((r) => r.length > 0);
}

function sequentialRanks(
  items: FlowItem[],
  mode: "horizontal" | "vertical" | "grid",
  columns?: number,
): string[][] {
  if (mode === "grid") {
    const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(items.length)));
    const rows: string[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      rows.push(items.slice(i, i + cols).map((it) => it.id));
    }
    // In a grid each rank is a row laid out across the cross axis.
    return rows;
  }
  // horizontal / vertical: one item per rank, advancing along the main axis.
  return items.map((it) => [it.id]);
}

function placeRanks(
  items: FlowItem[],
  ranks: string[][],
  options: FlowOptions,
  mode: "layered" | "horizontal" | "vertical" | "grid",
): void {
  const byId = new Map(items.map((i) => [i.id, i]));
  const direction =
    mode === "vertical" || mode === "grid"
      ? "down"
      : mode === "horizontal"
        ? "right"
        : options.direction;
  const vertical = direction === "down" || direction === "up";
  const gap = options.gap;
  const crossGap = Math.max(24, gap * 0.55);

  // Main axis: successive ranks. Cross axis: items inside a rank.
  const mainSize = (i: FlowItem) => (vertical ? i.height : i.width);
  const crossSize = (i: FlowItem) => (vertical ? i.width : i.height);

  const rankExtents = ranks.map((r) => Math.max(...r.map((id) => mainSize(byId.get(id)!))));
  const rankCross = ranks.map(
    (r) => r.reduce((sum, id) => sum + crossSize(byId.get(id)!), 0) + crossGap * (r.length - 1),
  );
  const totalCross = Math.max(...rankCross);

  let mainCursor = 0;
  const positions = new Map<string, { main: number; cross: number }>();

  ranks.forEach((rank, r) => {
    const extent = rankExtents[r]!;
    let crossCursor = (totalCross - rankCross[r]!) / 2; // centre each rank
    for (const id of rank) {
      const item = byId.get(id)!;
      positions.set(id, {
        main: mainCursor + extent / 2,
        cross: crossCursor + crossSize(item) / 2,
      });
      crossCursor += crossSize(item) + crossGap;
    }
    mainCursor += extent + gap;
  });

  const totalMain = Math.max(0, mainCursor - gap);

  for (const item of items) {
    if (item.pinned) continue;
    const pos = positions.get(item.id);
    if (!pos) continue;
    const main = direction === "left" || direction === "up" ? totalMain - pos.main : pos.main;
    if (vertical) {
      item.cx = options.originX + pos.cross;
      item.cy = options.originY + main;
    } else {
      item.cx = options.originX + main;
      item.cy = options.originY + pos.cross;
    }
  }
}
