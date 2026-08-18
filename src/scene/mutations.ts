import { visualError } from "./errors.js";
import { checkReferences, collectIds, parseElement, walkElements } from "./validate.js";
import { computeLayout } from "../layout/index.js";
import { isNodeLike } from "../layout/measure.js";
import type { GroupElement, Scene, VisualElement } from "./types.js";

/**
 * Structural edits on a Scene.
 *
 * Every operation is surgical: adding Redis between two services must not
 * disturb the rest of the diagram. That is the whole point of keeping a scene
 * graph instead of regenerating a picture on every turn.
 */

/** Deep clone that keeps the scene independent of the caller's object. */
export function cloneScene(scene: Scene): Scene {
  return structuredClone(scene);
}

/**
 * Every mutation is atomic.
 *
 * The tools mutate the stored scene in place, so a change that turns out to be
 * invalid - a connection to an id that does not exist, a width that went
 * negative - must leave nothing behind. Without this, a single rejected call
 * would corrupt the scene for the rest of the conversation.
 */
function transact<T>(scene: Scene, fn: () => T): T {
  const snapshot = structuredClone(scene.elements ?? []);
  try {
    const result = fn();
    checkReferences(scene);
    return result;
  } catch (err) {
    scene.elements = snapshot;
    throw err;
  }
}

export function findElement(scene: Scene, id: string): VisualElement | undefined {
  for (const { element } of walkElements(scene.elements ?? [])) {
    if (element.id === id) return element;
  }
  return undefined;
}

function suggest(scene: Scene, limit = 20): string {
  const ids = [...collectIds(scene.elements ?? []).keys()];
  if (ids.length === 0) return "The scene is empty.";
  return `Existing ids: ${ids.slice(0, limit).join(", ")}${ids.length > limit ? ", ..." : ""}.`;
}

export function addElement(scene: Scene, input: unknown, parentId?: string): VisualElement {
  const element = parseElement(input);
  if (findElement(scene, element.id)) {
    throw visualError("DUPLICATE_ID", `An element with id '${element.id}' already exists.`, {
      hint: "Use update_element to change it, or pick a different id.",
    });
  }

  return transact(scene, () => {
    if (parentId) {
      const parent = findElement(scene, parentId);
      if (!parent) {
        throw visualError("ELEMENT_NOT_FOUND", `Parent group '${parentId}' does not exist.`, {
          hint: suggest(scene),
        });
      }
      if (parent.type !== "group") {
        throw visualError("INVALID_REFERENCE", `'${parentId}' is a '${parent.type}', not a group.`, {
          hint: "Only elements of type 'group' can contain children.",
        });
      }
      (parent as GroupElement).children.push(element);
    } else {
      scene.elements.push(element);
    }
    return element;
  });
}

/**
 * Merges `changes` into an existing element and re-validates the result.
 * `null` removes an optional property, which is how the model clears a colour
 * or unpins a node so the layout takes over again.
 */
export function updateElement(
  scene: Scene,
  elementId: string,
  changes: Record<string, unknown>,
): VisualElement {
  const target = findElement(scene, elementId);
  if (!target) {
    throw visualError("ELEMENT_NOT_FOUND", `No element with id '${elementId}' in this scene.`, {
      hint: suggest(scene),
    });
  }

  if ("id" in changes && changes.id !== elementId) {
    throw visualError("INVALID_ELEMENT", "An element id cannot be changed.", {
      path: "changes.id",
      hint: "Remove the element and add it again if you really need a different id.",
    });
  }
  if ("type" in changes && changes.type !== target.type) {
    throw visualError(
      "TYPE_CHANGE_NOT_ALLOWED",
      `Cannot change '${elementId}' from '${target.type}' to '${String(changes.type)}'.`,
      {
        path: "changes.type",
        hint: "Remove the element and add a new one with the type you want (connections referencing it must be updated too).",
      },
    );
  }

  const merged: Record<string, unknown> = { ...(target as Record<string, unknown>) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }

  const validated = parseElement(merged);
  return transact(scene, () => {
    replaceInPlace(scene, elementId, validated);
    return validated;
  });
}

