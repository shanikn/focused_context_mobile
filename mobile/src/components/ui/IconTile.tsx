import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radius } from "../../theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

// 36x36 rounded square with an icon, e.g. a note's category in its color.
export default function IconTile({
  icon,
  backgroundColor,
  iconColor,
}: {
  icon: IconName;
  backgroundColor: string;
  iconColor: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor }]}>
      <Ionicons name={icon} size={20} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.iconTile,
    alignItems: "center",
    justifyContent: "center",
  },
});
