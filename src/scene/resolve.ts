import { computeLayout, DEFAULT_PADDING } from "../layout/index.js";
import { staticBox } from "../layout/measure.js";
import { makeFrame } from "../semantic/axis.js";
import { layerOf, type AxisFrame, type LegendEntry, type ResolveContext } from "../semantic/context.js";
import { marker } from "../semantic/markers.js";
import { expandElement } from "../semantic/registry.js";
import { boxFromPoints, expandBox, round, unionAll } from "./geometry.js";
import { resolveTheme, seriesColor, type Theme } from "./theme.js";
import type {
  BoundingBox,
  ElementBox,
  GroupElement,
  PrimitiveElement,
  Scene,
  VisualElement,
} from "./types.js";
import { layoutText } from "../utils/text.js";

/**
 * The resolve pipeline - the boundary between "what the model said" and
 * "what gets drawn":
 *
 *   Scene ──▶ layout (positions & boxes)
 *         ──▶ expand (semantic elements ▸ primitives)
 *         ──▶ auto-fit (viewBox that cannot clip)
 *         ──▶ ResolvedScene
 *
 * The renderer downstream is deliberately dumb: it only knows primitives.
 */

export interface ResolvedScene {
  id: string;
  title?: string;
  subtitle?: string;
  theme: Theme;
  background: string;
  /** Pixel size of the produced <svg>. */
  width: number;
  height: number;
  viewBox: BoundingBox;
  /** Flat list of primitives in final draw order. */
  elements: PrimitiveElement[];
  /** Post-layout geometry of every addressable element, for the UI and tooling. */
  boxes: Map<string, ElementBox>;
  warnings: string[];
}

export function resolveScene(scene: Scene): ResolvedScene {
  const theme = resolveTheme(scene.theme, scene.themeOverrides);
  const { boxes } = computeLayout(scene);
  const elements = scene.elements ?? [];

  const frames = new Map<string, AxisFrame>();
  for (const element of walkAll(elements)) {
    if (element.type === "axis") frames.set(element.id, makeFrame(element));
  }

  const legend: LegendEntry[] = [];
  const warnings: string[] = [];
  let seriesCursor = 0;

  const ctx: ResolveContext = {
    scene,
    theme,
    boxes,
    frames,
    legend,
    warnings,
    nextSeriesColor: () => seriesColor(theme, seriesCursor++),
    derivedId: (ownerId, suffix) => `${ownerId}::${suffix}`,
  };

  // Stable layered ordering: a connection can never cover the node it links.
  const ordered = [...walkAll(elements)]
    .map((element, index) => ({ element, index, layer: layerOf(element.type) }))
    .sort((a, b) => a.layer - b.layer || a.index - b.index);

  const primitives: PrimitiveElement[] = [];
  for (const { element } of ordered) {
    primitives.push(...expandElement(element, ctx));
  }

  const padding = scene.padding ?? DEFAULT_PADDING;
  let contentBox =
    unionAll(primitives.map(primitiveBox).filter((b): b is BoundingBox => b !== null)) ??
    { x: 0, y: 0, width: scene.width ?? 960, height: scene.height ?? 600 };

  // Legend and title are laid out against the finished drawing.
  if ((scene.legend ?? true) && legend.length >= 2) {
    const block = renderLegend(legend, contentBox, theme);
    primitives.push(...block.elements);
    contentBox = unionAll([contentBox, block.box])!;
  }

  if (scene.title || scene.subtitle) {
    const block = renderTitle(scene, contentBox, theme);
    primitives.unshift(...block.elements);
    contentBox = unionAll([contentBox, block.box])!;
  }

  const autoFit = scene.autoFit ?? true;
  const viewBox = autoFit
    ? normalise(expandBox(contentBox, padding))
    : { x: 0, y: 0, width: scene.width ?? 960, height: scene.height ?? 600 };

  return {
    id: scene.id ?? "scene",
    ...(scene.title ? { title: scene.title } : {}),
    ...(scene.subtitle ? { subtitle: scene.subtitle } : {}),
    theme,
    background: scene.background
      ? resolveBackground(scene.background, theme)
      : theme.background,
    width: round(viewBox.width),
    height: round(viewBox.height),
    viewBox,
    elements: primitives,
    boxes,
    warnings,
  };
}

