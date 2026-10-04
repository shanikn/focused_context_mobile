import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
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
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  icon?: IconName;
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
});
