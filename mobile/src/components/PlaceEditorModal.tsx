import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Theme } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// Add or rename a place. Keywords help the AI tag notes with this place.
export default function PlaceEditorModal({
  visible,
  title,
  initialName = "",
  initialKeywords = [],
  onSave,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initialName?: string;
  initialKeywords?: string[];
  onSave: (name: string, keywords: string[]) => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState(initialName);
  const [keywords, setKeywords] = useState(initialKeywords.join(", "));

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setKeywords(initialKeywords.join(", "));
    }
  }, [visible, initialName, initialKeywords]);

  const trimmed = name.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Gym, Pharmacy"
            placeholderTextColor={colors.textMuted}
            autoFocus
          />
          <Text style={styles.label}>Keywords (optional)</Text>
          <TextInput
            style={styles.input}
            value={keywords}
            onChangeText={setKeywords}
            placeholder="e.g. workout, squats"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Notes that mention the name or a keyword are tagged with this place.
          </Text>
          <TouchableOpacity
            style={[styles.primary, !trimmed && styles.disabled]}
            disabled={!trimmed}
            onPress={() =>
              onSave(
                trimmed,
                keywords.split(",").map((k) => k.trim()).filter(Boolean)
              )
            }
          >
            <Text style={styles.primaryText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={onCancel}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 20 },
  title: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: 12 },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 16 },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: colors.textMuted, fontSize: 14 },
});
