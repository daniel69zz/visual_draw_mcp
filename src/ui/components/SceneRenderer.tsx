import { createElement, useMemo, type ReactElement } from "react";
import { buildSvgTree } from "../../renderer/renderScene.js";
import { resolveScene } from "../../scene/resolve.js";
import type { SvgNode } from "../../renderer/svgNode.js";
import type { Scene } from "../../scene/types.js";

/**
 * React backend of the renderer.
 *
 * It consumes the same SvgNode tree the string serialiser does, so the browser
 * and the server draw byte-for-byte the same picture from one geometry
 * pipeline. Nodes become React elements one at a time - there is no
 * `dangerouslySetInnerHTML` anywhere in this project, so nothing derived from
 * model input is ever parsed as markup in the app.
 */

/** SVG attributes React expects in camelCase. */
const REACT_ATTR: Record<string, string> = {
  "stroke-width": "strokeWidth",
  "stroke-dasharray": "strokeDasharray",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-opacity": "fillOpacity",
  "fill-rule": "fillRule",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  "font-style": "fontStyle",
  "text-anchor": "textAnchor",
  "dominant-baseline": "dominantBaseline",
  "marker-start": "markerStart",
  "marker-end": "markerEnd",
  "clip-path": "clipPath",
  "flood-color": "floodColor",
  "flood-opacity": "floodOpacity",
  "stop-color": "stopColor",
  "stop-opacity": "stopOpacity",
  "shape-rendering": "shapeRendering",
  "text-rendering": "textRendering",
  "aria-label": "aria-label",
  "data-element-id": "data-element-id",
  class: "className",
};

function toReact(node: SvgNode, key: string): ReactElement {
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) {
    props[REACT_ATTR[name] ?? name] = value;
  }
  const children = node.children?.map((child, i) => toReact(child, `${key}.${i}`));
  if (children && children.length > 0) return createElement(node.tag, props, children);
  if (node.text !== undefined) return createElement(node.tag, props, node.text);
  return createElement(node.tag, props);
}

export interface SceneRendererProps {
  scene: Scene;
  /** Overrides the width/height attributes; the viewBox is untouched. */
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function SceneRenderer({ scene, width, height, className }: SceneRendererProps): ReactElement {
  const tree = useMemo(() => buildSvgTree(resolveScene(scene), { idSeed: scene.id ?? "ui" }), [scene]);
  const root: SvgNode = {
    ...tree,
    attrs: {
      ...tree.attrs,
      ...(width !== undefined ? { width: width as string | number } : {}),
      ...(height !== undefined ? { height: height as string | number } : {}),
    },
  };
  const element = toReact(root, "svg");
  return className
    ? createElement(element.type, { ...(element.props as object), className, key: "svg" })
    : element;
}

/** Resolved geometry of a scene, for callers that need the size before rendering. */
export function useSceneSize(scene: Scene): { width: number; height: number } {
  return useMemo(() => {
    const resolved = resolveScene(scene);
    return { width: resolved.width, height: resolved.height };
  }, [scene]);
}
