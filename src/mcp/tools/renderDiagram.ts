import { z } from "zod";
import { SceneBodySchema } from "../../scene/schemas/scene.js";
import { parseScene } from "../../scene/validate.js";
import type { ToolRegistration } from "../context.js";
import { guard, renderResult } from "../result.js";

/**
 * The flagship tool: one call, one finished picture.
 *
 * Everything else in this server exists to edit what this tool produced.
 */
export const registerRenderDiagram: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "render_diagram",
    {
      title: "Render a diagram",
      description: [
        "Create and render a structured visual diagram as SVG, in a single call.",
        "",
        "USE THIS whenever the user asks to draw, sketch, visualise, diagram, illustrate, map out,",
        "show graphically, explain visually, or represent something spatially: architectures,",
        "network topologies, flows, pipelines, data structures, algorithms, state machines,",
        "relationships, plots, distributions, classifiers, or any concept where position and",
        "connection carry meaning.",
        "",
        "ALWAYS PREFER THIS OVER ASCII ART, box-drawing characters, Markdown tables used as",
        "layout, or hand-written SVG/Mermaid. Those are unreliable and hard to read; this tool",
        "produces a precise, styled picture and the user sees it directly.",
        "",
        "HOW TO USE IT WELL:",
        "- Describe WHAT exists, not WHERE it goes. Give elements ids and labels and omit x/y:",
        "  the layout engine positions them from the connections. Only set x/y when the user asks",
        "  for a specific arrangement, or for plots built on an `axis`.",
        "- Link things with `{ type: 'connection', from: '<id>', to: '<id>' }`. Never compute",
        "  x1/y1/x2/y2 for a link between elements, and never draw arrowheads by hand.",
        "- Use semantic types (`node`, `database`, `server`, `router`, `switch`, `computer`,",
        "  `cloud`, `group`, `axis`, `cluster`, `scatter`, `plotLine`, `label`) before reaching",
        "  for raw primitives (`circle`, `rectangle`, `line`, `arrow`, `text`, `path`, ...).",
        "- Canvas size is optional: the drawing is auto-fitted so nothing is ever clipped.",
        "",
        "DO NOT use this tool for: plain prose answers, code, tables of numbers, or when the user",
        "explicitly asked for text only.",
        "",
        "Returns a `sceneId`. Keep it: later edits go through update_element / add_element /",
        "remove_element on that id instead of rebuilding the whole scene.",
      ].join("\n"),
      inputSchema: SceneBodySchema.shape,
      outputSchema: {
        success: z.boolean(),
        sceneId: z.string().describe("Use this id with get_scene / update_element / add_element."),
        title: z.string().optional(),
        width: z.number(),
        height: z.number(),
        elementCount: z.number(),
        format: z.literal("svg"),
        svg: z.string().optional().describe("The rendered SVG markup."),
        svgUrl: z.string().optional().describe("Direct link to the rendered SVG, when deployed."),
      },
      annotations: {
        // It stores a scene, so it is not read-only, but it touches nothing outside this server.
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) =>
      guard(() => {
        const scene = parseScene({ ...args, elements: args.elements ?? [] });
        const stored = ctx.store.create(scene);
        ctx.store.record(stored.id!, {
          type: "create",
          timestamp: Date.now(),
          summary: `render_diagram with ${stored.elements.length} elements`,
        });
        return renderResult(stored, ctx.config);
      }),
  );
};
