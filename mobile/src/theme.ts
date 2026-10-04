import { TextStyle } from "react-native";

// Design tokens (see redesign.md). Colors come in a light and a dark palette
// with the same names; components read the active one with useTheme()
// (src/ThemeContext.tsx) instead of importing a palette directly.

export type ColorScheme = "light" | "dark";

export const lightColors = {
  background: "#F3F5F0",
  surface: "#FFFFFF",
  border: "#E1E6DE",
  text: "#17211B",
  textMuted: "#56635B",
  primary: "#1F7A3A", // filled buttons, selected chips, switches
  onPrimary: "#FFFFFF",
  primaryDark: "#145C2A", // green text/icons on light green
  primarySoft: "#DCEEDD", // light green fills
  chip: "#E6EAE2", // unselected chip fill
  danger: "#B3261E",
};

export type Palette = typeof lightColors;

export const darkColors: Palette = {
  background: "#0F1411",
  surface: "#182019",
  border: "#2C372F",
  text: "#E6ECE7",
  textMuted: "#A3B0A7",
  primary: "#6CC48A", // lighter green that reads on dark backgrounds
  onPrimary: "#0B2414", // dark text on the light green
  primaryDark: "#A9E2B9", // "dark green" role = green text, light on dark
  primarySoft: "#1F3A28", // dark green fills
  chip: "#26312A",
  danger: "#F2B8B5",
};

export const radius = {
  card: 20,
  noteCard: 16,
  chip: 22, // pill
  iconTile: 12,
  fab: 18,
} as const;

export const spacing = {
  screen: 16, // screen side padding
  cardGap: 12, // between cards
  noteGap: 8, // between note cards
} as const;

export const fonts = {
  display: "BricolageGrotesque_700Bold",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemi: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
} as const;

export const MIN_TOUCH_TARGET = 44;

function makeType(colors: Palette) {
  return {
    screenTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 44, color: colors.text },
    sectionLabel: {
      fontFamily: fonts.bodyBold,
      fontSize: 13,
      lineHeight: 18,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      color: colors.textMuted,
    },
    cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.text },
    body: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 22, color: colors.text },
    caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
    chip: { fontFamily: fonts.bodySemi, fontSize: 14 },
  } satisfies Record<string, TextStyle>;
}

export interface Theme {
  scheme: ColorScheme;
  dark: boolean;
  colors: Palette;
  type: ReturnType<typeof makeType>;
}

const THEMES: Record<ColorScheme, Theme> = {
  light: { scheme: "light", dark: false, colors: lightColors, type: makeType(lightColors) },
  dark: { scheme: "dark", dark: true, colors: darkColors, type: makeType(darkColors) },
};

export function makeTheme(scheme: ColorScheme): Theme {
  return THEMES[scheme];
}
