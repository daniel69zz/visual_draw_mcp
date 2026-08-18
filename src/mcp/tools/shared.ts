import { z } from "zod";
import { IdSchema } from "../../scene/schemas/common.js";

/** Fields repeated across the editing tools, described once. */
export const sceneIdField = IdSchema.describe(
  "Id of the scene to work on, as returned by render_diagram or create_scene.",
);

export const elementIdField = IdSchema.describe("Id of the element.");

/** Shape shared by every editing tool's output, so failures always look the same. */
export const baseOutput = {
  success: z.boolean(),
  sceneId: z.string().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      path: z.string().optional(),
      hint: z.string().optional(),
    })
    .optional()
    .describe("Present only when success is false."),
};
