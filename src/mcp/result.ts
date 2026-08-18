import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toErrorPayload } from "../scene/errors.js";
import { renderResolved } from "../renderer/index.js";
import { resolveScene } from "../scene/resolve.js";
import type { Scene } from "../scene/types.js";

/**
 * Uniform tool results.
 *
 * Two rules, both aimed at the model consuming this server:
 *  - success and failure have the same shape, so it never has to guess;
 *  - failures carry a code and a hint, never a stack trace.
 */

export interface ToolConfig {
  /** Public base URL, when the server is deployed. Enables `svgUrl` in results. */
  publicUrl?: string;
  /** Set false to keep the SVG markup out of structuredContent (saves tokens). */
  inlineSvg: boolean;
  /** MCP Apps UI resource attached to rendering tools. */
  widgetUri: string;
}

export function toolSuccess(
  summary: string,
  data: Record<string, unknown>,
  meta?: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: { success: true, ...data },
    ...(meta ? { _meta: meta } : {}),
  };
}

export function toolError(err: unknown): CallToolResult {
  const error = toErrorPayload(err);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${error.code}: ${error.message}${error.hint ? ` (${error.hint})` : ""}`,
      },
    ],
    structuredContent: { success: false, error },
  };
}

/** Wraps a handler so no exception can ever reach the transport unshaped. */
export async function guard(fn: () => Promise<CallToolResult> | CallToolResult): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return toolError(err);
  }
}

export interface RenderPayload extends Record<string, unknown> {
  sceneId: string;
  width: number;
  height: number;
  elementCount: number;
  format: "svg";
}

/**
 * Renders a scene and packages it the way every rendering tool returns it.
 * The text block deliberately tells the model NOT to redraw the result as
 * ASCII - that is the failure mode this whole project exists to remove.
 */
export function renderResult(scene: Scene, config: ToolConfig, note?: string): CallToolResult {
  const resolved = resolveScene(scene);
  const svg = renderResolved(resolved, { idSeed: resolved.id });

  const payload: RenderPayload = {
    sceneId: resolved.id,
    width: resolved.width,
    height: resolved.height,
    elementCount: scene.elements?.length ?? 0,
    format: "svg",
    ...(resolved.title ? { title: resolved.title } : {}),
    ...(config.publicUrl ? { svgUrl: `${config.publicUrl.replace(/\/$/, "")}/scenes/${resolved.id}.svg` } : {}),
    ...(config.inlineSvg ? { svg } : {}),
  };

  const summary =
    `Rendered scene '${resolved.id}'${resolved.title ? ` ("${resolved.title}")` : ""}: ` +
    `${resolved.width}x${resolved.height}, ${payload.elementCount} elements. ` +
    `The diagram is shown to the user as a picture - describe or explain it in words if useful, ` +
    `but do NOT reproduce it as ASCII art or as an SVG code block. ` +
    `To change it, call update_element / add_element with sceneId '${resolved.id}' instead of rendering a new scene.` +
    (note ? ` ${note}` : "") +
    (resolved.warnings.length ? ` Warnings: ${resolved.warnings.join("; ")}.` : "");

  return {
    content: [{ type: "text", text: summary }],
    structuredContent: { success: true, ...payload },
    _meta: {
      // MCP Apps standard, plus the ChatGPT compatibility alias.
      ui: { resourceUri: config.widgetUri },
      "openai/outputTemplate": config.widgetUri,
    },
  };
}
