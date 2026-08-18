import { z } from "zod";
import { SceneSchema } from "./schemas/scene.js";
import { VisualElementSchema, isKnownElementType, ELEMENT_TYPES } from "./schemas/element.js";
import { visualError, VisualError, type VisualErrorPayload } from "./errors.js";
import type { Scene, VisualElement, GroupElement } from "./types.js";

/** Element types that can be the endpoint of a connection or the target of a label. */
const ANCHORABLE = new Set([
  "node",
  "server",
  "database",
  "router",
  "switch",
  "computer",
  "cloud",
  "group",
  "circle",
  "ellipse",
  "rectangle",
  "polygon",
  "text",
  "point",
  "axis",
]);

/** Depth-first walk over every element, including group children. */
export function* walkElements(
  elements: VisualElement[],
  parent: GroupElement | null = null,
): Generator<{ element: VisualElement; parent: GroupElement | null }> {
  for (const element of elements) {
    yield { element, parent };
    if (element.type === "group") {
      yield* walkElements((element as GroupElement).children ?? [], element as GroupElement);
    }
  }
}

export function collectIds(elements: VisualElement[]): Map<string, VisualElement> {
  const map = new Map<string, VisualElement>();
  for (const { element } of walkElements(elements)) map.set(element.id, element);
  return map;
}

/**
 * Turns a Zod failure into one small, actionable message.
 *
 * We report a single issue at a time on purpose: a model fixes one thing per
 * turn, and a wall of union errors is worse than useless.
 */
function fromZod(error: z.ZodError, what: string): VisualError {
  const issue = pickIssue(error);
  const path = issue.path.map(String).join(".");
  return visualError(
    what === "scene" ? "INVALID_SCENE" : "INVALID_ELEMENT",
    `${path ? `${path}: ` : ""}${issue.message}`,
    {
      path: path || undefined,
      hint:
        issue.code === "invalid_union"
          ? `Check the 'type' field: it must be one of ${ELEMENT_TYPES.join(", ")}, and every property must belong to that type.`
          : undefined,
    },
  );
}

/** Prefers the deepest, most specific issue - union errors bubble up as noise. */
function pickIssue(error: z.ZodError): z.core.$ZodIssue {
  const issues = error.issues;
  let best = issues[0]!;
  for (const issue of issues) {
    if (issue.path.length > best.path.length) best = issue;
  }
  return best;
}

/**
 * Unknown `type` values are caught before Zod runs.
 *
 * A discriminated union reports an unknown discriminant as a wall of failed
 * alternatives; this produces one sentence naming the bad type and the valid
 * ones, which is what a model can actually act on.
 */
function checkElementTypes(input: unknown, path = "elements"): void {
  if (!Array.isArray(input)) return;
  input.forEach((element, index) => {
    if (typeof element !== "object" || element === null) return;
    const record = element as { type?: unknown; children?: unknown };
    if (typeof record.type === "string" && !isKnownElementType(record.type)) {
      throw visualError("UNKNOWN_ELEMENT_TYPE", `Unknown element type '${record.type}'.`, {
        path: `${path}.${index}.type`,
        hint: `Supported types: ${ELEMENT_TYPES.join(", ")}.`,
      });
    }
    if (record.type === "group") checkElementTypes(record.children, `${path}.${index}.children`);
  });
}

export function parseScene(input: unknown): Scene {
  if (typeof input === "object" && input !== null) {
    checkElementTypes((input as { elements?: unknown }).elements);
  }
  const result = SceneSchema.safeParse(input);
  if (!result.success) throw fromZod(result.error, "scene");
  const scene = result.data as Scene;
  checkReferences(scene);
  return scene;
}

