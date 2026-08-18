import { node, type SvgNode } from "./svgNode.js";

/**
 * Arrowheads are SVG `<marker>` definitions, generated on demand - one per
 * colour actually used. The model never describes an arrowhead; it says
 * `heads: "end"` and this module makes it exist.
 */
export class Defs {
  private readonly markers = new Map<string, string>();
  private shadow = false;

  constructor(private readonly prefix: string) {}

  /** Returns the `url(#...)` reference for an arrowhead of the given colour. */
  arrow(color: string): string {
    let id = this.markers.get(color);
    if (!id) {
      id = `${this.prefix}-arrow-${this.markers.size}`;
      this.markers.set(color, id);
    }
    return `url(#${id})`;
  }

  useShadow(): string {
    this.shadow = true;
    return `url(#${this.prefix}-shadow)`;
  }

  build(shadowColor: string | null): SvgNode | null {
    const children: SvgNode[] = [];

    for (const [color, id] of this.markers) {
      children.push(
        node(
          "marker",
          {
            id,
            markerWidth: 12,
            markerHeight: 12,
            refX: 10.5,
            refY: 6,
            // `auto-start-reverse` lets one definition serve both ends.
            orient: "auto-start-reverse",
            markerUnits: "userSpaceOnUse",
          },
          [node("path", { d: "M 1 1.5 L 11 6 L 1 10.5 Z", fill: color })],
        ),
      );
    }

    if (this.shadow && shadowColor) {
      children.push(
        node("filter", { id: `${this.prefix}-shadow`, x: "-20%", y: "-20%", width: "140%", height: "140%" }, [
          node("feDropShadow", {
            dy: 2,
            stdDeviation: 3,
            "flood-color": shadowColor,
            "flood-opacity": 0.55,
          }),
        ]),
      );
    }

    if (children.length === 0) return null;
    return node("defs", {}, children);
  }
}

/** Stable, collision-free prefix for the ids inside one document. */
export function idPrefix(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return `vm${h.toString(36)}`;
}
