import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";
import MapPickerModal from "./MapPickerModal";

const mockInject = jest.fn();
jest.mock("react-native-webview", () => {
  const React = require("react");
  const { View } = require("react-native");
  const WebView = React.forwardRef((props: object, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    return <View testID="map" {...props} />;
  });
  return { WebView };
});
jest.mock("../services/addressSearch", () => ({ findAddress: jest.fn() }));

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

describe("search on the map", () => {
  const { findAddress } = jest.requireMock("../services/addressSearch");
  const ROTHSCHILD = { label: "Rothschild Blvd 10, Tel Aviv", latitude: 32.0641, longitude: 34.7748 };
  const OTHER = { label: "Rothschild St 10, Rishon LeZion", latitude: 31.96, longitude: 34.8 };
  const textOf = (tree: ReactTestRenderer) =>
    tree.root
      .findAllByType(Text)
      .map((t) => [t.props.children].flat().join(""))
      .join(" | ");

  beforeEach(() => {
    mockInject.mockClear();
    (findAddress as jest.Mock).mockReset();
  });

  async function search(tree: ReactTestRenderer, query: string) {
    const input = tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === "Search the map")!;
    await act(async () => input.props.onChangeText(query));
    await act(async () => input.props.onSubmitEditing());
  }

  test("jumps the map to the first result and lists the others", async () => {
    (findAddress as jest.Mock).mockResolvedValue([ROTHSCHILD, OTHER]);
    const tree = await render();
    await search(tree, "Rothschild 10");
    expect(findAddress).toHaveBeenCalledWith("Rothschild 10");
    expect(mockInject).toHaveBeenCalledWith("map.setView([32.0641, 34.7748], 17); true;");
    expect(textOf(tree)).toContain(OTHER.label);
  });

  test("tapping another result jumps there; Save here saves where the map is", async () => {
    (findAddress as jest.Mock).mockResolvedValue([ROTHSCHILD, OTHER]);
    const onSave = jest.fn();
    const tree = await render(onSave);
    await search(tree, "Rothschild 10");
    await act(async () => button(tree, OTHER.label).props.onPress());
    expect(mockInject).toHaveBeenLastCalledWith("map.setView([31.96, 34.8], 17); true;");
    await act(async () => button(tree, "Save here").props.onPress());
    expect(onSave).toHaveBeenCalledWith({ latitude: 31.96, longitude: 34.8 });
  });

  test("nothing found: says so and the map stays", async () => {
    (findAddress as jest.Mock).mockResolvedValue([]);
    const tree = await render();
    await search(tree, "nowhere street");
    expect(textOf(tree)).toContain("No places found");
    expect(mockInject).not.toHaveBeenCalled();
  });

  test("a failed search shows why", async () => {
    const { AddressSearchError } = jest.requireActual("../lib/nominatim");
    (findAddress as jest.Mock).mockRejectedValue(new AddressSearchError("rate_limited", "429", 429));
    const tree = await render();
    await search(tree, "Rothschild 10");
    expect(textOf(tree)).toContain("Too many address searches");
  });

  test("the search box takes Hebrew", async () => {
    (findAddress as jest.Mock).mockResolvedValue([ROTHSCHILD]);
    const tree = await render();
    const input = tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === "Search the map")!;
    expect(input.props.keyboardType ?? "default").toBe("default");
    expect(input.props.autoCapitalize).toBe("none");
    await search(tree, "רוטשילד 10, תל אביב");
    expect(findAddress).toHaveBeenCalledWith("רוטשילד 10, תל אביב");
  });
});
