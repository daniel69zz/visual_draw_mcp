import { z } from "zod";
import { updateElement } from "../../scene/mutations.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";
import { baseOutput, elementIdField, sceneIdField } from "./shared.js";

/**
 * The tool that makes a diagram feel alive in a conversation.
 * "Move the blue node a bit to the right" must cost one call and disturb
 * nothing else.
 */
export const registerUpdateElement: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "update_element",
    {
      title: "Update an element",
      description: [
        "Change properties of one element. Only the fields you send are touched; everything else",
        "in the scene stays exactly as it is.",
        "",
        "USE THIS for every 'change that' request: move it, resize it, recolour it, rename its",
        "label, make a link dashed, add a caption to a connection. For a relative move like",
        '"a bit to the right", read the current position with get_scene and send the new value.',
        "",
        "DO NOT call render_diagram again to change one thing. That throws away the scene id, the",
        "layout and everything the user already accepted.",
        "",
        "`id` and `type` cannot be changed - remove and re-add the element if you truly need that.",
        "Send null as a value to clear an optional property; for example { \"x\": null, \"y\": null }",
        "hands the element back to the automatic layout.",
        "",
        "Nothing is displayed until you call render_scene.",
      ].join("\n"),
      inputSchema: {
        sceneId: sceneIdField,
        elementId: elementIdField.describe("Id of the element to change."),
        changes: z
          .record(z.string(), z.unknown())
          .describe(
            'Properties to set. Examples: { "x": 420 } to move, { "label": "PostgreSQL 16" } to rename, ' +
              '{ "fill": "primary", "emphasis": "strong" } to highlight, { "dash": "dashed" } on a connection, ' +
              '{ "width": 240, "height": 120 } to resize. null clears an optional property.',
          ),
      },
      outputSchema: {
        ...baseOutput,
        elementId: z.string().optional(),
        element: z.unknown().optional().describe("The element after the change."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ sceneId, elementId, changes }) =>
      guard(() => {
        const scene = ctx.store.require(sceneId);
        const updated = updateElement(scene, elementId, changes);
        ctx.store.save(scene);
        ctx.store.record(sceneId, {
          type: "update",
          elementId,
          timestamp: Date.now(),
          summary: `updated '${elementId}' (${Object.keys(changes).join(", ")})`,
        });
        return toolSuccess(
          `Updated '${elementId}' in scene '${sceneId}': ${Object.keys(changes).join(", ")}. Call render_scene to show the result.`,
          { sceneId, elementId, element: updated },
        );
      }),
  );
};
