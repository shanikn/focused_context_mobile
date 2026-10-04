import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import { Note } from "../types/notes";
import { ServerPlace } from "../lib/userPlaces";
import { CategoryColors } from "../lib/categoryColors";
import { noteCardInfo } from "../lib/noteCardInfo";
import { IconTile } from "./ui";
import { colors, fonts, radius, type } from "../theme";

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onDelete: () => void;
  places: ServerPlace[];
  categoryColors: CategoryColors;
}

export default function NoteCard({ note, onPress, onDelete, places, categoryColors }: NoteCardProps) {
  const info = noteCardInfo(note, places, categoryColors);

  const confirmDelete = () => {
    Alert.alert("Delete Note", "Are you sure you want to delete this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onDelete },
    ]);
  };

  const renderRightActions = () => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={confirmDelete}
      accessibilityRole="button"
      accessibilityLabel="Delete note"
    >
      <Ionicons name="trash-outline" size={22} color={colors.onPrimary} />
      <Text style={styles.deleteActionText}>Delete</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} rightThreshold={40}>
      <TouchableOpacity style={styles.card} onPress={onPress} onLongPress={confirmDelete}>
        <IconTile icon={info.icon} backgroundColor={info.tileColor} iconColor={info.tileIconColor} />

        <View style={styles.body}>
          {/* writingDirection auto: Hebrew notes read right-to-left inside the LTR layout */}
          <Text style={[type.body, styles.content]} numberOfLines={2}>
            {note.content}
          </Text>
          <View style={styles.meta}>
            <Text style={[type.caption, styles.category, { color: info.categoryTextColor }]}>
              {info.categoryLabel}
            </Text>
            {info.placeName && (
              <>
                <Text style={type.caption}> · </Text>
                <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                <Text style={type.caption} numberOfLines={1}>
                  {" "}
                  {info.placeName}
                </Text>
              </>
            )}
            {info.folderName && (
              <Text style={type.caption} numberOfLines={1}>
                {" · "}
                {info.folderName}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.trailing}>
          {info.trailing.kind === "time" && <Text style={styles.time}>{info.trailing.time}</Text>}
          {info.trailing.kind === "smart" && (
            <Ionicons name="sparkles-outline" size={20} color={colors.primary} accessibilityLabel="Smart alerts" />
          )}
          {info.trailing.kind === "off" && (
            <Ionicons
              name="notifications-off-outline"
              size={20}
              color={colors.textMuted}
              accessibilityLabel="Alerts off"
            />
          )}
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.noteCard,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  body: { flex: 1 },
  content: { writingDirection: "auto" },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 2 },
  category: { fontFamily: fonts.bodySemi },
  trailing: { minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  time: {
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  deleteAction: {
    width: 96,
    borderRadius: radius.noteCard,
    backgroundColor: colors.danger,
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  deleteActionText: { color: colors.onPrimary, fontFamily: fonts.bodySemi, fontSize: 12 },
});
