import { z } from "zod";
import type { ToolRegistration } from "../context.js";
import { guard, renderResult } from "../result.js";
import { baseOutput, sceneIdField } from "./shared.js";

export const registerRenderScene: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "render_scene",
    {
      title: "Render an existing scene",
      description: [
        "Render a stored scene and show it to the user.",
        "",
        "USE THIS after a batch of add_element / update_element / remove_element / group_elements",
        "calls, to display the updated diagram. It is the last step of every edit.",
        "",
        "This never changes the scene - it only draws what is currently in it. For a brand new",
        "diagram use render_diagram instead, which builds and shows it in one call.",
      ].join("\n"),
      inputSchema: { sceneId: sceneIdField },
      outputSchema: {
        ...baseOutput,
        title: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        elementCount: z.number().optional(),
        format: z.literal("svg").optional(),
        svg: z.string().optional().describe("The rendered SVG markup."),
        svgUrl: z.string().optional().describe("Stable link to the rendered SVG, when deployed."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ sceneId }) => guard(() => renderResult(ctx.store.require(sceneId), ctx.config)),
  );
};
