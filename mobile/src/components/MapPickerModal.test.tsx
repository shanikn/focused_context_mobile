import React from "react";
import { TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";
import MapPickerModal from "./MapPickerModal";

jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { WebView: (props: object) => <View testID="map" {...props} /> };
});

const VIEW = { latitude: 32.1, longitude: 34.8, radius: 400, zoom: 17, from: "place" as const };

async function render(onSave = jest.fn(), onCancel = jest.fn()) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <MapPickerModal visible placeName="Home" initialView={VIEW} onSave={onSave} onCancel={onCancel} />
    );
  });
  return tree;
}

const button = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity).find((t) => t.props.accessibilityLabel === label)!;
const map = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.testID === "map")[0];

test("loads the map page with a base URL (so tiles get a Referer)", async () => {
  const tree = await render();
  const source = map(tree).props.source;
  expect(source.html).toContain("setView([32.1, 34.8], 17)");
  expect(source.baseUrl).toMatch(/^https:\/\//);
});

test("Save here: the map's center, as last reported by the map", async () => {
  const onSave = jest.fn();
  const tree = await render(onSave);
  await act(async () => map(tree).props.onMessage({ nativeEvent: { data: '{"type":"center","lat":32.2,"lon":34.9}' } }));
  await act(async () => button(tree, "Save here").props.onPress());
  expect(onSave).toHaveBeenCalledWith({ latitude: 32.2, longitude: 34.9 });
});

test("Save here without moving the map: where it opened", async () => {
  const onSave = jest.fn();
  const tree = await render(onSave);
  await act(async () => button(tree, "Save here").props.onPress());
  expect(onSave).toHaveBeenCalledWith({ latitude: 32.1, longitude: 34.8 });
});

test("junk messages are ignored; Cancel cancels", async () => {
  const onSave = jest.fn();
  const onCancel = jest.fn();
  const tree = await render(onSave, onCancel);
  await act(async () => map(tree).props.onMessage({ nativeEvent: { data: "garbage" } }));
  await act(async () => button(tree, "Save here").props.onPress());
  expect(onSave).toHaveBeenCalledWith({ latitude: 32.1, longitude: 34.8 });
  await act(async () => button(tree, "Cancel").props.onPress());
  expect(onCancel).toHaveBeenCalled();
});