export function removeElement(scene: Scene, elementId: string, cascade = true): string[] {
  const target = findElement(scene, elementId);
  if (!target) {
    throw visualError("ELEMENT_NOT_FOUND", `No element with id '${elementId}' in this scene.`, {
      hint: suggest(scene),
    });
  }

  const removed = new Set<string>([elementId]);
  if (target.type === "group") {
    for (const { element } of walkElements((target as GroupElement).children ?? [])) {
      removed.add(element.id);
    }
  }

  // Dangling connections would fail validation, so they go with the element.
  if (cascade) {
    for (const { element } of walkElements(scene.elements ?? [])) {
      if (element.type === "connection" && (removed.has(element.from) || removed.has(element.to))) {
        removed.add(element.id);
      }
      if (element.type === "label" && element.target && removed.has(element.target)) {
        removed.add(element.id);
      }
    }
  }

  return transact(scene, () => {
    scene.elements = pruneList(scene.elements ?? [], removed);
    return [...removed];
  });
}

/**
 * Writes the positions the layout engine computed back into the elements.
 *
 * Drawing a box around things must not move them. Auto-placed elements carry no
 * x/y of their own, so before a structural change we pin them where they
 * already are - otherwise the new container would re-flow the whole picture and
 * the user would watch everything jump.
 */
export function freezePositions(scene: Scene): void {
  const { boxes } = computeLayout(scene);
  for (const element of scene.elements ?? []) {
    const box = boxes.get(element.id);
    if (!box) continue;
    if (element.type === "group") {
      const group = element as GroupElement;
      if (group.x === undefined) group.x = Math.round(box.x);
      if (group.y === undefined) group.y = Math.round(box.y);
    } else if (isNodeLike(element)) {
      const node = element as { x?: number; y?: number };
      if (node.x === undefined) node.x = Math.round(box.cx);
      if (node.y === undefined) node.y = Math.round(box.cy);
    }
  }
}

/** Wraps existing top-level elements into a new group ("put all of this inside AWS"). */
export function groupElements(
  scene: Scene,
  group: Omit<GroupElement, "children" | "type"> & { type?: "group" },
  memberIds: string[],
): GroupElement {
  if (findElement(scene, group.id)) {
    throw visualError("DUPLICATE_ID", `An element with id '${group.id}' already exists.`, {
      hint: "Pick a different id for the new group.",
    });
  }

  return transact(scene, () => {
    // Pin everything first, so wrapping a box around three nodes leaves the
    // rest of the diagram exactly where the user last saw it.
    freezePositions(scene);

    const members: VisualElement[] = [];
    for (const id of memberIds) {
      const index = (scene.elements ?? []).findIndex((e) => e.id === id);
      if (index === -1) {
        throw visualError(
          "ELEMENT_NOT_FOUND",
          `Cannot group '${id}': it is not a top-level element of this scene.`,
          { hint: `${suggest(scene)} Only top-level elements can be grouped.` },
        );
      }
      members.push(scene.elements[index]!);
    }

    scene.elements = (scene.elements ?? []).filter((e) => !memberIds.includes(e.id));
    const created: GroupElement = { ...group, type: "group", children: members };
    scene.elements.push(created);
    return created;
  });
}

export function clearScene(scene: Scene): void {
  scene.elements = [];
}

function replaceInPlace(scene: Scene, id: string, replacement: VisualElement): void {
  const walk = (list: VisualElement[]): boolean => {
    for (let i = 0; i < list.length; i++) {
      const current = list[i]!;
      if (current.id === id) {
        // Children are preserved: updating a group's style must not empty it.
        if (current.type === "group" && replacement.type === "group") {
          (replacement as GroupElement).children = (current as GroupElement).children;
        }
        list[i] = replacement;
        return true;
      }
      if (current.type === "group" && walk((current as GroupElement).children ?? [])) return true;
    }
    return false;
  };
  walk(scene.elements ?? []);
}

function pruneList(list: VisualElement[], removed: Set<string>): VisualElement[] {
  const out: VisualElement[] = [];
  for (const element of list) {
    if (removed.has(element.id)) continue;
    if (element.type === "group") {
      out.push({
        ...(element as GroupElement),
        children: pruneList((element as GroupElement).children ?? [], removed),
      });
    } else {
      out.push(element);
    }
  }
  return out;
}
