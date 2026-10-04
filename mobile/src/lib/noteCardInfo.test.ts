import { currentPlaceLabel, noteCardInfo } from "./noteCardInfo";
import { DEFAULT_CATEGORY_COLORS } from "./categoryColors";
import { darkColors, lightColors as colors } from "../theme";
import { Note } from "../types/notes";

const PLACES = [
  { id: "id-home", name: "Home", keywords: [], kind: "home" as const },
  { id: "id-gym", name: "Gym", keywords: [], kind: null },
];

function note(fields: Partial<Note>): Note {
  return {
    _id: "n1",
    content: "note",
    category: "task",
    contexts: [],
    list_name: "General",
    reminders_enabled: true,
    remind_at_hour: null,
    remind_at_minute: null,
    remind_on_date: null,
    ...fields,
  } as Note;
}

describe("icon tile", () => {
  test.each([
    ["scheduled", "time-outline"],
    ["reminder", "notifications-outline"],
    ["errand", "bag-outline"],
    ["task", "checkbox-outline"],
    ["idea", "bulb-outline"],
    ["uncategorized", "reorder-three-outline"],
    ["something-new", "reorder-three-outline"],
  ])("%s -> %s", (category, icon) => {
    expect(noteCardInfo(note({ category }), PLACES, DEFAULT_CATEGORY_COLORS).icon).toBe(icon);
  });

  test("background is the user's category color, icon black or white by contrast", () => {
    const custom = { ...DEFAULT_CATEGORY_COLORS, task: "#FFEB3B" };
    const info = noteCardInfo(note({ category: "task" }), PLACES, custom);
    expect(info.tileColor).toBe("#FFEB3B");
    expect(info.tileIconColor).toBe("#000000");
    const dflt = noteCardInfo(note({ category: "task" }), PLACES, DEFAULT_CATEGORY_COLORS);
    expect(dflt.tileIconColor).toBe("#FFFFFF");
  });
});

describe("meta line", () => {
  test("category name capitalized", () => {
    expect(noteCardInfo(note({ category: "errand" }), PLACES, DEFAULT_CATEGORY_COLORS).categoryLabel).toBe("Errand");
  });

  test("category text uses its color when readable on white (contrast >= 4.5)", () => {
    expect(noteCardInfo(note({ category: "task" }), PLACES, DEFAULT_CATEGORY_COLORS).categoryTextColor).toBe(
      DEFAULT_CATEGORY_COLORS.task
    );
  });

  test("…and textMuted when it isn't (e.g. a light yellow)", () => {
    const custom = { ...DEFAULT_CATEGORY_COLORS, idea: "#FFEB3B" };
    expect(noteCardInfo(note({ category: "idea" }), PLACES, custom).categoryTextColor).toBe(colors.textMuted);
  });

  test("dark mode: category text must be readable on the dark card", () => {
    // the default task blue is too dark on a dark card -> textMuted
    expect(
      noteCardInfo(note({ category: "task" }), PLACES, DEFAULT_CATEGORY_COLORS, darkColors).categoryTextColor
    ).toBe(darkColors.textMuted);
    // a light yellow reads fine on a dark card
    const custom = { ...DEFAULT_CATEGORY_COLORS, idea: "#FFEB3B" };
    expect(noteCardInfo(note({ category: "idea" }), PLACES, custom, darkColors).categoryTextColor).toBe("#FFEB3B");
    // the icon tile keeps black/white by contrast with the category color itself
    expect(noteCardInfo(note({ category: "idea" }), PLACES, custom, darkColors).tileIconColor).toBe("#000000");
  });

  test("place name when the note has a place, otherwise none", () => {
    expect(noteCardInfo(note({ contexts: ["id-gym", "18:00"] }), PLACES, DEFAULT_CATEGORY_COLORS).placeName).toBe("Gym");
    expect(noteCardInfo(note({ contexts: ["18:00"] }), PLACES, DEFAULT_CATEGORY_COLORS).placeName).toBeNull();
  });

  test("folder name only when it isn't General", () => {
    expect(noteCardInfo(note({ list_name: "Games" }), PLACES, DEFAULT_CATEGORY_COLORS).folderName).toBe("Games");
    expect(noteCardInfo(note({ list_name: "General" }), PLACES, DEFAULT_CATEGORY_COLORS).folderName).toBeNull();
    expect(noteCardInfo(note({ list_name: "" }), PLACES, DEFAULT_CATEGORY_COLORS).folderName).toBeNull();
  });
});

describe("right side", () => {
  test("the time when there is one", () => {
    expect(noteCardInfo(note({ contexts: ["17:54"] }), PLACES, DEFAULT_CATEGORY_COLORS).trailing).toEqual({
      kind: "time",
      time: "17:54",
    });
  });

  test("smart alerts: sparkles", () => {
    expect(noteCardInfo(note({}), PLACES, DEFAULT_CATEGORY_COLORS).trailing).toEqual({ kind: "smart" });
  });

  test("alerts off: bell-off", () => {
    expect(noteCardInfo(note({ reminders_enabled: false }), PLACES, DEFAULT_CATEGORY_COLORS).trailing).toEqual({
      kind: "off",
    });
  });

  test("alerts off wins over a time: bell-off, not a time that won't ring", () => {
    expect(
      noteCardInfo(note({ reminders_enabled: false, contexts: ["17:54"] }), PLACES, DEFAULT_CATEGORY_COLORS).trailing
    ).toEqual({ kind: "off" });
  });
});

describe("currentPlaceLabel (the chip at the top of the list)", () => {
  test("a known place", () => {
    expect(currentPlaceLabel("id-home", PLACES)).toBe("At Home");
  });

  test("unknown, or a place that no longer exists", () => {
    expect(currentPlaceLabel("unknown", PLACES)).toBe("No place");
    expect(currentPlaceLabel("id-deleted", PLACES)).toBe("No place");
  });

  test("an old stored name like 'home' maps to the place of that kind", () => {
    expect(currentPlaceLabel("home", PLACES)).toBe("At Home");
  });
});
