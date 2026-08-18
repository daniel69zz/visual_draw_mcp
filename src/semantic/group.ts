import { GROUP_HEADER } from "../layout/index.js";
import { color, mix } from "../scene/theme.js";
import type { GroupElement, PrimitiveElement } from "../scene/types.js";
import type { ResolveContext } from "./context.js";

/**
 * A group draws a labelled boundary - "AWS", "VLAN 10", "Data layer".
 * Its children are expanded separately by the resolver; this only produces the
 * frame, which is why it sits on the bottom draw layer.
 */
export const expandGroup = (element: GroupElement, ctx: ResolveContext): PrimitiveElement[] => {
  const box = ctx.boxes.get(element.id);
  if (!box) return [];
  const showFrame = element.frame ?? true;
  if (!showFrame) return [];

  const stroke = color(ctx.theme, element.stroke, ctx.theme.border);
  const fill = element.fill
    ? color(ctx.theme, element.fill, ctx.theme.surface)
    : mix(ctx.theme.background, ctx.theme.foreground, 0.04);

  const out: PrimitiveElement[] = [
    {
      id: ctx.derivedId(element.id, "frame"),
      type: "rectangle",
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      radius: 16,
      fill,
      stroke,
      strokeWidth: 1.4,
      dash: element.dash ?? "dashed",
      ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
    },
  ];

  if (element.label) {
    out.push({
      id: ctx.derivedId(element.id, "label"),
      type: "text",
      x: box.x + 18,
      y: box.y + GROUP_HEADER / 2 + 6,
      text: element.label,
      fontSize: 13,
      fontWeight: 600,
      color: ctx.theme.muted,
      align: "start",
      baseline: "middle",
    });
  }

  return out;
};
