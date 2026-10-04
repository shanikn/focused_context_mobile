import { TextStyle } from "react-native";

// Design tokens for the redesign (see redesign.md). Screens adopt these step by step.

export const colors = {
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
} as const;

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

export const type = {
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
