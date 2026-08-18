import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemorySceneStore, type SceneStore } from "../scene/sceneStore.js";
import type { ToolContext } from "./context.js";
import type { ToolConfig } from "./result.js";
import { WIDGET_HTML, WIDGET_MIME, WIDGET_URI } from "./widget.js";
import { registerRenderDiagram } from "./tools/renderDiagram.js";
import { registerCreateScene } from "./tools/createScene.js";
import { registerRenderScene } from "./tools/renderScene.js";
import { registerAddElement } from "./tools/addElement.js";
import { registerUpdateElement } from "./tools/updateElement.js";
import { registerRemoveElement } from "./tools/removeElement.js";
import { registerGroupElements } from "./tools/groupElements.js";
import { registerClearScene } from "./tools/clearScene.js";
import { registerGetScene } from "./tools/getScene.js";
import { registerListExamples } from "./tools/listExamples.js";

export const SERVER_NAME = "visual-mcp";
export const SERVER_VERSION = "0.1.0";

/**
 * Server-wide guidance. The host shows the first few hundred characters to the
 * model, so the most important instruction - stop drawing ASCII - comes first.
 */
const INSTRUCTIONS = [
  "Visual MCP turns descriptions of spatial ideas into clean SVG diagrams.",
  "Whenever the user asks to draw, visualise, diagram, illustrate, sketch, map out or explain",
  "something visually, call render_diagram instead of producing ASCII art, box-drawing",
  "characters or hand-written SVG. Describe WHAT exists (ids, labels, connections) and let the",
  "server do the geometry: sizes, positions, border-to-border links, arrowheads and text layout",
  "are all computed for you.",
  "",
  "Typical flow: render_diagram once, then keep the returned sceneId and answer follow-up",
  "requests with get_scene + update_element / add_element / remove_element / group_elements,",
  "finishing with render_scene. Never rebuild a whole diagram to change one part of it.",
  "",
  "If you are unsure how to express something, call list_examples and adapt the closest scene.",
].join(" ");

export interface CreateServerOptions {
  /** Shared across requests in stateless HTTP mode, so scenes survive edits. */
  store?: SceneStore;
  /** Public base URL of the deployment; adds `svgUrl` to render results. */
  publicUrl?: string;
  /** Include the SVG markup in structuredContent. Default true. */
  inlineSvg?: boolean;
}

export function createVisualMcpServer(options: CreateServerOptions = {}): McpServer {
  const store = options.store ?? new InMemorySceneStore();
  const config: ToolConfig = {
    ...(options.publicUrl ? { publicUrl: options.publicUrl } : {}),
    inlineSvg: options.inlineSvg ?? true,
    widgetUri: WIDGET_URI,
  };
  const ctx: ToolContext = { store, config };

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  // The interactive viewer, attached to every rendering tool via _meta.ui.
  server.registerResource(
    "scene-viewer",
    WIDGET_URI,
    {
      title: "Diagram viewer",
      description: "Interactive SVG viewer with zoom, pan, fit and export.",
      mimeType: WIDGET_MIME,
      _meta: {
        ui: {
          prefersBorder: false,
          // The viewer is fully self-contained: no network access is needed.
          csp: { connectDomains: [], resourceDomains: [] },
        },
      },
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: WIDGET_MIME, text: WIDGET_HTML }],
    }),
  );

  registerRenderDiagram(server, ctx);
  registerRenderScene(server, ctx);
  registerGetScene(server, ctx);
  registerAddElement(server, ctx);
  registerUpdateElement(server, ctx);
  registerRemoveElement(server, ctx);
  registerGroupElements(server, ctx);
  registerCreateScene(server, ctx);
  registerClearScene(server, ctx);
  registerListExamples(server, ctx);

  return server;
}
