import { z } from "zod";
import { IdSchema } from "../../scene/schemas/common.js";
import { addElement } from "../../scene/mutations.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";
import { baseOutput, sceneIdField } from "./shared.js";

export const registerAddElement: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "add_element",
    {
      title: "Add an element",
      description: [
        "Add one element to a scene that already exists.",
        "",
        "USE THIS when the user wants something new in a diagram you already drew:",
        '"add a load balancer", "put a Redis cache next to the API", "draw an arrow from A to B".',
        "",
        "Call get_scene first if you are not certain which ids exist. To link the new element to",
        "an existing one, make a second call with an element of type 'connection' referencing the",
        "two ids - the geometry is computed for you.",
        "",
        "Omit x/y and the layout engine places it. Set `parentId` to put it inside a group.",
        "",
        "This does not display anything. Call render_scene once your edits are done.",
      ].join("\n"),
      inputSchema: {
        sceneId: sceneIdField,
        // Deliberately loose: the full element union is already spelled out in
        // render_diagram's schema, and repeating it here would add ~95 KB to
        // every tools/list. Validation is identical at runtime, and the errors
        // name the exact field and the allowed values.
        element: z
          .record(z.string(), z.unknown())
          .describe(
            "The element to add: an object with a unique `id`, a `type`, and the properties of that type - " +
              "exactly the same shape as the entries of `elements` in render_diagram. " +
              "Types: node, connection, group, axis, point, scatter, cluster, plotLine, label, " +
              "server, database, router, switch, computer, cloud, circle, ellipse, rectangle, line, arrow, text, " +
              "polygon, polyline, path. " +
              'Example: { "id": "cache", "type": "database", "label": "Redis" }.',
          ),
        parentId: IdSchema.optional().describe("Id of a 'group' element to nest this inside."),
      },
      outputSchema: {
        ...baseOutput,
        elementId: z.string().optional(),
        elementCount: z.number().optional().describe("Top-level elements in the scene after the add."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ sceneId, element, parentId }) =>
      guard(() => {
        const scene = ctx.store.require(sceneId);
        const added = addElement(scene, element, parentId);
        ctx.store.save(scene);
        ctx.store.record(sceneId, {
          type: "add",
          elementId: added.id,
          timestamp: Date.now(),
          summary: `added ${added.type} '${added.id}'`,
        });
        return toolSuccess(
          `Added ${added.type} '${added.id}' to scene '${sceneId}'. Call render_scene to show the updated diagram.`,
          { sceneId, elementId: added.id, elementCount: scene.elements.length },
        );
      }),
  );
};
