/**
 * Visual MCP - public API.
 *
 * The renderer and the scene model are exported independently of the MCP layer
 * on purpose: you can use them as a plain library ("scene in, SVG out") with no
 * MCP involved at all.
 */

export { renderScene, renderResolved, buildSvgTree, type RenderOptions } from "./renderer/index.js";
export { serialize, escapeText, escapeAttr } from "./renderer/serialize.js";
export { node, ALLOWED_TAGS, ALLOWED_ATTRS, type SvgNode } from "./renderer/svgNode.js";

export { resolveScene, primitiveBox, type ResolvedScene } from "./scene/resolve.js";
export { parseScene, parseElement, validateScene, checkReferences, collectIds } from "./scene/validate.js";
export {
  addElement,
  updateElement,
  removeElement,
  groupElements,
  clearScene,
  findElement,
  cloneScene,
} from "./scene/mutations.js";
export { InMemorySceneStore, type SceneStore, type SceneSummary } from "./scene/sceneStore.js";
export { THEMES, resolveTheme, color, seriesColor, type Theme } from "./scene/theme.js";
export { VisualError, visualError, ERROR_CODES, type ErrorCode, type Result } from "./scene/errors.js";

export { SceneSchema, SceneBodySchema, SceneInitSchema } from "./scene/schemas/scene.js";
export { VisualElementSchema, ELEMENT_TYPES, isKnownElementType } from "./scene/schemas/element.js";
export * from "./scene/types.js";

export { computeLayout } from "./layout/index.js";
export { expandElement, EXPANDERS } from "./semantic/registry.js";
export type { ResolveContext, Expander, AxisFrame } from "./semantic/context.js";

export { createVisualMcpServer, SERVER_NAME, SERVER_VERSION } from "./mcp/server.js";
export { WIDGET_HTML, WIDGET_URI, WIDGET_MIME } from "./mcp/widget.js";

export { EXAMPLES, type ExampleName } from "./examples/index.js";
