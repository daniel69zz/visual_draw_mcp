import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SceneStore } from "../scene/sceneStore.js";
import type { ToolConfig } from "./result.js";

export interface ToolContext {
  store: SceneStore;
  config: ToolConfig;
}

export type ToolRegistration = (server: McpServer, ctx: ToolContext) => void;
