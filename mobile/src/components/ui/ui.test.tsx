import React from "react";
import { ScrollView, Switch, Text, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestRenderer } from "react-test-renderer";
import { Chip, ChipRow, PrimaryButton, ToggleRow } from "./index";
import { colors } from "../../theme";

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

test("Chip reports selection to accessibility and fills with the primary color", () => {
  const onPress = jest.fn();
  const tree = render(<Chip label="400 m" selected onPress={onPress} accessibilityLabel="Uni radius 400 m" />);
  const button = tree.root.findByType(TouchableOpacity);
  expect(button.props.accessibilityRole).toBe("button");
  expect(button.props.accessibilityState).toEqual({ selected: true, disabled: false });
  expect(button.props.accessibilityLabel).toBe("Uni radius 400 m");
  expect(JSON.stringify(button.props.style)).toContain(colors.primary);
  act(() => button.props.onPress());
  expect(onPress).toHaveBeenCalled();
});

test("Chip passes long-press through (deleting a folder)", () => {
  const onLongPress = jest.fn();
  const tree = render(<Chip label="Games" onLongPress={onLongPress} />);
  act(() => tree.root.findByType(TouchableOpacity).props.onLongPress());
  expect(onLongPress).toHaveBeenCalled();
});

test("PrimaryButton can be disabled (Save as <place> before a selection)", () => {
  const tree = render(<PrimaryButton label="Save as Uni" onPress={jest.fn()} disabled />);
  const button = tree.root.findByType(TouchableOpacity);
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(tree.root.findByType(Text).props.children).toBe("Save as Uni");
});

test("scrolling ChipRow keeps taps while the keyboard is open", () => {
  const tree = render(
    <ChipRow scroll>
      <Chip label="All" />
      <Chip label="General" />
    </ChipRow>
  );
  const row = tree.root.findByType(ScrollView);
  expect(row.props.horizontal).toBe(true);
  expect(row.props.keyboardShouldPersistTaps).toBe("handled");
});

test("ToggleRow switch uses the primary color and reports changes", () => {
  const onValueChange = jest.fn();
  const tree = render(<ToggleRow title="Phone alert" value onValueChange={onValueChange} />);
  const sw = tree.root.findByType(Switch);
  expect(sw.props.trackColor.true).toBe(colors.primary);
  act(() => sw.props.onValueChange(false));
  expect(onValueChange).toHaveBeenCalledWith(false);
});

test("Chip can show a color dot (category colors)", () => {
  const tree = render(<Chip label="Errand" dotColor="#388E3C" />);
  const dot = tree.root.findByProps({ testID: "chip-dot" });
  expect(JSON.stringify(dot.props.style)).toContain("#388E3C");
});
