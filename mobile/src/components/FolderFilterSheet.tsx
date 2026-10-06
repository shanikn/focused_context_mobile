import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { GENERAL } from "../lib/folderOrder";
import { TextButton } from "./ui";
import { MIN_TOUCH_TARGET, Theme, fonts, radius, spacing } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// The notes list's folder filter: every folder (empty ones too) with a
// checkbox. Checking applies right away; none checked shows every note.
export default function FolderFilterSheet({
  visible,
  folders,
  checked,
  onToggle,
  onClear,
  onDelete,
  onClose,
}: {
  visible: boolean;
  folders: string[]; // General first, then the others (lib/folderOrder.ts)
  checked: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  onDelete: (name: string) => void; // asks first; General can't be deleted
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={[type.cardTitle, styles.title]}>Show folders</Text>
            <TextButton label="Clear" onPress={onClear} disabled={checked.length === 0} />
          </View>
          <ScrollView style={styles.list}>
            {folders.map((name) => {
              const isChecked = checked.includes(name);
              return (
                <View key={name} style={styles.row}>
                  <TouchableOpacity
                    testID="folder-option"
                    style={styles.option}
                    onPress={() => onToggle(name)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={name}
                  >
                    <Ionicons
                      name={isChecked ? "checkbox" : "square-outline"}
                      size={22}
                      color={isChecked ? colors.primary : colors.textMuted}
                    />
                    <Text style={[type.body, styles.name]} numberOfLines={1}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                  {name !== GENERAL && (
                    <TouchableOpacity
                      style={styles.delete}
                      onPress={() => onDelete(name)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete folder ${name}`}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
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
      maxHeight: "75%",
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.card,
      borderTopRightRadius: radius.card,
      padding: spacing.screen,
      paddingBottom: spacing.screen + 8,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    title: { flex: 1 },
    list: { flexGrow: 0 },
    row: { flexDirection: "row", alignItems: "center" },
    option: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: MIN_TOUCH_TARGET + 4 },
    name: { flexShrink: 1 },
    delete: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
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
