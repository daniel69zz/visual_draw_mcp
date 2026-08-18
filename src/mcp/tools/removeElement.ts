import { z } from "zod";
import { removeElement } from "../../scene/mutations.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";
import { baseOutput, elementIdField, sceneIdField } from "./shared.js";

export const registerRemoveElement: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "remove_element",
    {
      title: "Remove an element",
      description: [
        "Delete one element from a scene.",
        "",
        'USE THIS for "remove the cache", "delete that arrow", "drop the second database".',
        "",
        "Connections pointing at the element, and labels attached to it, are deleted with it by",
        "default - otherwise the scene would keep dangling references. Set `cascade` to false only",
        "if you plan to repair those references yourself in the same turn.",
        "",
        "Removing a 'group' also removes everything inside it. To keep the children, update the",
        "group instead and set `frame` to false.",
      ].join("\n"),
      inputSchema: {
        sceneId: sceneIdField,
        elementId: elementIdField.describe("Id of the element to remove."),
        cascade: z
          .boolean()
          .optional()
          .describe("Also remove connections and labels attached to it. Default true."),
      },
      outputSchema: {
        ...baseOutput,
        removed: z.array(z.string()).optional().describe("Every id that was deleted, including cascaded ones."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ sceneId, elementId, cascade }) =>
      guard(() => {
        const scene = ctx.store.require(sceneId);
        const removed = removeElement(scene, elementId, cascade ?? true);
        ctx.store.save(scene);
        ctx.store.record(sceneId, {
          type: "remove",
          elementId,
          timestamp: Date.now(),
          summary: `removed ${removed.join(", ")}`,
        });
        return toolSuccess(
          `Removed ${removed.length} element(s) from '${sceneId}': ${removed.join(", ")}. Call render_scene to show the result.`,
          { sceneId, removed },
        );
      }),
  );
};
