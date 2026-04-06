import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Note } from "../types/notes";

const CATEGORY_COLORS: Record<string, string> = {
  task: "#1976D2",
  errand: "#388E3C",
  idea: "#7B1FA2",
  reminder: "#F57C00",
  scheduled: "#C2185B",
  uncategorized: "#757575",
};

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onDelete: () => void;
}

export default function NoteCard({ note, onPress, onDelete }: NoteCardProps) {
  const categoryColor = CATEGORY_COLORS[note.category] || CATEGORY_COLORS.uncategorized;
  const reminderLabel = !note.reminders_enabled
    ? "Alerts off"
    : note.remind_at_hour !== null
      ? `Alerts at ${String(note.remind_at_hour).padStart(2, "0")}:00`
      : note.remind_on_date
        ? `Smart alerts on ${note.remind_on_date}`
        : "Smart alerts on";

  const handleLongPress = () => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={handleLongPress}
    >
      <View style={[styles.categoryStripe, { backgroundColor: categoryColor }]} />
      <View style={styles.body}>
        <Text style={styles.content} numberOfLines={3}>
          {note.content}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.categoryBadge, { color: categoryColor }]}>
            {note.category}
          </Text>
          {note.list_name && note.list_name !== "General" && (
            <Text style={styles.listName}>{note.list_name}</Text>
          )}
          <Text style={[styles.reminderBadge, !note.reminders_enabled && styles.reminderBadgeMuted]}>
            {reminderLabel}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 5,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    overflow: "hidden",
  },
  categoryStripe: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: 14,
  },
  content: {
    fontSize: 15,
    color: "#333",
    lineHeight: 21,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  categoryBadge: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  listName: {
    fontSize: 12,
    color: "#999",
  },
  reminderBadge: {
    fontSize: 12,
    color: "#2E7D32",
    fontWeight: "600",
  },
  reminderBadgeMuted: {
    color: "#999",
  },
});
