import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, MIN_TOUCH_TARGET, radius, type } from "../../theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// Pill-shaped choice. Selected = primary fill with white text.
// Also used for the place radius buttons ("400 m") and folder chips.
export default function Chip({
  label,
  selected = false,
  onPress,
  onLongPress,
  icon,
  dotColor,
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  icon?: IconName;
  dotColor?: string; // small color dot before the label, e.g. a category color
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const fg = selected ? colors.onPrimary : colors.text;
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
    >
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      {dotColor ? <View testID="chip-dot" style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[type.chip, styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.chip,
    paddingHorizontal: 16,
    backgroundColor: colors.chip,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selected: { backgroundColor: colors.primary },
  disabled: { opacity: 0.5 },
  label: { fontFamily: fonts.bodySemi },
  // white ring so the dot stays visible on the selected (green) chip
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.surface },
});
