import React from "react";
import { Alert, Text, TextInput, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import NotesListScreen from "./NotesListScreen";
import { getNotes } from "../api/notes";
import { Note } from "../types/notes";

// created b (oldest), c, a (newest); a is due today, the others are smart alerts
const NOTES = [
  {
    _id: "a",
    content: "Buy milk",
    category: "errand",
    list_name: "General",
    contexts: ["18:00"],
    reminders_enabled: true,
    created_at: "2026-10-04T09:00:00",
  },
  {
    _id: "b",
    content: "Study for the exam",
    category: "task",
    list_name: "Uni",
    contexts: [],
    reminders_enabled: true,
    created_at: "2026-09-01T09:00:00",
  },
  {
    _id: "c",
    content: "לקנות חלב",
    category: "errand",
    list_name: "Uni",
    contexts: [],
    reminders_enabled: true,
    created_at: "2026-10-01T09:00:00",
  },
] as unknown as Note[];

// the last focus callback, so a test can "come back" to the screen
let mockRefocus: () => void = () => {};
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    useNavigation: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
    useFocusEffect: (cb: () => void) => {
      mockRefocus = cb;
      React.useEffect(() => cb(), []);
    },
  };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return { SafeAreaView: View };
});
jest.mock("../api/notes", () => ({
  getNotes: jest.fn(async () => NOTES),
  deleteNote: jest.fn(),
}));
jest.mock("../lib/listPrefs", () => ({
  getCustomLists: jest.fn().mockResolvedValue([]),
  addCustomList: jest.fn(),
  removeCustomList: jest.fn(),
}));
jest.mock("../services/scheduledReminders", () => ({ syncScheduledReminders: jest.fn() }));
jest.mock("../services/storeAlerts", () => ({ syncStoreAlerts: jest.fn() }));
jest.mock("../services/placesStore", () => ({ loadPlaces: jest.fn().mockResolvedValue([]) }));
jest.mock("../lib/reminderPrefs", () => ({ getReminderLocation: jest.fn().mockResolvedValue("unknown") }));
// the card's swipe needs native gesture handling; show just the text
jest.mock("../components/NoteCard", () => {
  const { Text } = require("react-native");
  return ({ note }: { note: { content: string } }) => <Text testID="note-card">{note.content}</Text>;
});

function shownNotes(tree: ReactTestRenderer): string[] {
  // host (native) elements only; findAllByProps also returns the composite Text wrapper
  return tree.root
    .findAll((n) => n.props.testID === "note-card" && typeof n.type === "string")
    .map((n) => n.props.children as string);
}

function byLabel(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const found = tree.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label);
  if (!found) {
    throw new Error(`nothing labelled "${label}"`);
  }
  return found;
}

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(""))
    .join(" | ");
}

async function renderScreen() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<NotesListScreen />);
  });
  return tree;
}

const searchField = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === "Search notes")!;

async function type(tree: ReactTestRenderer, text: string) {
  await act(async () => searchField(tree).props.onChangeText(text));
}

test("search filters as you type, case-insensitive and in Hebrew", async () => {
  const tree = await renderScreen();
  expect(shownNotes(tree)).toHaveLength(3);
  await type(tree, "MILK");
  expect(shownNotes(tree)).toEqual(["Buy milk"]);
  await type(tree, "חלב");
  expect(shownNotes(tree)).toEqual(["לקנות חלב"]);
});

test("the clear (x) button appears with text and empties the search", async () => {
  const tree = await renderScreen();
  expect(tree.root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === "Clear search")).toBe(
    false
  );
  await type(tree, "milk");
  await act(async () => byLabel(tree, "Clear search").props.onPress());
  expect(searchField(tree).props.value).toBe("");
  expect(shownNotes(tree)).toHaveLength(3);
});

test("category chips filter, and combine with the folder and the search", async () => {
  const tree = await renderScreen();
  await act(async () => byLabel(tree, "Errand notes").props.onPress());
  expect(shownNotes(tree).sort()).toEqual(["Buy milk", "לקנות חלב"].sort());
  await act(async () => byLabel(tree, "Uni").props.onPress());
  expect(shownNotes(tree)).toEqual(["לקנות חלב"]);
  await type(tree, "milk");
  expect(shownNotes(tree)).toEqual([]);
  await act(async () => byLabel(tree, "All categories").props.onPress());
  await type(tree, "");
  expect(shownNotes(tree).sort()).toEqual(["Study for the exam", "לקנות חלב"].sort());
});

test("no matches: 'No matching notes' and a way to clear the search and filter", async () => {
  const tree = await renderScreen();
  await act(async () => byLabel(tree, "Idea notes").props.onPress());
  await type(tree, "zzz");
  expect(shownNotes(tree)).toEqual([]);
  expect(allText(tree)).toContain("No matching notes");
  await act(async () => byLabel(tree, "Clear search and filter").props.onPress());
  expect(shownNotes(tree)).toHaveLength(3);
});

