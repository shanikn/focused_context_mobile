import React from "react";
import { Keyboard, ScrollView, TextInput, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";
import AddressSearchModal from "./AddressSearchModal";
import { findAddress } from "../services/addressSearch";

jest.mock("../services/addressSearch", () => ({ findAddress: jest.fn() }));

const REICHMAN = { label: "Reichman University, Herzliya", latitude: 32.176, longitude: 34.837 };

async function renderAndSearch(onPick: jest.Mock) {
  (findAddress as jest.Mock).mockResolvedValue([REICHMAN]);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <AddressSearchModal visible placeName="Uni" onPick={onPick} onCancel={jest.fn()} />
    );
  });
  await act(async () => {
    tree.root.findByType(TextInput).props.onChangeText("Reichman University");
  });
  const searchButton = tree.root
    .findAllByType(TouchableOpacity)
    .find((t) => t.findAll((n) => n.props.children === "Search").length > 0)!;
  await act(async () => {
    await searchButton.props.onPress();
  });
  return tree;
}

test("results stay tappable while the keyboard is open (first tap picks, not just closes the keyboard)", async () => {
  const tree = await renderAndSearch(jest.fn());
  const list = tree.root.findByType(ScrollView);
  expect(list.props.keyboardShouldPersistTaps).toBe("handled");
});

test("searching closes the keyboard so the results aren't hidden behind it", async () => {
  const dismiss = jest.spyOn(Keyboard, "dismiss");
  await renderAndSearch(jest.fn());
  expect(dismiss).toHaveBeenCalled();
  dismiss.mockRestore();
});

test("tapping a result hands it to onPick", async () => {
  const onPick = jest.fn();
  const tree = await renderAndSearch(onPick);
  const result = tree.root
    .findByType(ScrollView)
    .findAllByType(TouchableOpacity)[0];
  await act(async () => {
    result.props.onPress();
  });
  expect(onPick).toHaveBeenCalledWith(REICHMAN);
});
