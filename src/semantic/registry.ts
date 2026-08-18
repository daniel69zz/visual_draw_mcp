import type { PrimitiveElement, VisualElement } from "../scene/types.js";
import type { Expander, ResolveContext } from "./context.js";
import { expandNode } from "./node.js";
import { expandConnection } from "./connection.js";
import { expandAxis } from "./axis.js";
import { expandCluster, expandPlotLine, expandPoint, expandScatter } from "./markers.js";
import { expandLabel } from "./label.js";
import { expandGroup } from "./group.js";
import { expandPrimitive } from "./primitives.js";

/**
 * The extension point of the whole system.
 *
 * Adding `neuron`, `decisionTree`, `functionPlot` or a 3D `sphere` later means
 * writing one expander and registering it here - the schema union, the layout
 * engine and the renderer do not change.
 */
const EXPANDERS: Record<string, Expander<never>> = {
  node: expandNode as Expander<never>,
  server: expandNode as Expander<never>,
  database: expandNode as Expander<never>,
  router: expandNode as Expander<never>,
  switch: expandNode as Expander<never>,
  computer: expandNode as Expander<never>,
  cloud: expandNode as Expander<never>,
  connection: expandConnection as Expander<never>,
  axis: expandAxis as Expander<never>,
  point: expandPoint as Expander<never>,
  scatter: expandScatter as Expander<never>,
  cluster: expandCluster as Expander<never>,
  plotLine: expandPlotLine as Expander<never>,
  label: expandLabel as Expander<never>,
  group: expandGroup as Expander<never>,
};

export function expandElement(element: VisualElement, ctx: ResolveContext): PrimitiveElement[] {
  const expander = EXPANDERS[element.type];
  if (expander) return (expander as Expander)(element, ctx);
  return expandPrimitive(element, ctx);
}

export function isSemantic(type: string): boolean {
  return type in EXPANDERS && type !== "group";
}

export { EXPANDERS };
