import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CATEGORIES, Category, categoryLabel, CategoryColors } from "../lib/categoryColors";
import { TextButton } from "./ui";
import { MIN_TOUCH_TARGET, Theme, fonts, radius, spacing } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// The notes list's category filter: the four kinds, each in its color with a
// checkbox. Checking applies right away; none checked shows every kind.
export default function CategoryFilterSheet({
  visible,
  colors: categoryColors,
  checked,
  onToggle,
  onClear,
  onClose,
}: {
  visible: boolean;
  colors: CategoryColors;
  checked: string[];
  onToggle: (category: Category) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[type.cardTitle, styles.title]}>Show categories</Text>
            <TextButton label="Clear" onPress={onClear} disabled={checked.length === 0} />
          </View>
          {CATEGORIES.map((category) => {
            const isChecked = checked.includes(category);
            return (
              <TouchableOpacity
                key={category}
                testID="category-option"
                style={styles.option}
                onPress={() => onToggle(category)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
                accessibilityLabel={categoryLabel(category)}
              >
                <Ionicons
                  name={isChecked ? "checkbox" : "square-outline"}
                  size={22}
                  color={isChecked ? colors.primary : colors.textMuted}
                />
                <View testID="category-dot" style={[styles.dot, { backgroundColor: categoryColors[category] }]} />
                <Text style={type.body}>{categoryLabel(category)}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.done} onPress={onClose} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.doneText}>Done</Text>
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
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    title: { flex: 1 },
    option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: MIN_TOUCH_TARGET + 4 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    done: {
      marginTop: 12,
      height: MIN_TOUCH_TARGET,
      borderRadius: radius.chip,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    doneText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.onPrimary },
  });
