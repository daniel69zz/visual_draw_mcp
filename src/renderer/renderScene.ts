import { resolveScene, type ResolvedScene } from "../scene/resolve.js";
import type { Scene } from "../scene/types.js";
import { Defs, idPrefix } from "./defs.js";
import { renderElement, type RenderContext } from "./renderElement.js";
import { serialize, type SerializeOptions } from "./serialize.js";
import { node, type SvgNode } from "./svgNode.js";

export interface RenderOptions extends SerializeOptions {
  /**
   * Prefix for generated ids (arrowhead markers, filters). Set it when several
   * scenes share one HTML document so the definitions cannot collide.
   */
  idSeed?: string;
}

/** Builds the SvgNode document for an already-resolved scene. */
export function buildSvgTree(resolved: ResolvedScene, options: RenderOptions = {}): SvgNode {
  const defs = new Defs(idPrefix(options.idSeed ?? resolved.id));
  const ctx: RenderContext = { theme: resolved.theme, defs };

  // Elements are rendered first so `defs` learns which markers are needed.
  const body: SvgNode[] = [];
  for (const element of resolved.elements) {
    body.push(...renderElement(element, ctx));
  }

  const { viewBox } = resolved;
  const children: SvgNode[] = [];
  const defsNode = defs.build(resolved.theme.shadow);
  if (defsNode) children.push(defsNode);

  children.push(
    node("rect", {
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height,
      fill: resolved.background,
    }),
  );

  if (resolved.title) children.unshift(node("title", {}, undefined, resolved.title));
  children.push(...body);

  return node(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: resolved.width,
      height: resolved.height,
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      "shape-rendering": "geometricPrecision",
      "text-rendering": "optimizeLegibility",
      role: "img",
      "aria-label": resolved.title ?? "Diagram",
    },
    children,
  );
}

/**
 * Scene -> SVG string. This is what the MCP tools return.
 * Pure function, no DOM, safe to call in a server.
 */
export function renderScene(scene: Scene, options: RenderOptions = {}): string {
  return renderResolved(resolveScene(scene), options);
}

export function renderResolved(resolved: ResolvedScene, options: RenderOptions = {}): string {
  return serialize(buildSvgTree(resolved, options), options);
}

export type { ResolvedScene };
