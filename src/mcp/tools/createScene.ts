import { z } from "zod";
import { SceneInitSchema } from "../../scene/schemas/scene.js";
import { parseScene } from "../../scene/validate.js";
import type { ToolRegistration } from "../context.js";
import { guard, toolSuccess } from "../result.js";

export const registerCreateScene: ToolRegistration = (server, ctx) => {
  server.registerTool(
    "create_scene",
    {
      title: "Create an empty scene",
      description: [
        "Create a new, empty scene and get back its id.",
        "",
        "USE THIS when you want to build a diagram incrementally - create the canvas, then add",
        "elements one at a time with add_element, then call render_scene when it is complete.",
        "",
        "DO NOT use this when you already know the whole picture: render_diagram does the same",
        "job in one round trip and is almost always the better choice. Incremental building is",
        "only worth it for large diagrams you are assembling as the conversation goes.",
        "",
        "Nothing is shown to the user until you call render_scene.",
      ].join("\n"),
      inputSchema: SceneInitSchema.shape,
      outputSchema: {
        success: z.boolean(),
        sceneId: z.string(),
        message: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) =>
      guard(() => {
        const scene = parseScene({ ...args, elements: [] });
        const stored = ctx.store.create(scene);
        return toolSuccess(
          `Created empty scene '${stored.id}'. Add elements with add_element, then call render_scene with this sceneId to show it.`,
          { sceneId: stored.id!, message: "Scene created. Nothing is visible until you call render_scene." },
        );
      }),
  );
};