function resolveBackground(value: string, theme: Theme): string {
  const tokens: Record<string, string> = {
    background: theme.background,
    surface: theme.surface,
    foreground: theme.foreground,
  };
  return tokens[value] ?? value;
}

function normalise(b: BoundingBox): BoundingBox {
  return {
    x: round(b.x),
    y: round(b.y),
    width: round(Math.max(1, b.width)),
    height: round(Math.max(1, b.height)),
  };
}

export function* walkAll(elements: VisualElement[]): Generator<VisualElement> {
  for (const element of elements) {
    yield element;
    if (element.type === "group") yield* walkAll((element as GroupElement).children ?? []);
  }
}

/** Bounding box of a rendered primitive; used for auto-fit and the UI. */
export function primitiveBox(element: PrimitiveElement): BoundingBox | null {
  if (element.type === "path") return pathBox(element.d);
  const b = staticBox(element as VisualElement);
  if (!b) return null;
  // Strokes and arrowheads stick out a little.
  const pad = "strokeWidth" in element && typeof element.strokeWidth === "number" ? element.strokeWidth : 2;
  return expandBox(b, Math.max(2, pad));
}

/** Approximate box of a path from the coordinates in its data string. */
function pathBox(d: string): BoundingBox | null {
  const numbers = d.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: Number(numbers[i]), y: Number(numbers[i + 1]) });
  }
  return boxFromPoints(points);
}

function renderTitle(
  scene: Scene,
  content: BoundingBox,
  theme: Theme,
): { elements: PrimitiveElement[]; box: BoundingBox } {
  const elements: PrimitiveElement[] = [];
  const titleSize = 20;
  const subSize = 13;
  const titleH = scene.title ? layoutText(scene.title, { fontSize: titleSize, bold: true }).height : 0;
  const subH = scene.subtitle ? layoutText(scene.subtitle, { fontSize: subSize }).height : 0;
  const blockH = titleH + (subH ? subH + 6 : 0);
  const top = content.y - 34 - blockH;
  let cursor = top;

  if (scene.title) {
    elements.push({
      id: "scene::title",
      type: "text",
      x: content.x,
      y: cursor + titleH / 2,
      text: scene.title,
      fontSize: titleSize,
      fontWeight: 700,
      color: theme.foreground,
      align: "start",
      baseline: "middle",
    });
    cursor += titleH + 6;
  }
  if (scene.subtitle) {
    elements.push({
      id: "scene::subtitle",
      type: "text",
      x: content.x,
      y: cursor + subH / 2,
      text: scene.subtitle,
      fontSize: subSize,
      color: theme.muted,
      align: "start",
      baseline: "middle",
    });
  }

  const width = Math.max(
    scene.title ? layoutText(scene.title, { fontSize: titleSize, bold: true }).width : 0,
    scene.subtitle ? layoutText(scene.subtitle, { fontSize: subSize }).width : 0,
  );
  return { elements, box: { x: content.x, y: top, width, height: blockH } };
}

function renderLegend(
  entries: LegendEntry[],
  content: BoundingBox,
  theme: Theme,
): { elements: PrimitiveElement[]; box: BoundingBox } {
  const rowH = 22;
  const swatch = 5;
  const gap = 26;
  const x = content.x + content.width + gap;
  const y = content.y;
  const elements: PrimitiveElement[] = [];
  let width = 0;

  entries.forEach((entry, i) => {
    const cy = y + rowH * i + rowH / 2;
    elements.push(
      ...marker(`legend::${i}`, { x: x + swatch, y: cy }, swatch, entry.shape as never, entry.color),
    );
    const text = layoutText(entry.label, { fontSize: 12 });
    width = Math.max(width, swatch * 2 + 10 + text.width);
    elements.push({
      id: `legend::${i}::label`,
      type: "text",
      x: x + swatch * 2 + 10,
      y: cy,
      text: entry.label,
      fontSize: 12,
      color: theme.foreground,
      align: "start",
      baseline: "middle",
    });
  });

  return { elements, box: { x, y, width, height: rowH * entries.length } };
}
