import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import { Note } from "../types/notes";
import { locationLabel as placeLabel, reminderLabel } from "../lib/noteLabels";
import { ServerPlace } from "../lib/userPlaces";

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
  places: ServerPlace[];
}

export default function NoteCard({ note, onPress, onDelete, places }: NoteCardProps) {
  const categoryColor = CATEGORY_COLORS[note.category] || CATEGORY_COLORS.uncategorized;
  const locationLabel = placeLabel(note, places);
  const alertsLabel = reminderLabel(note);
  const alertsOff = note.reminders_enabled === false;

  const handleLongPress = () => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  const renderRightActions = () => (
    <TouchableOpacity style={styles.deleteAction} onPress={handleLongPress}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      containerStyle={styles.swipeContainer}
    >
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
            {locationLabel && (
              <Text style={styles.contextBadge}>{locationLabel}</Text>
            )}
            {note.list_name && note.list_name !== "General" && (
              <Text style={styles.listName}>{note.list_name}</Text>
            )}
            <Text style={[styles.reminderBadge, alertsOff && styles.reminderBadgeMuted]}>
              {alertsLabel}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    marginHorizontal: 16,
    marginVertical: 5,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
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
  contextBadge: {
    fontSize: 12,
    color: "#546E7A",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  reminderBadge: {
    fontSize: 12,
    color: "#2E7D32",
    fontWeight: "600",
  },
  reminderBadgeMuted: {
    color: "#999",
  },
  deleteAction: {
    width: 96,
    borderRadius: 10,
    backgroundColor: "#d32f2f",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  deleteActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
