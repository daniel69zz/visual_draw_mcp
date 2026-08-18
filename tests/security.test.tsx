import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SceneRenderer } from "../src/ui/components/SceneRenderer.js";
import { WIDGET_HTML } from "../src/mcp/widget.js";
import { escapeAttr, escapeText, node, serialize } from "../src/renderer/index.js";
import { parseScene } from "../src/scene/validate.js";
import { render, scene } from "./helpers.js";

describe("output escaping", () => {
  it("escapes markup in text content", () => {
    const svg = render([
      { id: "t", type: "text", x: 0, y: 0, text: "<script>alert('x')</script>" },
    ]);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("escapes ampersands and quotes without double-escaping", () => {
    expect(escapeText("a & b < c")).toBe("a &amp; b &lt; c");
    expect(escapeAttr('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes markup inside labels of any element", () => {
    const svg = render([
      { id: "n", type: "node", label: "</text><script>bad()</script>", x: 0, y: 0 },
    ]);
    expect(svg).not.toMatch(/<script/);
  });

  it("escapes a title that came from the model", () => {
    const svg = render([{ id: "c", type: "circle", x: 0, y: 0, radius: 5 }], {
      title: "</title><script>x</script>",
    });
    expect(svg).not.toMatch(/<script/);
  });
});

describe("renderer allow-lists", () => {
  it("drops attributes that are not on the allow-list", () => {
    const built = node("rect", { x: 1, y: 2, onclick: "alert(1)", href: "javascript:x" } as never);
    expect(built.attrs).toEqual({ x: 1, y: 2 });
  });

  it("drops tags that are not on the allow-list", () => {
    expect(serialize({ tag: "script" as never, attrs: {}, text: "alert(1)" })).toBe("");
  });

  it("drops non-finite numeric attributes", () => {
    const built = node("circle", { cx: NaN, cy: Infinity, r: 5 });
    expect(built.attrs).toEqual({ r: 5 });
  });

  it("never emits an event handler or an external reference", () => {
    const svg = render([
      { id: "n", type: "node", label: "A", x: 0, y: 0 },
      { id: "b", type: "node", label: "B", x: 300, y: 0 },
      { id: "c", type: "connection", from: "n", to: "b", label: "x" },
    ]);
    expect(svg).not.toMatch(/\son[a-z]+=/i);
    expect(svg).not.toMatch(/href=/i);
    expect(svg).not.toMatch(/javascript:/i);
    expect(svg).not.toMatch(/<foreignObject/i);
  });

  it("rejects path data before it can reach the output", () => {
    expect(() =>
      parseScene({ elements: [{ id: "p", type: "path", d: 'M0 0" onload="alert(1)' }] }),
    ).toThrow();
  });
});

describe("React renderer", () => {
  it("produces the same picture as the string renderer", () => {
    const s = scene([
      { id: "a", type: "node", label: "A" },
      { id: "b", type: "database", label: "B" },
      { id: "c", type: "connection", from: "a", to: "b", label: "SQL" },
    ]);
    const markup = renderToStaticMarkup(<SceneRenderer scene={s} />);
    expect(markup).toContain("<svg");
    expect(markup).toContain("SQL");
    // Same primitives, same count - one geometry pipeline, two backends.
    const stringSvg = render(s.elements as never, { id: s.id });
    const count = (source: string, tag: string) => source.split(`<${tag}`).length - 1;
    for (const tag of ["path", "rect", "text", "ellipse"]) {
      expect(count(markup, tag)).toBe(count(stringSvg, tag));
    }
  });

  it("escapes model text in the React output too", () => {
    const s = scene([{ id: "t", type: "text", x: 0, y: 0, text: "<img onerror=x>" }]);
    const markup = renderToStaticMarkup(<SceneRenderer scene={s} />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
  });
});

describe("ChatGPT widget", () => {
  it("never assigns markup to innerHTML", () => {
    expect(WIDGET_HTML).not.toMatch(/\.innerHTML\s*=/);
    expect(WIDGET_HTML).not.toMatch(/insertAdjacentHTML/);
  });

  it("never evaluates strings", () => {
    expect(WIDGET_HTML).not.toMatch(/\beval\s*\(/);
    expect(WIDGET_HTML).not.toMatch(/new\s+Function\s*\(/);
  });

  it("re-checks tags and attributes on the way in", () => {
    expect(WIDGET_HTML).toContain("ALLOWED_TAGS");
    expect(WIDGET_HTML).toContain("ALLOWED_ATTRS");
    expect(WIDGET_HTML).toContain("createElementNS");
  });

  it("is self-contained: no external scripts, styles or fonts", () => {
    expect(WIDGET_HTML).not.toMatch(/<script[^>]+src=/i);
    expect(WIDGET_HTML).not.toMatch(/<link[^>]+href=/i);
    expect(WIDGET_HTML).not.toMatch(/@import/);
  });
});
