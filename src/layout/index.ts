import { unionAll, type Vec } from "../scene/geometry.js";
import type {
  BoundingBox,
  ConnectionElement,
  Direction,
  ElementBox,
  GroupElement,
  Scene,
  VisualElement,
} from "../scene/types.js";
import { nodeBox } from "../semantic/node.js";
import { intrinsicSize, isFlowElement, isNodeLike, staticBox } from "./measure.js";
import { runFlowLayout, type FlowEdge, type FlowItem } from "./flow.js";

export const GROUP_HEADER = 26;
export const DEFAULT_GAP = 90;
export const DEFAULT_PADDING = 48;

export interface LayoutResult {
  boxes: Map<string, ElementBox>;
  contentBox: BoundingBox;
}

/**
 * Turns a Scene into a map of absolute boxes: one per element that has a
 * shape. Everything downstream - connection anchoring, auto-fit, group frames,
 * hit-testing in the UI - reads this map instead of re-deriving geometry.
 */
export function computeLayout(scene: Scene): LayoutResult {
  const elements = scene.elements ?? [];
  const boxes = new Map<string, ElementBox>();
  const gap = scene.gap ?? DEFAULT_GAP;
  const padding = scene.padding ?? DEFAULT_PADDING;

  layoutLevel(elements, boxes, {
    layout: scene.layout ?? "auto",
    direction: scene.direction ?? "right",
    gap,
    originX: padding,
    originY: padding,
  });

  const all = [...boxes.values()];
  const contentBox = unionAll(all) ?? { x: 0, y: 0, width: scene.width ?? 960, height: scene.height ?? 600 };
  return { boxes, contentBox };
}

interface LevelOptions {
  layout: Scene["layout"] | GroupElement["layout"];
  direction: Direction;
  gap: number;
  columns?: number;
  originX: number;
  originY: number;
}

/**
 * Lays out one container (the scene or a group) and writes absolute boxes.
 * Returns the block that was produced, so a parent can size its frame.
 */
