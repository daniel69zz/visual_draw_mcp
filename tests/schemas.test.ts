import { describe, expect, it } from "vitest";
import { parseElement, parseScene, validateScene } from "../src/scene/validate.js";
import { VisualError } from "../src/scene/errors.js";

function expectError(fn: () => unknown, code: string): VisualError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(VisualError);
    const error = err as VisualError;
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected a ${code} error, but nothing was thrown`);
}

describe("element validation", () => {
  it("accepts a minimal circle", () => {
    const element = parseElement({ id: "c", type: "circle", x: 10, y: 20, radius: 5 });
    expect(element).toMatchObject({ id: "c", type: "circle", radius: 5 });
  });

  it("rejects a negative radius", () => {
    const error = expectError(
      () => parseElement({ id: "c", type: "circle", x: 0, y: 0, radius: -4 }),
      "INVALID_ELEMENT",
    );
    expect(error.message).toContain("radius");
  });

  it("rejects NaN coordinates", () => {
    expectError(() => parseElement({ id: "c", type: "circle", x: NaN, y: 0, radius: 4 }), "INVALID_ELEMENT");
  });

  it("rejects an unknown element type with the list of valid types", () => {
    const error = expectError(() => parseElement({ id: "x", type: "hypercube" }), "UNKNOWN_ELEMENT_TYPE");
    expect(error.hint).toContain("connection");
    expect(error.message).toContain("hypercube");
  });

  it("rejects a polygon with fewer than three points", () => {
    const error = expectError(
      () => parseElement({ id: "p", type: "polygon", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }),
      "INVALID_ELEMENT",
    );
    expect(error.message).toMatch(/at least 3|too small/i);
  });

  it("rejects a colour that is not a colour", () => {
    expectError(
      () => parseElement({ id: "c", type: "circle", x: 0, y: 0, radius: 4, fill: "url(javascript:alert(1))" }),
      "INVALID_ELEMENT",
    );
  });

  it("rejects path data containing anything but path commands", () => {
    expectError(() => parseElement({ id: "p", type: "path", d: "M0 0 L10 10 <script>" }), "INVALID_ELEMENT");
  });

  it("rejects an id with characters that would break references", () => {
    expectError(() => parseElement({ id: "a b/c", type: "circle", x: 0, y: 0, radius: 4 }), "INVALID_ELEMENT");
  });
});

describe("scene validation", () => {
  it("rejects a negative width", () => {
    expectError(() => parseScene({ width: -100, elements: [] }), "INVALID_SCENE");
  });

  it("rejects duplicate ids", () => {
    const error = expectError(
      () =>
        parseScene({
          elements: [
            { id: "dup", type: "node", label: "A" },
            { id: "dup", type: "node", label: "B" },
          ],
        }),
      "DUPLICATE_ID",
    );
    expect(error.message).toContain("dup");
  });

  it("detects duplicate ids across group boundaries", () => {
    expectError(
      () =>
        parseScene({
          elements: [
            { id: "a", type: "node", label: "A" },
            { id: "g", type: "group", children: [{ id: "a", type: "node", label: "A again" }] },
          ],
        }),
      "DUPLICATE_ID",
    );
  });

  it("rejects a connection to a missing element and suggests real ids", () => {
    const error = expectError(
      () =>
        parseScene({
          elements: [
            { id: "router-1", type: "router", label: "R1" },
            { id: "c1", type: "connection", from: "router-1", to: "router-2" },
          ],
        }),
      "ELEMENT_NOT_FOUND",
    );
    expect(error.message).toContain("'c1'");
    expect(error.message).toContain("router-2");
    expect(error.hint).toContain("router-1");
  });

  it("rejects a connection whose endpoint has no shape", () => {
    expectError(
      () =>
        parseScene({
          elements: [
            { id: "a", type: "node", label: "A" },
            { id: "note", type: "label", text: "hi", x: 0, y: 0 },
            { id: "c", type: "connection", from: "a", to: "note" },
          ],
        }),
      "INVALID_REFERENCE",
    );
  });

  it("rejects a frame that is not an axis", () => {
    expectError(
      () =>
        parseScene({
          elements: [
            { id: "n", type: "node", label: "N" },
            { id: "p", type: "point", x: 1, y: 1, frame: "n" },
          ],
        }),
      "INVALID_REFERENCE",
    );
  });

  it("rejects a label targeting a missing element", () => {
    expectError(
      () => parseScene({ elements: [{ id: "l", type: "label", text: "x", target: "ghost" }] }),
      "ELEMENT_NOT_FOUND",
    );
  });

  it("validateScene reports instead of throwing", () => {
    const result = validateScene({ elements: [{ id: "c", type: "circle", x: 0, y: 0, radius: -1 }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_SCENE");
      expect(result.error.path).toBe("elements.0.radius");
      expect(result.error.message).not.toContain("at Object.");
    }
  });

  it("names an unknown type inside a scene instead of dumping union errors", () => {
    const result = validateScene({ elements: [{ id: "x", type: "nope" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN_ELEMENT_TYPE");
      expect(result.error.message).toContain("nope");
      expect(result.error.hint).toContain("connection");
    }
  });

  it("never leaks a stack trace to the caller", () => {
    const result = validateScene({ elements: [{ id: "x", type: "nope" }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(JSON.stringify(result.error)).not.toMatch(/\bat \w+ \(/);
  });
});
