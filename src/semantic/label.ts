import { color } from "../scene/theme.js";
import type { LabelElement, PrimitiveElement } from "../scene/types.js";
import { fontWeightValue, layoutText } from "../utils/text.js";
import type { ResolveContext } from "./context.js";

/**
 * `label` is an annotation that can be attached to another element by id.
 * When the target moves, the caption follows it - the model never recomputes
 * the caption position.
 */
export const expandLabel = (element: LabelElement, ctx: ResolveContext): PrimitiveElement[] => {
  const fontSize = element.fontSize ?? 13;
  const offset = element.offset ?? 14;
  const measured = layoutText(element.text, {
    fontSize,
    ...(element.maxWidth ? { maxWidth: element.maxWidth } : {}),
    bold: fontWeightValue(element.fontWeight, 500) >= 600,
  });

  let x = element.x ?? 0;
  let y = element.y ?? 0;
  let align: "start" | "middle" | "end" = "middle";

  const target = element.target ? ctx.boxes.get(element.target) : undefined;
  if (target) {
    const position = element.position ?? "above";
    switch (position) {
      case "above":
        x = target.cx;
        y = target.y - offset - measured.height / 2;
        break;
      case "below":
        x = target.cx;
        y = target.y + target.height + offset + measured.height / 2;
        break;
      case "left":
        x = target.x - offset;
        y = target.cy;
        align = "end";
        break;
      case "right":
        x = target.x + target.width + offset;
        y = target.cy;
        align = "start";
        break;
      case "center":
        x = target.cx;
        y = target.cy;
        break;
    }
  }

  return [
    {
      id: ctx.derivedId(element.id, "text"),
      type: "text",
      x,
      y,
      text: element.text,
      fontSize,
      color: color(ctx.theme, element.color, ctx.theme.foreground),
      align,
      baseline: "middle",
      ...(element.fontWeight !== undefined ? { fontWeight: element.fontWeight } : {}),
      ...(element.background ? { background: color(ctx.theme, element.background, ctx.theme.background) } : {}),
      ...(element.maxWidth ? { maxWidth: element.maxWidth } : {}),
    },
  ];
};
