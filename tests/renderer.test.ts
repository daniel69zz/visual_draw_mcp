import { describe, expect, it } from "vitest";
import { firstTag, pathPoints, render, resolve, tags } from "./helpers.js";

describe("primitive rendering", () => {
  it("renders a circle at its centre with the right radius", () => {
    const svg = render([{ id: "c", type: "circle", x: 200, y: 150, radius: 40, fill: "#8B5CF6" }]);
    const circle = firstTag(svg, "circle");
    expect(circle).toMatchObject({ cx: "200", cy: "150", r: "40", fill: "#8B5CF6" });
  });

  it("resolves a theme token to a real colour", () => {
    const svg = render([{ id: "c", type: "circle", x: 0, y: 0, radius: 10, fill: "primary" }]);
    expect(firstTag(svg, "circle")!.fill).toBe("#8B5CF6");
    expect(svg).not.toContain('fill="primary"');
  });

  it("renders a rectangle from its top-left corner by default", () => {
    const svg = render([{ id: "r", type: "rectangle", x: 40, y: 60, width: 120, height: 80 }]);
    const rect = tags(svg, "rect").find((r) => r.width === "120");
    expect(rect).toMatchObject({ x: "40", y: "60", width: "120", height: "80" });
  });

  it("centres a rectangle when anchor is 'center'", () => {
    const svg = render([
      { id: "r", type: "rectangle", x: 100, y: 100, width: 60, height: 40, anchor: "center" },
    ]);
    const rect = tags(svg, "rect").find((r) => r.width === "60");
    expect(rect).toMatchObject({ x: "70", y: "80" });
  });

  it("clamps the corner radius to half the smaller side", () => {
    const svg = render([{ id: "r", type: "rectangle", x: 0, y: 0, width: 40, height: 20, radius: 120 }]);
    const rect = tags(svg, "rect").find((r) => r.width === "40");
    expect(Number(rect!.rx)).toBe(10);
  });

  it("renders a line between the two points", () => {
    const svg = render([{ id: "l", type: "line", x1: 10, y1: 20, x2: 300, y2: 220, stroke: "#fff" }]);
    const line = tags(svg, "line").find((l) => l.x1 === "10");
    expect(line).toMatchObject({ x1: "10", y1: "20", x2: "300", y2: "220", stroke: "#fff" });
  });

  it("turns a dashed stroke into a dasharray", () => {
    const svg = render([{ id: "l", type: "line", x1: 0, y1: 0, x2: 100, y2: 0, dash: "dashed", strokeWidth: 2 }]);
    const line = tags(svg, "line").find((l) => l.x2 === "100");
    expect(line!["stroke-dasharray"]).toBeTruthy();
  });

  it("renders a polygon with all of its points", () => {
    const svg = render([
      {
        id: "p",
        type: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 25, y: 40 },
        ],
      },
    ]);
    expect(firstTag(svg, "polygon")!.points).toBe("0,0 50,0 25,40");
  });
});

