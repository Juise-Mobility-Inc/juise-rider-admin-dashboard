import type { SchoolColorScheme } from "./api";
import { mixHexColors } from "./colors";

/**
 * A faithful port of the customer app's `resolveJuiseColors`
 * (juise-customer-app/assets/colors.ts) so the school-profile "App preview"
 * derives the same surfaces/text/borders the real app does from a school's
 * five brand colors. Keep in sync with that file.
 */

const DEFAULT_PRIMARY = "#27CC5E";
const DEFAULT_BACKGROUND = "#010C05";
const DEFAULT_TEXT = "#E6EAE8";
const DEFAULT_ACCENT = "#EEC253";
const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#08140D";

function normalizeHex(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function relativeLuminance(hex: string): number {
  const channel = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function readableOn(background: string, light: string, dark: string): string {
  return relativeLuminance(background) > 0.5 ? dark : light;
}

export type AppPreviewTheme = {
  primary: string;
  primaryTint: string;
  background: string;
  text: string;
  accent: string;
  secondary: string;
  fadedText: string;
  surface: string;
  surfaceElevated: string;
  borderMuted: string;
  borderAccent: string;
  onPrimary: string;
};

export function resolveAppPreviewTheme(
  scheme?: SchoolColorScheme | null,
): AppPreviewTheme {
  const primary = normalizeHex(scheme?.primary) ?? DEFAULT_PRIMARY;
  const background = normalizeHex(scheme?.background) ?? DEFAULT_BACKGROUND;
  const text =
    normalizeHex(scheme?.text) ?? readableOn(background, DEFAULT_TEXT, DARK_TEXT);
  const secondary =
    normalizeHex(scheme?.secondary) ?? mixHexColors(primary, background, 0.34);
  const accent = normalizeHex(scheme?.accent) ?? DEFAULT_ACCENT;

  return {
    primary,
    // ~7% primary over the background — the app draws this with an alpha
    // hex (`${green}0D`); an opaque mix reads the same on the opaque phone.
    primaryTint: mixHexColors(background, primary, 0.07),
    background,
    text,
    accent,
    secondary,
    fadedText: mixHexColors(background, text, 0.68),
    surface: mixHexColors(background, text, 0.08),
    surfaceElevated: mixHexColors(background, text, 0.14),
    borderMuted: mixHexColors(background, text, 0.24),
    borderAccent: mixHexColors(background, primary, 0.42),
    onPrimary: readableOn(primary, LIGHT_TEXT, background),
  };
}
