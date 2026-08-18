/**
 * Text metrics without a font engine.
 *
 * SVG has no automatic wrapping, and we refuse to make the model compute line
 * breaks. So we estimate advance widths from character classes. The estimate is
 * within a few percent for the sans-serif stacks we ship, which is enough to
 * size boxes and wrap paragraphs convincingly.
 */

const NARROW = new Set("iljtfIr!|.,;:'`()[]{}/\\ ".split(""));
const WIDE = new Set("mwMW@%".split(""));
const UPPER = /[A-Z0-9]/;

/** Average advance of one character as a fraction of the font size. */
function charFactor(ch: string): number {
  if (NARROW.has(ch)) return 0.34;
  if (WIDE.has(ch)) return 0.92;
  if (UPPER.test(ch)) return 0.62;
  // CJK and other full-width ranges.
  if (ch.codePointAt(0)! > 0x2e80) return 1;
  return 0.53;
}

export function measureText(text: string, fontSize: number, bold = false): number {
  let total = 0;
  for (const ch of text) total += charFactor(ch);
  return total * fontSize * (bold ? 1.06 : 1);
}

export interface WrappedText {
  lines: string[];
  width: number;
  height: number;
  lineHeight: number;
}

/**
 * Splits on explicit `\n` first (those are always honoured), then wraps each
 * paragraph to `maxWidth` when one is given. Words longer than the limit are
 * broken rather than overflowing.
 */
export function layoutText(
  text: string,
  options: { fontSize: number; lineHeight?: number; maxWidth?: number; bold?: boolean } = {
    fontSize: 14,
  },
): WrappedText {
  const fontSize = options.fontSize;
  const lineHeight = (options.lineHeight ?? 1.35) * fontSize;
  const bold = options.bold ?? false;
  const paragraphs = String(text).split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!options.maxWidth) {
      lines.push(paragraph);
      continue;
    }
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureText(candidate, fontSize, bold) <= options.maxWidth || current === "") {
        if (measureText(candidate, fontSize, bold) > options.maxWidth && current === "") {
          // A single word wider than the limit: hard-break it.
          let chunk = "";
          for (const ch of word) {
            if (measureText(chunk + ch, fontSize, bold) > options.maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
          continue;
        }
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  if (lines.length === 0) lines.push("");
  const width = Math.max(...lines.map((l) => measureText(l, fontSize, bold)));
  return { lines, width, height: lines.length * lineHeight, lineHeight };
}

/** Normalises the many ways a font weight can be written into a CSS value. */
export function fontWeightValue(weight: string | number | undefined, fallback = 500): number {
  if (weight === undefined) return fallback;
  if (typeof weight === "number") return weight;
  switch (weight) {
    case "normal":
      return 400;
    case "medium":
      return 500;
    case "semibold":
      return 600;
    case "bold":
      return 700;
    default:
      return fallback;
  }
}

export function isBold(weight: string | number | undefined): boolean {
  return fontWeightValue(weight, 400) >= 600;
}