describe("arrows", () => {
  it("generates a marker definition instead of a hand-drawn head", () => {
    const svg = render([{ id: "a", type: "arrow", x1: 100, y1: 200, x2: 500, y2: 200 }]);
    expect(svg).toContain("<marker");
    expect(svg).toMatch(/marker-end="url\(#/);
  });

  it("uses one marker per colour, reused across arrows", () => {
    const svg = render([
      { id: "a1", type: "arrow", x1: 0, y1: 0, x2: 100, y2: 0, stroke: "#ff0000" },
      { id: "a2", type: "arrow", x1: 0, y1: 40, x2: 100, y2: 40, stroke: "#ff0000" },
      { id: "a3", type: "arrow", x1: 0, y1: 80, x2: 100, y2: 80, stroke: "#00ff00" },
    ]);
    expect(tags(svg, "marker")).toHaveLength(2);
  });

  it("puts markers at both ends when heads is 'both'", () => {
    const svg = render([{ id: "a", type: "arrow", x1: 0, y1: 0, x2: 100, y2: 0, heads: "both" }]);
    expect(svg).toMatch(/marker-start="url\(#/);
    expect(svg).toMatch(/marker-end="url\(#/);
  });

  it("draws no marker when heads is 'none'", () => {
    const svg = render([{ id: "a", type: "arrow", x1: 0, y1: 0, x2: 100, y2: 0, heads: "none" }]);
    expect(svg).not.toContain("<marker");
  });

  it("bends into a quadratic curve when `curve` is set", () => {
    const straight = render([{ id: "a", type: "arrow", x1: 0, y1: 0, x2: 200, y2: 0 }]);
    const curved = render([{ id: "a", type: "arrow", x1: 0, y1: 0, x2: 200, y2: 0, curve: 0.4 }]);
    expect(straight).toMatch(/d="M 0 0 L 200 0"/);
    expect(curved).toMatch(/ Q /);
  });
});

describe("text", () => {
  it("emits one tspan per explicit line", () => {
    const svg = render([
      { id: "t", type: "text", x: 300, y: 200, text: "Linear\nDiscriminant\nAnalysis" },
    ]);
    const spans = tags(svg, "tspan");
    expect(spans).toHaveLength(3);
    expect(svg).toContain("Discriminant");
  });

  it("stacks the lines downwards with consistent spacing", () => {
    const svg = render([{ id: "t", type: "text", x: 0, y: 100, text: "one\ntwo\nthree", fontSize: 20 }]);
    const ys = tags(svg, "tspan").map((s) => Number(s.y));
    expect(ys[1]! - ys[0]!).toBeCloseTo(ys[2]! - ys[1]!, 3);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(20);
  });

  it("wraps automatically when maxWidth is set", () => {
    const svg = render([
      {
        id: "t",
        type: "text",
        x: 0,
        y: 0,
        text: "the quick brown fox jumps over the lazy dog",
        fontSize: 14,
        maxWidth: 90,
      },
    ]);
    expect(tags(svg, "tspan").length).toBeGreaterThan(2);
  });

  it("honours alignment", () => {
    const svg = render([{ id: "t", type: "text", x: 0, y: 0, text: "hi", align: "end" }]);
    expect(firstTag(svg, "text")!["text-anchor"]).toBe("end");
  });

  it("rotates without the caller writing a transform", () => {
    const svg = render([{ id: "t", type: "text", x: 50, y: 60, text: "y", rotate: -90 }]);
    expect(firstTag(svg, "text")!.transform).toBe("rotate(-90 50 60)");
  });
});

describe("svg document", () => {
  it("auto-fits the viewBox around the content", () => {
    const resolved = resolve([{ id: "c", type: "circle", x: 1000, y: 800, radius: 20 }]);
    expect(resolved.viewBox.x).toBeGreaterThan(800);
    expect(resolved.viewBox.width).toBeLessThan(300);
  });

  it("respects the given canvas when autoFit is off", () => {
    const resolved = resolve([{ id: "c", type: "circle", x: 50, y: 50, radius: 20 }], {
      width: 900,
      height: 600,
      autoFit: false,
    });
    expect(resolved.viewBox).toMatchObject({ x: 0, y: 0, width: 900, height: 600 });
  });

  it("paints a background rectangle covering the viewBox", () => {
    const svg = render([{ id: "c", type: "circle", x: 0, y: 0, radius: 10 }], { background: "#123456" });
    expect(tags(svg, "rect").some((r) => r.fill === "#123456")).toBe(true);
  });

  it("declares the SVG namespace and an accessible label", () => {
    const svg = render([{ id: "c", type: "circle", x: 0, y: 0, radius: 10 }], { title: "My diagram" });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('aria-label="My diagram"');
  });

  it("draws connections underneath nodes regardless of author order", () => {
    const svg = render([
      { id: "c", type: "connection", from: "a", to: "b" },
      { id: "a", type: "node", label: "A" },
      { id: "b", type: "node", label: "B" },
    ]);
    const connectionAt = svg.indexOf('data-element-id="c::line"');
    const nodeAt = svg.indexOf('data-element-id="a::body"');
    expect(connectionAt).toBeGreaterThan(-1);
    expect(connectionAt).toBeLessThan(nodeAt);
  });

  it("keeps a stable path shape for smoothed orthogonal routes", () => {
    const svg = render([
      { id: "a", type: "node", label: "A", x: 100, y: 100 },
      { id: "b", type: "node", label: "B", x: 500, y: 300 },
      { id: "c", type: "connection", from: "a", to: "b", routing: "orthogonal" },
    ]);
    const path = tags(svg, "path").find((p) => p["data-element-id"] === "c::line");
    expect(path).toBeDefined();
    expect(pathPoints(path!.d!).length).toBeGreaterThan(2);
  });
});
