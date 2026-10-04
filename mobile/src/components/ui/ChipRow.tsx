import React from "react";
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

// Chips that wrap onto new lines, or one horizontally scrolling row (`scroll`),
// e.g. the folder chips (order from folderTabs(): All, General, then the rest).
export default function ChipRow({
  children,
  scroll = false,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.row, style]}
      >
        {children}
      </ScrollView>
    );
  }
  return <View style={[styles.row, styles.wrap, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  wrap: { flexWrap: "wrap" },
});