export function parseElement(input: unknown): VisualElement {
  if (typeof input === "object" && input !== null) {
    const type = (input as { type?: unknown }).type;
    if (typeof type === "string" && !isKnownElementType(type)) {
      throw visualError(
        "UNKNOWN_ELEMENT_TYPE",
        `Unknown element type '${type}'.`,
        {
          path: "type",
          hint: `Supported types: ${ELEMENT_TYPES.join(", ")}.`,
        },
      );
    }
    if (type === undefined) {
      throw visualError("INVALID_ELEMENT", "Element is missing the required 'type' field.", {
        path: "type",
        hint: `Supported types: ${ELEMENT_TYPES.join(", ")}.`,
      });
    }
  }
  const result = VisualElementSchema.safeParse(input);
  if (!result.success) throw fromZod(result.error, "element");
  return result.data as VisualElement;
}

/**
 * Cross-element checks Zod cannot express: uniqueness and referential integrity.
 * These are exactly the mistakes a model makes, so the messages name the
 * offending ids and suggest what exists instead.
 */
export function checkReferences(scene: Scene): void {
  const seen = new Set<string>();
  const elements = scene.elements ?? [];

  for (const { element } of walkElements(elements)) {
    if (seen.has(element.id)) {
      throw visualError("DUPLICATE_ID", `Two elements share the id '${element.id}'.`, {
        path: `elements.${element.id}`,
        hint: "Ids must be unique across the whole scene, including inside groups. Rename one of them.",
      });
    }
    seen.add(element.id);
  }

  const byId = collectIds(elements);
  const anchorable = [...byId.entries()]
    .filter(([, el]) => ANCHORABLE.has(el.type))
    .map(([id]) => id);
  const axes = [...byId.entries()].filter(([, el]) => el.type === "axis").map(([id]) => id);

  for (const { element } of walkElements(elements)) {
    if (element.type === "connection") {
      for (const end of ["from", "to"] as const) {
        const ref = element[end];
        const target = byId.get(ref);
        if (!target) {
          throw visualError(
            "ELEMENT_NOT_FOUND",
            `Connection '${element.id}' points to '${ref}' (${end}), which does not exist in the scene.`,
            {
              path: `${element.id}.${end}`,
              hint: anchorable.length
                ? `Existing elements you can connect: ${anchorable.slice(0, 20).join(", ")}.`
                : "Add the element first, then create the connection.",
            },
          );
        }
        if (!ANCHORABLE.has(target.type)) {
          throw visualError(
            "INVALID_REFERENCE",
            `Connection '${element.id}' points to '${ref}', which is a '${target.type}' and has no shape to attach to.`,
            {
              path: `${element.id}.${end}`,
              hint: "Connect nodes, groups or shapes - not other connections or labels.",
            },
          );
        }
      }
    }

    if ("frame" in element && typeof element.frame === "string") {
      const frame = byId.get(element.frame);
      if (!frame) {
        throw visualError(
          "ELEMENT_NOT_FOUND",
          `Element '${element.id}' uses frame '${element.frame}', which does not exist.`,
          {
            path: `${element.id}.frame`,
            hint: axes.length
              ? `Available axis frames: ${axes.join(", ")}.`
              : "Add an element of type 'axis' first, then reference its id as `frame`.",
          },
        );
      }
      if (frame.type !== "axis") {
        throw visualError(
          "INVALID_REFERENCE",
          `Element '${element.id}' uses frame '${element.frame}', but that element is a '${frame.type}', not an 'axis'.`,
          { path: `${element.id}.frame`, hint: "`frame` must be the id of an 'axis' element." },
        );
      }
    }

    if (element.type === "label" && element.target) {
      if (!byId.has(element.target)) {
        throw visualError(
          "ELEMENT_NOT_FOUND",
          `Label '${element.id}' targets '${element.target}', which does not exist.`,
          {
            path: `${element.id}.target`,
            hint: "Either point it at an existing element or drop `target` and give x/y instead.",
          },
        );
      }
    }
  }
}

/** Non-throwing variant used by the `validate_scene` tool. */
export function validateScene(input: unknown): { ok: true; scene: Scene } | { ok: false; error: VisualErrorPayload } {
  try {
    return { ok: true, scene: parseScene(input) };
  } catch (err) {
    if (err instanceof VisualError) return { ok: false, error: err.toPayload() };
    throw err;
  }
}
