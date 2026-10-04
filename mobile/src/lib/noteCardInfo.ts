import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Note } from "../types/notes";
import { lightColors, Palette } from "../theme";
import { CategoryColors, colorFor, contrastRatio, textColorFor } from "./categoryColors";
import { GENERAL } from "./folderOrder";
import { locationLabel, noteTime } from "./noteLabels";
import { resolveCurrentLocation, ServerPlace, UNKNOWN } from "./userPlaces";

// What a note card on the notes list shows (redesign step 4).

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const CATEGORY_ICONS: Record<string, IconName> = {
  scheduled: "time-outline",
  reminder: "notifications-outline",
  errand: "bag-outline",
  task: "checkbox-outline",
  idea: "bulb-outline",
  uncategorized: "reorder-three-outline",
};

export type Trailing = { kind: "time"; time: string } | { kind: "smart" } | { kind: "off" };

export interface NoteCardInfo {
  icon: IconName;
  tileColor: string; // the user's category color
  tileIconColor: string; // black or white, whichever reads better on it
  categoryLabel: string;
  categoryTextColor: string; // the category color if readable on the card, else textMuted
  placeName: string | null;
  folderName: string | null; // only when not General
  trailing: Trailing;
}

export function noteCardInfo(
  note: Note,
  places: ServerPlace[],
  categoryColors: CategoryColors,
  palette: Palette = lightColors
): NoteCardInfo {
  const color = colorFor(note.category, categoryColors);
  const category = note.category || "uncategorized";
  const time = noteTime(note);
  let trailing: Trailing;
  // alerts off wins: a time would look like an alarm that won't ring
  if (note.reminders_enabled === false) {
    trailing = { kind: "off" };
  } else if (time) {
    trailing = { kind: "time", time };
  } else {
    trailing = { kind: "smart" };
  }
  return {
    icon: CATEGORY_ICONS[category] ?? CATEGORY_ICONS.uncategorized,
    tileColor: color,
    tileIconColor: textColorFor(color),
    categoryLabel: category.charAt(0).toUpperCase() + category.slice(1),
    // readable on this theme's card (white in light mode, dark green-grey in dark mode)
    categoryTextColor: contrastRatio(color, palette.surface) >= 4.5 ? color : palette.textMuted,
    placeName: locationLabel(note, places),
    folderName: note.list_name && note.list_name !== GENERAL ? note.list_name : null,
    trailing,
  };
}

// "At Home" / "No place" for the chip at the top of the notes list.
export function currentPlaceLabel(stored: string | null, places: ServerPlace[]): string {
  const id = resolveCurrentLocation(stored, places);
  const place = id === UNKNOWN ? undefined : places.find((p) => p.id === id);
  return place ? `At ${place.name}` : "No place";
}
