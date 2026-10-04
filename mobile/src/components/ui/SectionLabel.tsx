import React from "react";
import { StyleProp, Text, TextStyle } from "react-native";
import { type } from "../../theme";

// Small uppercase heading, e.g. "TODAY" on the notes list.
export default function SectionLabel({
  title,
  style,
}: {
  title: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[type.sectionLabel, style]} accessibilityRole="header">
      {title}
    </Text>
  );
}
