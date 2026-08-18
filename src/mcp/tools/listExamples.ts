import { z } from "zod";
import { EXAMPLES } from "../../examples/index.js";
import { ELEMENT_TYPES } from "../../scene/schemas/element.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";

/**
 * Self-documentation.
 *
 * A model that has never seen this server can call this once and learn the
 * vocabulary from working scenes, which is far more reliable than inferring it
 * from JSON Schema alone.
 */
export const registerListExamples: ToolRegistration = (server) => {
  server.registerTool(
    "list_examples",
    {
      title: "Show example scenes",
      description: [
        "Return complete, working example scenes for common kinds of diagram.",
        "",
        "USE THIS when you are unsure how to express something with this server: which element",
        "type fits, how data frames work, how to nest a group. Copy the closest example and",
        "adapt it - that is faster and more reliable than guessing at the schema.",
        "",
        "Call it with no arguments for the catalogue, or with `name` for one full scene you can",
        "pass straight to render_diagram.",
        "",
        "Available: network, lda, regression, architecture, tree.",
      ].join("\n"),
      inputSchema: {
        name: z
          .enum(["network", "lda", "regression", "architecture", "tree"])
          .optional()
          .describe("Return the full scene for this example. Omit for the catalogue."),
      },
      outputSchema: {
        success: z.boolean(),
        examples: z.unknown().optional(),
        scene: z.unknown().optional(),
        elementTypes: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) =>
      guard(() => {
        if (name) {
          const example = EXAMPLES[name]!;
          return toolSuccess(
            `Example '${name}': ${example.description} Pass this scene to render_diagram, or adapt it.`,
            { scene: example.scene },
          );
        }
        return toolSuccess(
          "Example catalogue. Call list_examples again with a name to get the full scene.",
          {
            examples: Object.entries(EXAMPLES).map(([key, value]) => ({
              name: key,
              description: value.description,
              title: value.scene.title,
              elementCount: value.scene.elements.length,
            })),
            elementTypes: [...ELEMENT_TYPES],
          },
        );
      }),
  );
};
