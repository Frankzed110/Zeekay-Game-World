// Design tokens for Zeekay Game World — dark-first expressive fantasy HUD.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";

// RN 0.88 dropped StyleSheet.NamedStyles from its public types; local equivalent.
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export type ColorScheme = "light" | "dark";

// Dark-first game: both schemes share the expressive dark palette.
const dark = {
  surface: "#121318",
  onSurface: "#F4F5F7",
  surfaceSecondary: "#1C1E26",
  onSurfaceSecondary: "#E2E4EB",
  surfaceTertiary: "#262935",
  onSurfaceTertiary: "#C5C8D4",
  surfaceInverse: "#FAFAFC",
  onSurfaceInverse: "#121318",
  muted: "#8C91A3",

  brand: "#E05A36",
  onBrand: "#FAFAFC",
  brandPrimary: "#E05A36",
  onBrandPrimary: "#FAFAFC",
  brandSecondary: "#D48B32",
  onBrandSecondary: "#121318",
  brandTertiary: "#33221C",
  onBrandTertiary: "#F2A188",

  success: "#36A369",
  onSuccess: "#FAFAFC",
  warning: "#E69533",
  onWarning: "#121318",
  error: "#D94E4E",
  onError: "#FAFAFC",
  info: "#4A82D0",
  onInfo: "#FAFAFC",

  border: "#2B2E3D",
  borderStrong: "#E05A36",
  divider: "#212430",
};

const light = dark;

export type ThemeColors = typeof dark;
export const defaultScheme = "dark" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

// Spacing / radius / type tokens (8pt grid)
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;
export const fonts = {
  display: "Outfit-Bold",
  displayHeavy: "Outfit-ExtraBold",
  displaySemi: "Outfit-SemiBold",
  body: "PlusJakartaSans-Regular",
  bodySemi: "PlusJakartaSans-SemiBold",
  bodyBold: "PlusJakartaSans-Bold",
} as const;
export const TOUCH = 44;
