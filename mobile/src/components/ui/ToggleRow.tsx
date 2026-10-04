import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Theme } from "../../theme";
import { useTheme, useThemedStyles } from "../../ThemeContext";

// Title + caption on the left, a switch on the right.
export default function ToggleRow({
  title,
  caption,
  value,
  onValueChange,
  disabled = false,
}: {
  title: string;
  caption?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={type.cardTitle}>{title}</Text>
        {caption ? <Text style={type.caption}>{caption}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: colors.chip, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const makeStyles = ({ colors, type }: Theme) =>
  StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  text: { flex: 1 },
});
