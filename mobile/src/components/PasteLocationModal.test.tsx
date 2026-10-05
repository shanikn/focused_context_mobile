import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";
import PasteLocationModal from "./PasteLocationModal";
import { resolvePastedLocation } from "../services/pastedLocation";

jest.mock("../services/pastedLocation", () => {
  const actual = jest.requireActual("../services/pastedLocation");
  return { ...actual, resolvePastedLocation: jest.fn() };
});
const resolve = resolvePastedLocation as jest.Mock;

async function render(onSave = jest.fn(), onCancel = jest.fn()) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<PasteLocationModal visible placeName="Gym" onSave={onSave} onCancel={onCancel} />);
  });
  return tree;
}

const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label)!;
const textOf = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(""))
    .join(" | ");

async function paste(tree: ReactTestRenderer, text: string) {
  await act(async () => tree.root.findByType(TextInput).props.onChangeText(text));
  await act(async () => button(tree, "Use this location").props.onPress());
}

beforeEach(() => resolve.mockReset());

test("a field for coordinates or a link, plain keyboard", async () => {
  const tree = await render();
  const input = tree.root.findByType(TextInput);
  expect(input.props.placeholder).toContain("32.0812, 34.8105");
  expect(input.props.autoCapitalize).toBe("none");
  expect(input.props.autoCorrect).toBe(false);
  expect(textOf(tree)).toContain("Gym");
});

test("a valid paste is handed back as a point", async () => {
  resolve.mockResolvedValue({ latitude: 32.0812, longitude: 34.8105 });
  const onSave = jest.fn();
  const tree = await render(onSave);
  await paste(tree, " 32.0812, 34.8105 ");
  expect(resolve).toHaveBeenCalledWith("32.0812, 34.8105");
  expect(onSave).toHaveBeenCalledWith({ latitude: 32.0812, longitude: 34.8105 });
});

test("a problem is shown and the dialog stays open", async () => {
  const { PastedLocationError } = jest.requireActual("../services/pastedLocation");
  resolve.mockRejectedValue(new PastedLocationError("Latitude must be between -90 and 90."));
  const onSave = jest.fn();
  const tree = await render(onSave);
  await paste(tree, "95, 34");
  expect(onSave).not.toHaveBeenCalled();
  expect(textOf(tree)).toContain("Latitude must be between -90 and 90.");
});

test("nothing pasted: the button does nothing; Cancel cancels", async () => {
  const onCancel = jest.fn();
  const tree = await render(jest.fn(), onCancel);
  expect(button(tree, "Use this location").props.disabled).toBe(true);
  await act(async () => button(tree, "Cancel").props.onPress());
  expect(onCancel).toHaveBeenCalled();
});
