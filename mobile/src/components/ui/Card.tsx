import React from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Theme, radius } from "../../theme";
import { useTheme, useThemedStyles } from "../../ThemeContext";

// White rounded card with an optional title and helper text.
export default function Card({
  title,
  helper,
  children,
  style,
}: {
  title?: string;
  helper?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={type.cardTitle}>{title}</Text> : null}
      {helper ? <Text style={[type.caption, styles.helper]}>{helper}</Text> : null}
      {children}
    </View>
  );
}

const makeStyles = ({ colors, type }: Theme) =>
  StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  helper: { marginTop: 2, marginBottom: 4 },
});
