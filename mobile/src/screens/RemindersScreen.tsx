import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function RemindersScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={64} color="#ccc" />
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.subtitle}>Coming soon — needs location services</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 20,
    color: "#666",
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },
});
