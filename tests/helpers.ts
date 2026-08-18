import { renderScene } from "../src/renderer/index.js";
import { resolveScene } from "../src/scene/resolve.js";
import { parseScene } from "../src/scene/validate.js";
import type { Scene, VisualElement } from "../src/scene/types.js";

/**
 * Test helpers.
 *
 * The tests assert on structure - "there is a <circle> with r=40", "the arrow
 * ends at the border, not the centre" - rather than on whole-document
 * snapshots, which would break on every cosmetic change and tell us nothing.
 */

export function scene(elements: VisualElement[], overrides: Partial<Scene> = {}): Scene {
  return parseScene({ id: "test-scene", elements, ...overrides });
}

export function render(elements: VisualElement[], overrides: Partial<Scene> = {}): string {
  return renderScene(scene(elements, overrides), { idSeed: "test" });
}

export function resolve(elements: VisualElement[], overrides: Partial<Scene> = {}) {
  return resolveScene(scene(elements, overrides));
}

/** Every `<tag ...>` occurrence with its attributes parsed into a map. */
export function tags(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*)>`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(svg)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /([\w:-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(match[1]!)) !== null) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

export function firstTag(svg: string, tag: string): Record<string, string> | undefined {
  return tags(svg, tag)[0];
}

/** Numbers in a path's `d` attribute, as coordinate pairs. */
export function pathPoints(d: string): [number, number][] {
  const nums = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const pairs: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pairs.push([nums[i]!, nums[i + 1]!]);
  return pairs;
}
