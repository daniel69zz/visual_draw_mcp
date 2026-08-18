import { describe, expect, it } from "vitest";
import { computeLayout } from "../src/layout/index.js";
import { render, resolve, scene, tags } from "./helpers.js";

/** The `d` of a connection's generated line, as [x1,y1,x2,y2]. */
function edge(svg: string, connectionId: string): [number, number, number, number] {
  const path = tags(svg, "path").find((p) => p["data-element-id"] === `${connectionId}::line`);
  expect(path, `connection '${connectionId}' should render a path`).toBeDefined();
  const n = (path!.d!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return [n[0]!, n[1]!, n[n.length - 2]!, n[n.length - 1]!];
}

describe("connections", () => {
  it("attaches to the borders of both elements, not their centres", () => {
    const elements = [
      { id: "a", type: "node" as const, label: "A", x: 100, y: 200 },
      { id: "b", type: "node" as const, label: "B", x: 500, y: 200 },
      { id: "c", type: "connection" as const, from: "a", to: "b" },
    ];
    const boxes = computeLayout(scene(elements)).boxes;
    const svg = render(elements);
    const [x1, , x2] = edge(svg, "c");

    const a = boxes.get("a")!;
    const b = boxes.get("b")!;
    // The endpoints sit on the borders, with a few pixels of breathing room so
    // the arrowhead does not touch the box.
    const slack = 6;
    expect(x1).toBeGreaterThan(a.cx);
    expect(x1).toBeLessThanOrEqual(a.x + a.width + slack);
    expect(x2).toBeLessThan(b.cx);
    expect(x2).toBeGreaterThanOrEqual(b.x - slack);
  });

  it("follows the target after it moves", () => {
    const base = [
      { id: "a", type: "node" as const, label: "A", x: 100, y: 100 },
      { id: "b", type: "node" as const, label: "B", x: 500, y: 100 },
      { id: "c", type: "connection" as const, from: "a", to: "b" },
    ];
    const before = edge(render(base), "c");
    const moved = base.map((e) => (e.id === "b" ? { ...e, y: 400 } : e));
    const after = edge(render(moved), "c");
    expect(after[3]).toBeGreaterThan(before[3] + 200);
  });

  it("renders an arrowhead by default and none when arrow is false", () => {
    const elements = [
      { id: "a", type: "node" as const, label: "A" },
      { id: "b", type: "node" as const, label: "B" },
    ];
    const withArrow = render([...elements, { id: "c", type: "connection", from: "a", to: "b" }]);
    const without = render([...elements, { id: "c", type: "connection", from: "a", to: "b", arrow: false }]);
    expect(withArrow).toContain("<marker");
    expect(without).not.toContain("<marker");
  });

  it("draws two heads when bidirectional", () => {
    const svg = render([
      { id: "a", type: "node", label: "A" },
      { id: "b", type: "node", label: "B" },
      { id: "c", type: "connection", from: "a", to: "b", bidirectional: true },
    ]);
    const path = tags(svg, "path").find((p) => p["data-element-id"] === "c::line");
    expect(path!["marker-start"]).toBeTruthy();
    expect(path!["marker-end"]).toBeTruthy();
  });

  it("draws the label on the line with a background so it stays readable", () => {
    const svg = render([
      { id: "a", type: "node", label: "A" },
      { id: "b", type: "node", label: "B" },
      { id: "c", type: "connection", from: "a", to: "b", label: "HTTPS" },
    ]);
    expect(svg).toContain("HTTPS");
    const text = tags(svg, "text").find((t) => t["data-element-id"] === "c::label");
    expect(text).toBeDefined();
  });

  it("intersects the ellipse boundary for round shapes", () => {
    const elements = [
      { id: "a", type: "node" as const, shape: "circle" as const, label: "A", x: 100, y: 100 },
      { id: "b", type: "node" as const, shape: "circle" as const, label: "B", x: 400, y: 100 },
      { id: "c", type: "connection" as const, from: "a", to: "b" },
    ];
    const boxes = computeLayout(scene(elements)).boxes;
    const [x1] = edge(render(elements), "c");
    const a = boxes.get("a")!;
    expect(Math.abs(x1 - (a.cx + a.width / 2))).toBeLessThan(10);
  });
});

describe("nodes", () => {
  it("sizes itself from the label", () => {
    const small = computeLayout(scene([{ id: "n", type: "node", label: "A" }])).boxes.get("n")!;
    const large = computeLayout(
      scene([{ id: "n", type: "node", label: "A considerably longer service name" }]),
    ).boxes.get("n")!;
    expect(large.width).toBeGreaterThan(small.width);
  });

  it("honours explicit width and height", () => {
    const box = computeLayout(
      scene([{ id: "n", type: "node", label: "A", width: 300, height: 150 }]),
    ).boxes.get("n")!;
    expect(box.width).toBe(300);
    expect(box.height).toBe(150);
  });

  it("expands a database preset into a cylinder body plus a rim", () => {
    const svg = render([{ id: "db", type: "database", label: "PostgreSQL", x: 200, y: 200 }]);
    expect(tags(svg, "path").some((p) => p["data-element-id"] === "db::body")).toBe(true);
    expect(tags(svg, "ellipse").some((e) => e["data-element-id"] === "db::rim")).toBe(true);
    expect(svg).toContain("PostgreSQL");
  });

  it("renders the sublabel as a second, smaller text element", () => {
    const svg = render([{ id: "n", type: "node", label: "PC", sublabel: "192.168.20.10", x: 0, y: 0 }]);
    const label = tags(svg, "text").find((t) => t["data-element-id"] === "n::label")!;
    const sub = tags(svg, "text").find((t) => t["data-element-id"] === "n::sublabel")!;
    expect(Number(sub["font-size"])).toBeLessThan(Number(label["font-size"]));
  });
});

describe("automatic layout", () => {
  it("places connected nodes in a left-to-right flow without any coordinates", () => {
    const boxes = computeLayout(
      scene([
        { id: "a", type: "node", label: "A" },
        { id: "b", type: "node", label: "B" },
        { id: "c", type: "node", label: "C" },
        { id: "e1", type: "connection", from: "a", to: "b" },
        { id: "e2", type: "connection", from: "b", to: "c" },
      ]),
    ).boxes;
    expect(boxes.get("a")!.cx).toBeLessThan(boxes.get("b")!.cx);
    expect(boxes.get("b")!.cx).toBeLessThan(boxes.get("c")!.cx);
  });

  it("puts siblings in the same rank side by side", () => {
    const boxes = computeLayout(
      scene([
        { id: "root", type: "node", label: "root" },
        { id: "l", type: "node", label: "left" },
        { id: "r", type: "node", label: "right" },
        { id: "e1", type: "connection", from: "root", to: "l" },
        { id: "e2", type: "connection", from: "root", to: "r" },
      ]),
    ).boxes;
    expect(boxes.get("l")!.cx).toBeCloseTo(boxes.get("r")!.cx, 0);
    expect(boxes.get("l")!.cy).not.toBeCloseTo(boxes.get("r")!.cy, 0);
  });

  it("flows downwards when direction is 'down'", () => {
    const boxes = computeLayout(
      scene(
        [
          { id: "a", type: "node", label: "A" },
          { id: "b", type: "node", label: "B" },
          { id: "e", type: "connection", from: "a", to: "b" },
        ],
        { direction: "down", layout: "layered" },
      ),
    ).boxes;
    expect(boxes.get("b")!.cy).toBeGreaterThan(boxes.get("a")!.cy);
  });

  it("never moves an element that was given coordinates", () => {
    const boxes = computeLayout(
      scene([
        { id: "a", type: "node", label: "A" },
        { id: "pinned", type: "node", label: "P", x: 777, y: 333 },
        { id: "e", type: "connection", from: "a", to: "pinned" },
      ]),
    ).boxes;
    expect(boxes.get("pinned")!.cx).toBe(777);
    expect(boxes.get("pinned")!.cy).toBe(333);
  });

  it("survives a cycle in the connection graph", () => {
    expect(() =>
      computeLayout(
        scene([
          { id: "a", type: "node", label: "A" },
          { id: "b", type: "node", label: "B" },
          { id: "e1", type: "connection", from: "a", to: "b" },
          { id: "e2", type: "connection", from: "b", to: "a" },
        ]),
      ),
    ).not.toThrow();
  });

  it("wraps a group frame around its children", () => {
    const boxes = computeLayout(
      scene([
        {
          id: "g",
          type: "group",
          label: "AWS",
          layout: "vertical",
          children: [
            { id: "x", type: "node", label: "X" },
            { id: "y", type: "node", label: "Y" },
          ],
        },
      ]),
    ).boxes;
    const g = boxes.get("g")!;
    const x = boxes.get("x")!;
    expect(x.x).toBeGreaterThanOrEqual(g.x);
    expect(x.y + x.height).toBeLessThanOrEqual(g.y + g.height);
    expect(boxes.get("y")!.cy).toBeGreaterThan(x.cy);
  });
});

describe("data frames", () => {
  it("maps data coordinates to pixels with y growing upwards", () => {
    const svg = render([
      { id: "ax", type: "axis", x: 100, y: 100, width: 400, height: 400, xRange: [0, 10], yRange: [0, 10] },
      { id: "low", type: "point", frame: "ax", x: 0, y: 0, radius: 3 },
      { id: "high", type: "point", frame: "ax", x: 10, y: 10, radius: 3 },
    ]);
    const circles = tags(svg, "circle");
    const low = circles.find((c) => c["data-element-id"] === "low::marker")!;
    const high = circles.find((c) => c["data-element-id"] === "high::marker")!;
    expect(Number(low.cx)).toBeCloseTo(100, 1);
    expect(Number(low.cy)).toBeCloseTo(500, 1);
    expect(Number(high.cx)).toBeCloseTo(500, 1);
    expect(Number(high.cy)).toBeCloseTo(100, 1);
  });

  it("generates a deterministic cluster for a given seed", () => {
    const build = () =>
      render([
        { id: "ax", type: "axis", x: 0, y: 0, width: 300, height: 300 },
        { id: "c", type: "cluster", frame: "ax", x: 5, y: 5, count: 12, seed: 42 },
      ]);
    expect(build()).toBe(build());
  });

  it("changes the cluster when the seed changes", () => {
    const withSeed = (seed: number) =>
      render([
        { id: "ax", type: "axis", x: 0, y: 0, width: 300, height: 300 },
        { id: "c", type: "cluster", frame: "ax", x: 5, y: 5, count: 12, seed },
      ]);
    expect(withSeed(1)).not.toBe(withSeed(2));
  });

  it("clips an extended plot line to the plot rectangle", () => {
    const svg = render([
      { id: "ax", type: "axis", x: 100, y: 100, width: 400, height: 400, xRange: [0, 10], yRange: [0, 10] },
      { id: "fit", type: "plotLine", frame: "ax", from: [2, 2], to: [4, 6], extend: true },
    ]);
    const line = tags(svg, "line").find((l) => l["data-element-id"] === "fit::line")!;
    for (const key of ["x1", "x2"]) expect(Number(line[key]!)).toBeGreaterThanOrEqual(99);
    for (const key of ["x1", "x2"]) expect(Number(line[key]!)).toBeLessThanOrEqual(501);
    for (const key of ["y1", "y2"]) expect(Number(line[key]!)).toBeGreaterThanOrEqual(99);
    for (const key of ["y1", "y2"]) expect(Number(line[key]!)).toBeLessThanOrEqual(501);
  });

  it("builds a legend from scatter series labels", () => {
    const svg = render([
      { id: "ax", type: "axis", x: 0, y: 0, width: 300, height: 300 },
      { id: "s1", type: "scatter", frame: "ax", points: [[1, 1]], label: "train" },
      { id: "s2", type: "scatter", frame: "ax", points: [[2, 2]], label: "test" },
    ]);
    expect(svg).toContain("train");
    expect(svg).toContain("test");
    expect(tags(svg, "text").some((t) => t["data-element-id"]?.startsWith("legend::"))).toBe(true);
  });
});

describe("labels", () => {
  it("follows the element it targets", () => {
    const at = (y: number) => {
      const svg = render([
        { id: "n", type: "node", label: "N", x: 200, y },
        { id: "l", type: "label", text: "caption", target: "n", position: "above" },
      ]);
      return Number(tags(svg, "text").find((t) => t["data-element-id"] === "l::text")!.y);
    };
    expect(at(400)).toBeGreaterThan(at(100));
  });
});

describe("resolution", () => {
  it("compiles every semantic element down to primitives", () => {
    const resolved = resolve([
      { id: "a", type: "node", label: "A" },
      { id: "b", type: "database", label: "B" },
      { id: "c", type: "connection", from: "a", to: "b" },
    ]);
    const primitives = new Set(["circle", "ellipse", "rectangle", "line", "arrow", "text", "polygon", "polyline", "path"]);
    for (const element of resolved.elements) {
      expect(primitives.has(element.type), `${element.type} should be a primitive`).toBe(true);
    }
  });
});
