import type { ThemeName, ThemeOverride } from "./types.js";

/**
 * A Theme is the single source of colour and typography for a scene.
 *
 * Elements refer to tokens ('primary', 'surface', ...) instead of hard-coded
 * colours, so a whole diagram can be restyled without touching its geometry.
 */
export interface Theme {
  name: ThemeName;
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  grid: string;
  border: string;
  fontFamily: string;
  /** Subtle drop shadow, or `null` to disable shadows entirely. */
  shadow: string | null;
  /** Palette cycled through for series that do not pick a colour. */
  series: string[];
}

/**
 * No external font is ever required: the stack falls back through fonts that
 * ship with macOS, Windows, Linux and the browsers used to view the SVG.
 */
const SANS =
  "Inter, 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const THEMES: Record<ThemeName, Theme> = {
  dark: {
    name: "dark",
    background: "#0F1115",
    surface: "#1A1D24",
    foreground: "#F2F4F8",
    muted: "#8B93A5",
    primary: "#8B5CF6",
    secondary: "#22D3EE",
    accent: "#A78BFA",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171",
    grid: "#262B36",
    border: "#333947",
    fontFamily: SANS,
    shadow: "rgba(0,0,0,0.45)",
    series: ["#8B5CF6", "#22D3EE", "#34D399", "#FBBF24", "#F87171", "#F472B6", "#60A5FA"],
  },
  light: {
    name: "light",
    background: "#FFFFFF",
    surface: "#F6F7F9",
    foreground: "#14161A",
    muted: "#5C6474",
    primary: "#6D28D9",
    secondary: "#0891B2",
    accent: "#7C3AED",
    success: "#059669",
    warning: "#B45309",
    danger: "#DC2626",
    grid: "#E6E8EC",
    border: "#CFD4DC",
    fontFamily: SANS,
    shadow: "rgba(15,17,21,0.12)",
    series: ["#6D28D9", "#0891B2", "#059669", "#B45309", "#DC2626", "#DB2777", "#2563EB"],
  },
  blueprint: {
    name: "blueprint",
    background: "#0B2447",
    surface: "#123A6B",
    foreground: "#E6F1FF",
    muted: "#8FB3DC",
    primary: "#5EEAD4",
    secondary: "#93C5FD",
    accent: "#A5F3FC",
    success: "#6EE7B7",
    warning: "#FDE68A",
    danger: "#FCA5A5",
    grid: "#17427A",
    border: "#2C5C99",
    fontFamily: SANS,
    shadow: null,
    series: ["#5EEAD4", "#93C5FD", "#FDE68A", "#FCA5A5", "#C4B5FD", "#6EE7B7", "#F0ABFC"],
  },
  paper: {
    name: "paper",
    background: "#FBF7F0",
    surface: "#F2EADC",
    foreground: "#2A241C",
    muted: "#7A6C57",
    primary: "#B45309",
    secondary: "#0F766E",
    accent: "#9A3412",
    success: "#15803D",
    warning: "#A16207",
    danger: "#B91C1C",
    grid: "#E5DBC7",
    border: "#D3C4A8",
    fontFamily: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
    shadow: "rgba(42,36,28,0.14)",
    series: ["#B45309", "#0F766E", "#9A3412", "#15803D", "#7C2D12", "#1E40AF", "#86198F"],
  },
};

export const DEFAULT_THEME: ThemeName = "dark";

export function resolveTheme(name?: ThemeName, overrides?: ThemeOverride): Theme {
  const base = THEMES[name ?? DEFAULT_THEME];
  if (!overrides) return base;
  const merged: Theme = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && key in merged) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

const TOKEN_KEYS = [
  "background",
  "surface",
  "foreground",
  "muted",
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "grid",
  "border",
] as const;

/** Turns a token like 'primary' into a concrete colour; passes real colours through. */
export function color(theme: Theme, value: string | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  if (value === "none" || value === "transparent") return "none";
  if ((TOKEN_KEYS as readonly string[]).includes(value)) {
    return theme[value as (typeof TOKEN_KEYS)[number]];
  }
  return value;
}

/** Deterministic colour for the n-th unstyled series. */
export function seriesColor(theme: Theme, index: number): string {
  return theme.series[index % theme.series.length] ?? theme.primary;
}

/** Mixes a colour towards another by `amount` (0..1). Hex only; other formats pass through. */
export function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  if (!a || !b) return from;
  const ch = (i: number) => Math.round(a[i]! + (b[i]! - a[i]!) * amount);
  return `#${[ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function parseHex(value: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(value.trim());
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}
