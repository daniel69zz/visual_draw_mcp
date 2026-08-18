import { clearScene } from "../../scene/mutations.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";
import { baseOutput, sceneIdField } from "./shared.js";

export const registerClearScene: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "clear_scene",
    {
      title: "Empty a scene",
      description: [
        "Remove every element from a scene while keeping its id, canvas, theme and title.",
        "",
        'USE THIS when the user wants to restart the drawing but keep talking about the same',
        'diagram: "scrap that, let\'s do it differently".',
        "",
        "DO NOT use it for corrections - update_element and remove_element exist for that, and",
        "they preserve everything the user already approved.",
      ].join("\n"),
      inputSchema: { sceneId: sceneIdField },
      outputSchema: baseOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ sceneId }) =>
      guard(() => {
        const scene = ctx.store.require(sceneId);
        const before = scene.elements.length;
        clearScene(scene);
        ctx.store.save(scene);
        ctx.store.record(sceneId, {
          type: "clear",
          timestamp: Date.now(),
          summary: `cleared ${before} elements`,
        });
        return toolSuccess(
          `Cleared scene '${sceneId}': ${before} element(s) removed. The canvas, theme and title are unchanged.`,
          { sceneId },
        );
      }),
  );
};