function layoutLevel(
  elements: VisualElement[],
  boxes: Map<string, ElementBox>,
  options: LevelOptions,
): BoundingBox {
  const produced: BoundingBox[] = [];

  // 1. Elements whose position is always explicit are placed as-is.
  for (const element of elements) {
    if (isFlowElement(element)) continue;
    const b = staticBox(element);
    if (!b) continue;
    const box = toElementBox(element.id, b, element.type);
    boxes.set(element.id, box);
    produced.push(box);
  }

  // 2. Groups are sized bottom-up: children first, then the frame around them.
  const groupChildren = new Map<string, Map<string, ElementBox>>();
  const groupSizes = new Map<string, { width: number; height: number; manual: boolean; at?: Vec }>();

  for (const element of elements) {
    if (element.type !== "group") continue;
    const group = element as GroupElement;
    const inner = new Map<string, ElementBox>();
    const layout = group.layout ?? "manual";
    const pad = group.padding ?? 28;
    const header = group.label ? GROUP_HEADER : 0;

    const block = layoutLevel(group.children ?? [], inner, {
      layout,
      direction: options.direction,
      gap: group.gap ?? 40,
      ...(group.columns !== undefined ? { columns: group.columns } : {}),
      originX: 0,
      originY: 0,
    });

    if (layout === "manual") {
      // Children carry absolute coordinates: the frame simply wraps them.
      groupChildren.set(group.id, inner);
      groupSizes.set(group.id, {
        width: block.width + pad * 2,
        height: block.height + pad * 2 + header,
        manual: true,
        at: { x: block.x - pad, y: block.y - pad - header },
      });
    } else {
      groupChildren.set(group.id, inner);
      groupSizes.set(group.id, {
        width: block.width + pad * 2,
        height: block.height + pad * 2 + header,
        manual: false,
      });
    }
  }

  // 3. Flow items: node-likes and groups.
  const items: FlowItem[] = [];
  for (const element of elements) {
    if (!isFlowElement(element)) continue;

    if (element.type === "group") {
      const size = groupSizes.get(element.id)!;
      const pinned = size.manual || (element.x !== undefined && element.y !== undefined);
      const topLeft = size.manual
        ? size.at!
        : { x: element.x ?? 0, y: element.y ?? 0 };
      items.push({
        id: element.id,
        width: size.width,
        height: size.height,
        pinned,
        cx: topLeft.x + size.width / 2,
        cy: topLeft.y + size.height / 2,
      });
      continue;
    }

    const size = intrinsicSize(element);
    const pinned = element.x !== undefined && element.y !== undefined;
    items.push({
      id: element.id,
      width: size.width,
      height: size.height,
      pinned,
      cx: element.x ?? 0,
      cy: element.y ?? 0,
    });
  }

  if (items.length > 0) {
    runFlowLayout(items, collectEdges(elements, items), {
      layout: options.layout ?? "auto",
      direction: options.direction,
      gap: options.gap,
      ...(options.columns !== undefined ? { columns: options.columns } : {}),
      originX: options.originX,
      originY: options.originY,
    });
  }

  // 4. Write the resulting boxes, translating group children into place.
  const byId = new Map(elements.map((e) => [e.id, e]));
  for (const item of items) {
    const element = byId.get(item.id)!;
    if (element.type === "group") {
      const group = element as GroupElement;
      const size = groupSizes.get(group.id)!;
      const box: ElementBox = {
        id: group.id,
        x: item.cx - size.width / 2,
        y: item.cy - size.height / 2,
        width: size.width,
        height: size.height,
        cx: item.cx,
        cy: item.cy,
        shape: "rect",
        radius: 16,
      };
      boxes.set(group.id, box);
      produced.push(box);

      const pad = group.padding ?? 28;
      const header = group.label ? GROUP_HEADER : 0;
      const inner = groupChildren.get(group.id)!;
      const dx = size.manual ? box.x - size.at!.x : box.x + pad;
      const dy = size.manual ? box.y - size.at!.y : box.y + pad + header;
      for (const [id, child] of inner) {
        boxes.set(id, translate(child, dx, dy));
      }
      continue;
    }

    const box = nodeBox(element as never, item.cx, item.cy);
    boxes.set(element.id, box);
    produced.push(box);
  }

  return unionAll(produced) ?? { x: options.originX, y: options.originY, width: 0, height: 0 };
}

function translate(box: ElementBox, dx: number, dy: number): ElementBox {
  return { ...box, x: box.x + dx, y: box.y + dy, cx: box.cx + dx, cy: box.cy + dy };
}

/**
 * Connections define the flow graph. Edges that reach inside a group are
 * lifted to that group, so a link into a boxed subsystem still orders the
 * layout at this level.
 */
function collectEdges(elements: VisualElement[], items: FlowItem[]): FlowEdge[] {
  const owner = new Map<string, string>();
  for (const element of elements) {
    owner.set(element.id, element.id);
    if (element.type === "group") {
      for (const descendant of descendantIds(element as GroupElement)) {
        owner.set(descendant, element.id);
      }
    }
  }
  const known = new Set(items.map((i) => i.id));
  const edges: FlowEdge[] = [];
  for (const element of walk(elements)) {
    if (element.type !== "connection") continue;
    const conn = element as ConnectionElement;
    const from = owner.get(conn.from);
    const to = owner.get(conn.to);
    if (from && to && from !== to && known.has(from) && known.has(to)) {
      edges.push({ from, to });
    }
  }
  return edges;
}

function* walk(elements: VisualElement[]): Generator<VisualElement> {
  for (const element of elements) {
    yield element;
    if (element.type === "group") yield* walk((element as GroupElement).children ?? []);
  }
}

function* descendantIds(group: GroupElement): Generator<string> {
  for (const child of group.children ?? []) {
    yield child.id;
    if (child.type === "group") yield* descendantIds(child as GroupElement);
  }
}

function toElementBox(id: string, b: BoundingBox, type: string): ElementBox {
  return {
    id,
    ...b,
    cx: b.x + b.width / 2,
    cy: b.y + b.height / 2,
    shape: type === "circle" || type === "ellipse" || type === "point" ? "ellipse" : "rect",
  };
}

export { isFlowElement, isNodeLike, intrinsicSize, staticBox };
