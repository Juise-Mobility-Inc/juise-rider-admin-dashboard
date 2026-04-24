import type { SchoolColorScheme } from "./api";

export const juiseColors = {
  red: "#FF5C5C",
  green: "#27CC5E",
  mediumgreen: "#28AE4C",
  darkGreen: "#03200D",
  darkGrey: "#010C05",
  mediumGrey: "#1e2124",
  gold: "#EEC253",
  lightGrey: "#424549",
  text: "#E6EAE8",
  fadedText: "#b5b5b5",
  disabledText: "#999999",
} as const;

const schoolColorHexPattern = /^#(?:[0-9a-fA-F]{6})$/;

export const defaultSchoolColorScheme: Required<SchoolColorScheme> = {
  primary: juiseColors.green,
  secondary: juiseColors.mediumGrey,
  accent: juiseColors.gold,
  background: juiseColors.darkGreen,
  text: juiseColors.text,
};

export type DashboardThemeColors = Required<SchoolColorScheme> & {
  fadedText: string;
  disabledText: string;
  onPrimary: string;
  onAccent: string;
  surface: string;
  surfaceElevated: string;
  surfaceAccent: string;
  borderMuted: string;
  borderAccent: string;
  selectedSurface: string;
};

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function resolveOptionalHexColor(value?: string): string | null {
  const trimmed = value?.trim() ?? "";
  return schoolColorHexPattern.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function resolveHexColor(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim() ?? "";
  return schoolColorHexPattern.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

export function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = resolveHexColor(color, "#000000").slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function hexToRgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}

export function mixHexColors(base: string, tint: string, weight: number): string {
  const normalizedWeight = Math.min(1, Math.max(0, weight));
  const baseRgb = hexToRgb(base);
  const tintRgb = hexToRgb(tint);
  const r = clampChannel(
    baseRgb.r + (tintRgb.r - baseRgb.r) * normalizedWeight,
  );
  const g = clampChannel(
    baseRgb.g + (tintRgb.g - baseRgb.g) * normalizedWeight,
  );
  const b = clampChannel(
    baseRgb.b + (tintRgb.b - baseRgb.b) * normalizedWeight,
  );
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getRelativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  const [sr, sg, sb] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
}

export function getContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(
  background: string,
  options: {
    preferred?: string | null;
    light?: string;
    dark?: string;
    minimumContrast?: number;
  } = {},
): string {
  const preferredColor = resolveOptionalHexColor(options.preferred ?? undefined);
  const lightColor = resolveHexColor(options.light, juiseColors.text);
  const darkColor = resolveHexColor(options.dark, juiseColors.darkGrey);
  const minimumContrast = options.minimumContrast ?? 4.5;
  const candidates = Array.from(
    new Set([preferredColor, darkColor, lightColor].filter(Boolean)),
  ) as string[];

  const preferredContrast = preferredColor
    ? getContrastRatio(preferredColor, background)
    : 0;
  if (preferredColor && preferredContrast >= minimumContrast) {
    return preferredColor;
  }

  return candidates.sort((left, right) => {
    const leftContrast = getContrastRatio(left, background);
    const rightContrast = getContrastRatio(right, background);
    return rightContrast - leftContrast;
  })[0];
}

export function normalizeSchoolColorScheme(
  value?: SchoolColorScheme,
): SchoolColorScheme {
  return {
    primary: resolveHexColor(value?.primary, defaultSchoolColorScheme.primary),
    secondary: resolveHexColor(
      value?.secondary,
      defaultSchoolColorScheme.secondary,
    ),
    accent: resolveHexColor(value?.accent, defaultSchoolColorScheme.accent),
    background: resolveHexColor(
      value?.background,
      defaultSchoolColorScheme.background,
    ),
    text: resolveHexColor(value?.text, defaultSchoolColorScheme.text),
  };
}

export function buildDashboardThemeColors(
  colorScheme?: SchoolColorScheme,
): DashboardThemeColors {
  const primary = resolveHexColor(
    colorScheme?.primary,
    defaultSchoolColorScheme.primary,
  );
  const background = resolveHexColor(
    colorScheme?.background,
    defaultSchoolColorScheme.background,
  );
  const text = getReadableTextColor(background, {
    preferred: colorScheme?.text,
    light: defaultSchoolColorScheme.text,
    dark: juiseColors.darkGrey,
    minimumContrast: 4.5,
  });
  const secondary =
    resolveOptionalHexColor(colorScheme?.secondary) ??
    mixHexColors(primary, background, 0.34);
  const accent =
    resolveOptionalHexColor(colorScheme?.accent) ??
    defaultSchoolColorScheme.accent;
  const fadedText = mixHexColors(background, text, 0.68);
  const disabledText = mixHexColors(background, text, 0.52);
  const surface = mixHexColors(background, text, 0.08);
  const surfaceElevated = mixHexColors(background, text, 0.14);
  const surfaceAccent = mixHexColors(background, primary, 0.18);
  const borderMuted = mixHexColors(background, text, 0.24);
  const borderAccent = mixHexColors(background, primary, 0.42);
  const selectedSurface = mixHexColors(background, primary, 0.24);

  return {
    primary,
    secondary,
    accent,
    background,
    text,
    fadedText,
    disabledText,
    onPrimary: getReadableTextColor(primary, {
      light: defaultSchoolColorScheme.text,
      dark: juiseColors.darkGrey,
      minimumContrast: 4.5,
    }),
    onAccent: getReadableTextColor(accent, {
      light: defaultSchoolColorScheme.text,
      dark: juiseColors.darkGrey,
      minimumContrast: 4.5,
    }),
    surface,
    surfaceElevated,
    surfaceAccent,
    borderMuted,
    borderAccent,
    selectedSurface,
  };
}
