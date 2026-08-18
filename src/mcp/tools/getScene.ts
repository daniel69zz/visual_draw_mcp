import { z } from "zod";
import { computeLayout } from "../../layout/index.js";
import { visualError } from "../../scene/errors.js";
import { findElement } from "../../scene/mutations.js";
import { collectIds } from "../../scene/validate.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";
import { baseOutput, elementIdField, sceneIdField } from "./shared.js";

export const registerGetScene: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "get_scene",
    {
      title: "Inspect a scene",
      description: [
        "Return the current structured description of a scene: every element with its id, type and",
        "properties, plus the position and size each one actually ended up with.",
        "",
        "USE THIS BEFORE EDITING whenever you are not sure of the current state - which ids exist,",
        "what a node is called, where it sits, what is already connected. Reading first is what",
        "makes small edits possible instead of redrawing the diagram from scratch.",
        "",
        "The `layout` field gives the computed box (x, y, width, height) of every element,",
        "including ones you never gave coordinates to. Those are the numbers to use when the user",
        'asks for something relative: "a bit to the right", "above the backend", "same width as X".',
        "",
        "This does not display anything.",
      ].join("\n"),
      inputSchema: {
        sceneId: sceneIdField,
        elementId: elementIdField
          .optional()
          .describe("Return just this one element instead of the whole scene."),
        includeLayout: z
          .boolean()
          .optional()
          .describe("Include the computed box of every element. Default true."),
      },
      outputSchema: {
        ...baseOutput,
        scene: z.unknown().optional().describe("The full scene, ready to be edited or re-sent."),
        element: z.unknown().optional(),
        layout: z.unknown().optional().describe("Map of element id to { x, y, width, height }."),
        ids: z.array(z.string()).optional().describe("Every element id in the scene."),
        history: z.unknown().optional().describe("The last few mutations applied to this scene."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ sceneId, elementId, includeLayout }) =>
      guard(() => {
        const scene = ctx.store.require(sceneId);

        if (elementId) {
          const element = findElement(scene, elementId);
          if (!element) {
            throw visualError(
              "ELEMENT_NOT_FOUND",
              `No element with id '${elementId}' in scene '${sceneId}'.`,
              { hint: "Call get_scene without elementId to see every id in the scene." },
            );
          }
          return toolSuccess(`Element '${elementId}' of scene '${sceneId}'.`, { sceneId, element });
        }

        const ids = [...collectIds(scene.elements ?? []).keys()];
        const layout =
          (includeLayout ?? true)
            ? Object.fromEntries(
                [...computeLayout(scene).boxes].map(([id, b]) => [
                  id,
                  {
                    x: Math.round(b.x),
                    y: Math.round(b.y),
                    width: Math.round(b.width),
                    height: Math.round(b.height),
                  },
                ]),
              )
            : undefined;

        return toolSuccess(
          `Scene '${sceneId}' has ${scene.elements.length} top-level elements (${ids.length} in total).`,
          {
            sceneId,
            scene,
            ids,
            ...(layout ? { layout } : {}),
            history: ctx.store.history(sceneId).slice(-10),
          },
        );
      }),
  );
};
