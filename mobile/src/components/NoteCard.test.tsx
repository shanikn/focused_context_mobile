import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";
import NoteCard from "./NoteCard";
import { CATEGORIES, categoryLabel, DEFAULT_CATEGORY_COLORS, hueOf } from "../lib/categoryColors";
import { lightColors } from "../theme";
import { Note } from "../types/notes";

// the swipe needs native gestures: render the card and its swipe action side by side
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  return {
    Swipeable: ({ children, renderRightActions }: { children: React.ReactNode; renderRightActions: () => React.ReactNode }) => (
      <View>
        {children}
        {renderRightActions()}
      </View>
    ),
  };
});

const NOTE = {
  _id: "a",
  content: "Buy milk",
  category: "errand",
  list_name: "General",
  contexts: [],
  reminders_enabled: true,
  created_at: "2026-10-04T09:00:00",
} as unknown as Note;

async function renderCard(onDelete: jest.Mock, note: Note = NOTE) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <NoteCard note={note} onPress={jest.fn()} onDelete={onDelete} places={[]} categoryColors={DEFAULT_CATEGORY_COLORS} />
    );
  });
  return tree;
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

test("swipe -> Delete deletes at once, no confirmation (Undo covers it)", async () => {
  const onDelete = jest.fn();
  const tree = await renderCard(onDelete);
  const action = tree.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === "Delete note")!;
  await act(async () => action.props.onPress());
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(alertSpy).not.toHaveBeenCalled();
});

test("long-press deletes the same way, with no confirmation", async () => {
  const onDelete = jest.fn();
  const tree = await renderCard(onDelete);
  const card = tree.root.findAllByType(TouchableOpacity).find((t) => typeof t.props.onLongPress === "function")!;
  await act(async () => card.props.onLongPress());
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(alertSpy).not.toHaveBeenCalled();
});

test.each(CATEGORIES.map((c) => [c]))("the %s label on the card is drawn in its category color", async (category) => {
  const tree = await renderCard(jest.fn(), { ...NOTE, category } as Note);
  const label = tree.root.findAllByType(Text).find((t) => t.props.children === categoryLabel(category))!;
  const color = StyleSheet.flatten(label.props.style).color as string;
  expect(color).not.toBe(lightColors.textMuted);
  expect(Math.abs(hueOf(color) - hueOf(DEFAULT_CATEGORY_COLORS[category]))).toBeLessThanOrEqual(2);
});
