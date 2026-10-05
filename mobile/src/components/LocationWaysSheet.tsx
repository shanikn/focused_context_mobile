import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MIN_TOUCH_TARGET, Theme, radius, spacing } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// The ways to set a place's location. A sheet, not an Alert: Android shows
// at most 3 alert buttons.
export type LocationWay = "current" | "address" | "map" | "paste";

const WAYS: { way: LocationWay; label: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { way: "current", label: "Use current location", icon: "navigate-outline" },
  { way: "address", label: "Search address", icon: "search-outline" },
  { way: "map", label: "Pick on map", icon: "map-outline" },
  { way: "paste", label: "Paste coordinates or Google Maps link", icon: "clipboard-outline" },
];

export default function LocationWaysSheet({
  placeName,
  onChoose,
  onClose,
}: {
  placeName: string | null; // null: closed
  onChoose: (way: LocationWay) => void;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={placeName !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={[type.cardTitle, styles.title]}>Set {placeName}&apos;s location</Text>
          {WAYS.map(({ way, label, icon }) => (
            <TouchableOpacity
              key={way}
              testID="location-way"
              style={styles.row}
              onPress={() => onChoose(way)}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Ionicons name={icon} size={20} color={colors.primaryDark} />
              <Text style={type.body}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.row} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={[type.body, styles.cancel]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.card,
      borderTopRightRadius: radius.card,
      padding: spacing.screen,
      paddingBottom: spacing.screen + 8,
    },
    title: { marginBottom: 8 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: MIN_TOUCH_TARGET + 4 },
    cancel: { color: colors.textMuted },
  });
