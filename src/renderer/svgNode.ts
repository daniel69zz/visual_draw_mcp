/**
 * SvgNode: a tiny, closed representation of an SVG document.
 *
 * Why an intermediate tree instead of building strings?
 *
 * 1. Security. Tags and attribute names are checked against allow-lists here,
 *    once, for every output format. Nothing the model sends can become a tag,
 *    an attribute name, an event handler or a `<script>`.
 * 2. Two backends, one geometry pipeline. `toSvgString()` serialises for the
 *    MCP tools; `<SvgNodeView>` maps the same tree to React elements, so the
 *    interactive UI never needs `dangerouslySetInnerHTML`.
 */

export type AttrValue = string | number;

export interface SvgNode {
  tag: SvgTag;
  attrs: Record<string, AttrValue>;
  children?: SvgNode[];
  /** Character data. Always escaped on output; never parsed as markup. */
  text?: string;
}

/** The only tags this renderer can ever emit. */
export const ALLOWED_TAGS = [
  "svg",
  "g",
  "defs",
  "marker",
  "filter",
  "feDropShadow",
  "rect",
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "text",
  "tspan",
  "title",
  "desc",
  "clipPath",
  "linearGradient",
  "stop",
] as const;

export type SvgTag = (typeof ALLOWED_TAGS)[number];

/**
 * Presentation attributes only. No `on*`, no `href`, no `style`, no `xlink:*`,
 * no `class` - so there is no vector for script, external fetches or CSS
 * injection, regardless of what the model puts in a scene.
 */
export const ALLOWED_ATTRS = new Set([
  "id",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "transform",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "dy",
  "marker-start",
  "marker-end",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "filter",
  "stdDeviation",
  "flood-color",
  "flood-opacity",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "clip-path",
  "xmlns",
  "shape-rendering",
  "text-rendering",
  "role",
  "aria-label",
  "data-element-id",
]);

const TAG_SET = new Set<string>(ALLOWED_TAGS);

export function isAllowedTag(tag: string): tag is SvgTag {
  return TAG_SET.has(tag);
}

export function node(
  tag: SvgTag,
  attrs: Record<string, AttrValue | undefined>,
  children?: SvgNode[],
  text?: string,
): SvgNode {
  const clean: Record<string, AttrValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (!ALLOWED_ATTRS.has(key)) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    clean[key] = value;
  }
  const result: SvgNode = { tag, attrs: clean };
  if (children && children.length > 0) result.children = children;
  if (text !== undefined) result.text = text;
  return result;
}
