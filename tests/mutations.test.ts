import { describe, expect, it } from "vitest";
import {
  addElement,
  clearScene,
  findElement,
  freezePositions,
  groupElements,
  removeElement,
  updateElement,
} from "../src/scene/mutations.js";
import { InMemorySceneStore } from "../src/scene/sceneStore.js";
import { VisualError } from "../src/scene/errors.js";
import { computeLayout } from "../src/layout/index.js";
import type { GroupElement, Scene } from "../src/scene/types.js";
import { scene } from "./helpers.js";

function base(): Scene {
  return scene([
    { id: "frontend", type: "node", label: "React" },
    { id: "backend", type: "node", label: "NestJS" },
    { id: "db", type: "database", label: "PostgreSQL" },
    { id: "c1", type: "connection", from: "frontend", to: "backend" },
    { id: "c2", type: "connection", from: "backend", to: "db" },
  ]);
}

function expectError(fn: () => unknown, code: string): VisualError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(VisualError);
    expect((err as VisualError).code).toBe(code);
    return err as VisualError;
  }
  throw new Error(`expected ${code}`);
}

describe("add_element", () => {
  it("adds an element and leaves the rest untouched", () => {
    const s = base();
    addElement(s, { id: "cache", type: "database", label: "Redis" });
    expect(s.elements).toHaveLength(6);
    expect(findElement(s, "backend")).toMatchObject({ label: "NestJS" });
  });

  it("rejects a duplicate id", () => {
    const s = base();
    const error = expectError(() => addElement(s, { id: "backend", type: "node", label: "dup" }), "DUPLICATE_ID");
    expect(error.hint).toContain("update_element");
  });

  it("rejects a connection to an element that does not exist", () => {
    const s = base();
    expectError(
      () => addElement(s, { id: "c3", type: "connection", from: "backend", to: "ghost" }),
      "ELEMENT_NOT_FOUND",
    );
    expect(findElement(s, "c3")).toBeUndefined();
  });

  it("nests into a group when parentId is given", () => {
    const s = scene([{ id: "g", type: "group", label: "AWS", children: [] }]);
    addElement(s, { id: "n", type: "node", label: "N" }, "g");
    expect((s.elements[0] as GroupElement).children).toHaveLength(1);
    expect(s.elements).toHaveLength(1);
  });

  it("refuses to nest into something that is not a group", () => {
    const s = base();
    expectError(() => addElement(s, { id: "n", type: "node", label: "N" }, "backend"), "INVALID_REFERENCE");
  });
});

describe("update_element", () => {
  it("changes only the fields provided", () => {
    const s = base();
    const updated = updateElement(s, "backend", { x: 420, y: 180 });
    expect(updated).toMatchObject({ id: "backend", label: "NestJS", x: 420, y: 180 });
  });

  it("does not touch any other element", () => {
    const s = base();
    const before = JSON.stringify(findElement(s, "frontend"));
    updateElement(s, "backend", { fill: "primary" });
    expect(JSON.stringify(findElement(s, "frontend"))).toBe(before);
  });

  it("clears an optional property when given null, handing it back to the layout", () => {
    const s = base();
    updateElement(s, "backend", { x: 500, y: 500 });
    const cleared = updateElement(s, "backend", { x: null, y: null }) as { x?: number };
    expect(cleared.x).toBeUndefined();
  });

  it("rejects an unknown element id and lists what exists", () => {
    const s = base();
    const error = expectError(() => updateElement(s, "ghost", { x: 1 }), "ELEMENT_NOT_FOUND");
    expect(error.hint).toContain("backend");
  });

  it("rejects a change that would make the element invalid", () => {
    const s = base();
    expectError(() => updateElement(s, "backend", { width: -50 }), "INVALID_ELEMENT");
    expect(findElement(s, "backend")).toMatchObject({ label: "NestJS" });
  });

  it("refuses to change the type", () => {
    const s = base();
    expectError(() => updateElement(s, "backend", { type: "database" }), "TYPE_CHANGE_NOT_ALLOWED");
  });

  it("refuses to change the id", () => {
    const s = base();
    expectError(() => updateElement(s, "backend", { id: "other" }), "INVALID_ELEMENT");
  });

  it("keeps a group's children when the group itself is restyled", () => {
    const s = scene([
      { id: "g", type: "group", label: "AWS", children: [{ id: "n", type: "node", label: "N" }] },
    ]);
    updateElement(s, "g", { stroke: "primary" });
    expect((findElement(s, "g") as GroupElement).children).toHaveLength(1);
  });

  it("reaches elements nested inside groups", () => {
    const s = scene([
      { id: "g", type: "group", label: "AWS", children: [{ id: "n", type: "node", label: "N" }] },
    ]);
    updateElement(s, "n", { label: "renamed" });
    expect(findElement(s, "n")).toMatchObject({ label: "renamed" });
  });
});

