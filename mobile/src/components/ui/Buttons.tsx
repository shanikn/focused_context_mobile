import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { colors, fonts, MIN_TOUCH_TARGET, radius } from "../../theme";

// Filled green pill, e.g. "Save" or "Save as Uni" (disabled until an
// address is selected; `loading` while saving).
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.primary, off && styles.disabled, style]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimary} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

// Text-only button in dark green (red for destructive actions like Sign out).
export function TextButton({
  label,
  onPress,
  disabled = false,
  destructive = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      style={[styles.text, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[styles.textLabel, destructive && styles.destructive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.chip,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onPrimary, fontFamily: fonts.bodyBold, fontSize: 15 },
  disabled: { opacity: 0.5 },
  text: { height: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 4 },
  textLabel: { color: colors.primaryDark, fontFamily: fonts.bodyBold, fontSize: 15 },
  destructive: { color: colors.danger },
});