describe("Recent / Upcoming toggle", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const headers = (tree: ReactTestRenderer) =>
    tree.root
      .findAll((n) => n.props.accessibilityRole === "header" && typeof n.type === "string")
      .map((n) => [n.props.children].flat().join(""));

  test("Recent by default: one list, newest created first, no section headers", async () => {
    const tree = await renderScreen();
    expect(byLabel(tree, "Recent").props.accessibilityState).toEqual({ selected: true });
    expect(byLabel(tree, "Upcoming").props.accessibilityState).toEqual({ selected: false });
    expect(shownNotes(tree)).toEqual(["Buy milk", "לקנות חלב", "Study for the exam"]);
    expect(headers(tree)).toEqual([]);
  });

  test("Upcoming shows the date sections", async () => {
    const tree = await renderScreen();
    await act(async () => byLabel(tree, "Upcoming").props.onPress());
    expect(byLabel(tree, "Upcoming").props.accessibilityState).toEqual({ selected: true });
    expect(headers(tree)).toEqual(["Today", "Smart alerts"]);
    expect(shownNotes(tree)).toEqual(["Buy milk", "Study for the exam", "לקנות חלב"]);
  });

  test("the choice is remembered on the phone", async () => {
    const first = await renderScreen();
    await act(async () => byLabel(first, "Upcoming").props.onPress());
    expect(await AsyncStorage.getItem("smartmind.notesView")).toBe("upcoming");
    await act(async () => first.unmount());
    const again = await renderScreen();
    expect(byLabel(again, "Upcoming").props.accessibilityState).toEqual({ selected: true });
    expect(headers(again)).toEqual(["Today", "Smart alerts"]);
  });

  test("search, folder tabs and the category filter work in both views", async () => {
    for (const view of ["Recent", "Upcoming"]) {
      const tree = await renderScreen();
      await act(async () => byLabel(tree, view).props.onPress());
      await act(async () => byLabel(tree, "Errand notes").props.onPress());
      expect(shownNotes(tree)).toEqual(["Buy milk", "לקנות חלב"]);
      await act(async () => byLabel(tree, "Uni").props.onPress());
      expect(shownNotes(tree)).toEqual(["לקנות חלב"]);
      await act(async () => byLabel(tree, "All").props.onPress());
      await type(tree, "milk");
      expect(shownNotes(tree)).toEqual(["Buy milk"]);
      await act(async () => tree.unmount());
    }
  });
});

describe("loading errors", () => {
  const mockedGetNotes = getNotes as jest.Mock;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });
  afterEach(() => {
    alertSpy.mockRestore();
    mockedGetNotes.mockImplementation(async () => NOTES);
  });

  const refocus = async () => {
    await act(async () => mockRefocus());
  };

  test("coming back (e.g. from Settings) when the refetch fails: no error, the notes stay", async () => {
    const tree = await renderScreen();
    expect(shownNotes(tree)).toHaveLength(3);
    mockedGetNotes.mockRejectedValueOnce(new Error("API error 401"));
    await refocus();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(allText(tree)).not.toMatch(/couldn't load|failed to load/i);
    expect(shownNotes(tree)).toHaveLength(3);
  });

  test("an older refetch that fails after a newer one succeeded is ignored", async () => {
    let failOld!: (e: Error) => void;
    const tree = await renderScreen();
    mockedGetNotes.mockImplementationOnce(() => new Promise((_, reject) => (failOld = reject)));
    await refocus(); // first refetch, still in flight
    await refocus(); // second refetch succeeds
    await act(async () => failOld(new Error("aborted")));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(allText(tree)).not.toMatch(/couldn't load/i);
    expect(shownNotes(tree)).toHaveLength(3);
  });

  test("the first load fails with nothing to show: an error with Try again, cleared on success", async () => {
    mockedGetNotes.mockRejectedValueOnce(new Error("offline"));
    const tree = await renderScreen();
    expect(shownNotes(tree)).toEqual([]);
    expect(allText(tree)).toContain("Couldn't load your notes");
    expect(allText(tree)).not.toContain("No notes yet");
    await act(async () => byLabel(tree, "Try again").props.onPress());
    expect(allText(tree)).not.toContain("Couldn't load your notes");
    expect(shownNotes(tree)).toHaveLength(3);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("folder list storage failing doesn't hide the notes", async () => {
    const { getCustomLists } = jest.requireMock("../lib/listPrefs");
    getCustomLists.mockRejectedValueOnce(new Error("storage"));
    const tree = await renderScreen();
    expect(shownNotes(tree)).toHaveLength(3);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