describe("remove_element", () => {
  it("removes the element and its connections", () => {
    const s = base();
    const removed = removeElement(s, "backend");
    expect(removed).toEqual(expect.arrayContaining(["backend", "c1", "c2"]));
    expect(findElement(s, "backend")).toBeUndefined();
    expect(findElement(s, "frontend")).toBeDefined();
  });

  it("keeps connections when cascade is off - and then the scene is invalid", () => {
    const s = base();
    expect(() => removeElement(s, "backend", false)).toThrow(VisualError);
  });

  it("removes a group together with its children", () => {
    const s = scene([
      { id: "g", type: "group", label: "AWS", children: [{ id: "n", type: "node", label: "N" }] },
    ]);
    const removed = removeElement(s, "g");
    expect(removed).toEqual(expect.arrayContaining(["g", "n"]));
    expect(s.elements).toHaveLength(0);
  });

  it("rejects an unknown id", () => {
    expectError(() => removeElement(base(), "ghost"), "ELEMENT_NOT_FOUND");
  });
});

describe("group_elements", () => {
  it("moves members inside the group and keeps their ids", () => {
    const s = base();
    groupElements(s, { id: "aws", label: "AWS" }, ["backend", "db"]);
    const group = findElement(s, "aws") as GroupElement;
    expect(group.children.map((c) => c.id)).toEqual(["backend", "db"]);
    expect(findElement(s, "backend")).toBeDefined();
  });

  it("keeps connections that cross the new boundary valid", () => {
    const s = base();
    groupElements(s, { id: "aws", label: "AWS" }, ["backend", "db"]);
    expect(findElement(s, "c1")).toBeDefined();
  });

  it("does not move anything that was auto-placed", () => {
    const s = base();
    const before = computeLayout(s).boxes.get("frontend")!;
    groupElements(s, { id: "aws", label: "AWS" }, ["backend", "db"]);
    const after = computeLayout(s).boxes.get("frontend")!;
    expect(after.cx).toBeCloseTo(before.cx, 0);
    expect(after.cy).toBeCloseTo(before.cy, 0);
  });

  it("rejects grouping something that is not top-level", () => {
    const s = scene([
      { id: "g", type: "group", label: "G", children: [{ id: "inner", type: "node", label: "N" }] },
    ]);
    expectError(() => groupElements(s, { id: "aws" }, ["inner"]), "ELEMENT_NOT_FOUND");
  });

  it("rejects a group id that is already taken", () => {
    const s = base();
    expectError(() => groupElements(s, { id: "backend" }, ["db"]), "DUPLICATE_ID");
  });
});

describe("freezePositions", () => {
  it("writes computed coordinates onto auto-placed elements only", () => {
    const s = base();
    freezePositions(s);
    const frontend = findElement(s, "frontend") as { x?: number; y?: number };
    expect(typeof frontend.x).toBe("number");
    expect(typeof frontend.y).toBe("number");
  });

  it("leaves explicit coordinates alone", () => {
    const s = scene([{ id: "n", type: "node", label: "N", x: 123, y: 456 }]);
    freezePositions(s);
    expect(findElement(s, "n")).toMatchObject({ x: 123, y: 456 });
  });
});

describe("clear_scene", () => {
  it("empties the elements but keeps the canvas settings", () => {
    const s = scene([{ id: "n", type: "node", label: "N" }], { title: "Keep me", theme: "light" });
    clearScene(s);
    expect(s.elements).toHaveLength(0);
    expect(s.title).toBe("Keep me");
    expect(s.theme).toBe("light");
  });
});

describe("SceneStore", () => {
  it("assigns an id and returns the stored scene", () => {
    const store = new InMemorySceneStore();
    const stored = store.create(scene([], { id: undefined }));
    expect(stored.id).toMatch(/^scene-/);
    expect(store.get(stored.id!)).toBeDefined();
  });

  it("throws a helpful error for an unknown scene", () => {
    const store = new InMemorySceneStore();
    store.create(scene([], { id: "known" }));
    const error = expectError(() => store.require("missing"), "SCENE_NOT_FOUND");
    expect(error.hint).toContain("known");
  });

  it("records a bounded mutation history", () => {
    const store = new InMemorySceneStore();
    const stored = store.create(scene([], { id: "s1" }));
    for (let i = 0; i < 250; i++) {
      store.record(stored.id!, { type: "update", elementId: `e${i}`, timestamp: Date.now() });
    }
    const history = store.history(stored.id!);
    expect(history.length).toBeLessThanOrEqual(200);
    expect(history.at(-1)?.elementId).toBe("e249");
  });

  it("evicts the oldest scenes past the limit", () => {
    const store = new InMemorySceneStore(3);
    for (let i = 0; i < 5; i++) store.create(scene([], { id: `s${i}` }));
    expect(store.list()).toHaveLength(3);
    expect(store.get("s0")).toBeUndefined();
    expect(store.get("s4")).toBeDefined();
  });
});
