import React from "react";
import { Keyboard, ScrollView, Text, TextInput, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import AddressSearchModal from "./AddressSearchModal";
import { findAddress } from "../services/addressSearch";

jest.mock("../services/addressSearch", () => ({ findAddress: jest.fn() }));

const REICHMAN = { label: "Reichman University, Herzliya, Israel", latitude: 32.176, longitude: 34.837 };
const OTHER = { label: "Reichman Street, Tel Aviv, Israel", latitude: 32.08, longitude: 34.78 };

function textOf(node: ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(""))
    .join(" ");
}

function buttonWithText(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const button = tree.root
    .findAllByType(TouchableOpacity)
    .find((t) => t.findAllByType(Text).some((x) => [x.props.children].flat().join("") === label));
  if (!button) {
    throw new Error(`no button "${label}"`);
  }
  return button;
}

function resultRows(tree: ReactTestRenderer): ReactTestInstance[] {
  return tree.root.findByType(ScrollView).findAllByType(TouchableOpacity);
}

async function renderAndSearch(onSave: jest.Mock, results = [REICHMAN, OTHER]) {
  (findAddress as jest.Mock).mockResolvedValue(results);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <AddressSearchModal visible placeName="Uni" onSave={onSave} onCancel={jest.fn()} />
    );
  });
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText("Reichman University");
  });
  await act(async () => {
    await buttonWithText(tree, "Search").props.onPress();
  });
  return tree;
}

test("after a search the results are shown as a list of tappable rows", async () => {
  const tree = await renderAndSearch(jest.fn());
  const rows = resultRows(tree);
  expect(rows).toHaveLength(2);
  expect(textOf(rows[0])).toContain(REICHMAN.label);
  expect(textOf(rows[1])).toContain(OTHER.label);
  // with the keyboard still open, the first tap must select, not just close the keyboard
  expect(tree.root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe("handled");
});

test("searching closes the keyboard so the results aren't hidden behind it", async () => {
  const dismiss = jest.spyOn(Keyboard, "dismiss");
  await renderAndSearch(jest.fn());
  expect(dismiss).toHaveBeenCalled();
  dismiss.mockRestore();
});

test("Save is disabled until a result is selected", async () => {
  const tree = await renderAndSearch(jest.fn());
  expect(buttonWithText(tree, "Save as Uni").props.disabled).toBe(true);
});

test("tapping a result selects it: highlighted, and its address is shown", async () => {
  const tree = await renderAndSearch(jest.fn());
  await act(async () => {
    resultRows(tree)[0].props.onPress();
  });
  const rows = resultRows(tree);
  expect(rows[0].props.accessibilityState).toEqual({ selected: true });
  expect(rows[1].props.accessibilityState).toEqual({ selected: false });
  const selected = tree.root.findByProps({ testID: "selected-address" });
  expect(textOf(selected)).toContain(REICHMAN.label);
  expect(buttonWithText(tree, "Save as Uni").props.disabled).toBe(false);
});

test("tapping a different result moves the selection", async () => {
  const tree = await renderAndSearch(jest.fn());
  await act(async () => resultRows(tree)[0].props.onPress());
  await act(async () => resultRows(tree)[1].props.onPress());
  expect(resultRows(tree)[1].props.accessibilityState).toEqual({ selected: true });
  expect(textOf(tree.root.findByProps({ testID: "selected-address" }))).toContain(OTHER.label);
});

test("Save as <place> saves the selected result", async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const tree = await renderAndSearch(onSave);
  await act(async () => resultRows(tree)[1].props.onPress());
  await act(async () => {
    await buttonWithText(tree, "Save as Uni").props.onPress();
  });
  expect(onSave).toHaveBeenCalledWith(OTHER);
});

test("if saving fails, the dialog stays open and says so", async () => {
  const onSave = jest.fn().mockRejectedValue(new Error("disk full"));
  const tree = await renderAndSearch(onSave);
  await act(async () => resultRows(tree)[0].props.onPress());
  await act(async () => {
    await buttonWithText(tree, "Save as Uni").props.onPress();
  });
  expect(textOf(tree.root)).toMatch(/couldn't save/i);
  expect(resultRows(tree)[0].props.accessibilityState).toEqual({ selected: true });
});

test("a new search clears the previous selection", async () => {
  const tree = await renderAndSearch(jest.fn());
  await act(async () => resultRows(tree)[0].props.onPress());
  (findAddress as jest.Mock).mockResolvedValue([OTHER]);
  await act(async () => {
    await buttonWithText(tree, "Search").props.onPress();
  });
  expect(tree.root.findAllByProps({ testID: "selected-address" })).toHaveLength(0);
  expect(buttonWithText(tree, "Save as Uni").props.disabled).toBe(true);
});

describe("Hebrew input", () => {
  test("a plain text keyboard (no type that hides the Hebrew layout), no auto-caps or autocorrect, RTL-aware", async () => {
    const tree = await renderAndSearch(jest.fn());
    const input = tree.root.findByType(TextInput);
    expect(input.props.keyboardType ?? "default").toBe("default");
    expect(input.props.autoCapitalize).toBe("none");
    expect(input.props.autoCorrect).toBe(false);
    expect([input.props.style].flat(3).some((s: { writingDirection?: string } | undefined) => s?.writingDirection === "auto")).toBe(
      true
    );
  });

  test("a Hebrew query reaches the search unchanged", async () => {
    const tree = await renderAndSearch(jest.fn());
    (findAddress as jest.Mock).mockClear();
    await act(async () => tree.root.findByType(TextInput).props.onChangeText("רוטשילד 10, תל אביב"));
    await act(async () => tree.root.findByType(TextInput).props.onSubmitEditing());
    expect(findAddress).toHaveBeenCalledWith("רוטשילד 10, תל אביב");
  });
});
