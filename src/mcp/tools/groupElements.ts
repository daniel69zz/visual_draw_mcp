import { z } from "zod";
import { IdSchema, ColorSchema } from "../../scene/schemas/common.js";
import { groupElements } from "../../scene/mutations.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";
import { baseOutput, sceneIdField } from "./shared.js";

/**
 * Hierarchy editing: "put all of this inside a box called AWS".
 * Members keep their ids, so every existing connection keeps working.
 */
export const registerGroupElements: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "group_elements",
    {
      title: "Group elements into a labelled box",
      description: [
        "Wrap existing top-level elements in a labelled container.",
        "",
        'USE THIS for "put all of this inside a box called AWS", "group these services into a VPC",',
        '"draw a boundary around the data layer", "show which parts are in VLAN 10".',
        "",
        "The members keep their ids, and every connection to or from them keeps working - including",
        "connections that cross the boundary.",
        "",
        "Set `layout` to re-arrange the members inside the box ('vertical' stacks them, 'horizontal'",
        "puts them in a row, 'grid' wraps them). Leave it out to keep their current arrangement.",
        "",
        "Only top-level elements can be grouped. To nest a group inside another group, create the",
        "inner one first, then group it together with its siblings.",
      ].join("\n"),
      inputSchema: {
        sceneId: sceneIdField,
        groupId: IdSchema.describe("Id for the new group, e.g. 'aws' or 'vlan-10'."),
        elementIds: z
          .array(IdSchema)
          .min(1)
          .max(200)
          .describe("Ids of the top-level elements to move inside the box."),
        label: z.string().max(200).optional().describe("Text drawn on the box, e.g. 'AWS'."),
        layout: z
          .enum(["horizontal", "vertical", "grid", "manual"])
          .optional()
          .describe("Re-arrange the members. Default 'manual' (keep their current positions)."),
        stroke: ColorSchema.optional().describe("Border colour."),
        fill: ColorSchema.optional().describe("Background colour."),
      },
      outputSchema: {
        ...baseOutput,
        groupId: z.string().optional(),
        members: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ sceneId, groupId, elementIds, label, layout, stroke, fill }) =>
      guard(() => {
        const scene = ctx.store.require(sceneId);
        const group = groupElements(
          scene,
          {
            id: groupId,
            ...(label !== undefined ? { label } : {}),
            ...(layout !== undefined ? { layout } : {}),
            ...(stroke !== undefined ? { stroke } : {}),
            ...(fill !== undefined ? { fill } : {}),
          },
          elementIds,
        );
        ctx.store.save(scene);
        ctx.store.record(sceneId, {
          type: "add",
          elementId: groupId,
          timestamp: Date.now(),
          summary: `grouped ${elementIds.join(", ")} into '${groupId}'`,
        });
        return toolSuccess(
          `Grouped ${elementIds.length} element(s) into '${group.id}'${label ? ` ("${label}")` : ""}. Call render_scene to show the result.`,
          { sceneId, groupId: group.id, members: elementIds },
        );
      }),
  );
};
