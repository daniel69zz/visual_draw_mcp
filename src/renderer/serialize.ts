import { isAllowedTag, type AttrValue, type SvgNode } from "./svgNode.js";

/** XML escaping for character data. */
export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** XML escaping for attribute values (quotes included). */
export function escapeAttr(value: AttrValue): string {
  if (typeof value === "number") return String(value);
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SELF_CLOSING = new Set([
  "rect",
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "stop",
  "feDropShadow",
]);

export interface SerializeOptions {
  /** Pretty-print with newlines and indentation. Off by default (smaller payloads). */
  pretty?: boolean;
}

export function serializeNode(n: SvgNode, options: SerializeOptions = {}, depth = 0): string {
  if (!isAllowedTag(n.tag)) return "";
  const pad = options.pretty ? "  ".repeat(depth) : "";
  const nl = options.pretty ? "\n" : "";

  const attrs = Object.entries(n.attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");

  const hasChildren = (n.children?.length ?? 0) > 0;
  const hasText = n.text !== undefined && n.text !== "";

  if (!hasChildren && !hasText && SELF_CLOSING.has(n.tag)) {
    return `${pad}<${n.tag}${attrs} />${nl}`;
  }

  const inner = hasChildren
    ? nl + n.children!.map((c) => serializeNode(c, options, depth + 1)).join("") + pad
    : hasText
      ? escapeText(n.text!)
      : "";

  return `${pad}<${n.tag}${attrs}>${inner}</${n.tag}>${nl}`;
}

export function serialize(root: SvgNode, options: SerializeOptions = {}): string {
  return serializeNode(root, options).trimEnd();
}
