import React, { useState, useLayoutEffect, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Text,
  StyleSheet,
  Alert,
  Switch,
} from "react-native";
import { useNavigation, useRoute, useFocusEffect, RouteProp } from "@react-navigation/native";
import { createNote, updateNote, getNotes } from "../api/notes";
import { NotesStackParamList } from "../../App";

type RouteParams = RouteProp<NotesStackParamList, "AddEditNote">;

export default function AddEditNoteScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const existingNote = route.params?.note;

  const isEditing = !!existingNote?._id;
  const [content, setContent] = useState(existingNote?.content || "");
  const [listName, setListName] = useState(existingNote?.list_name || "General");
  const [remindersEnabled, setRemindersEnabled] = useState(existingNote?.reminders_enabled ?? true);
  const [remindOnDate, setRemindOnDate] = useState(existingNote?.remind_on_date || "");
  const [remindAtHour, setRemindAtHour] = useState(
    existingNote?.remind_at_hour !== null && existingNote?.remind_at_hour !== undefined
      ? String(existingNote.remind_at_hour)
      : ""
  );
  const [existingLists, setExistingLists] = useState<string[]>([]);
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getNotes()
        .then((notes) => {
          const names = [...new Set(notes.map((n) => n.list_name || "General"))].sort();
          setExistingLists(names);
        })
        .catch(() => {});
    }, [])
  );

  const handleSave = async () => {
    const trimmed = content.trim();
    const trimmedListName = listName.trim() || "General";
    const trimmedDate = remindOnDate.trim();
    const trimmedHour = remindAtHour.trim();
    const parsedHour = trimmedHour === "" ? null : Number(trimmedHour);

    if (!trimmed) {
      Alert.alert("Error", "Note content cannot be empty");
      return;
    }

    if (trimmedDate && !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      Alert.alert("Error", "Reminder date must use YYYY-MM-DD");
      return;
    }

    if (
      trimmedHour !== "" &&
      (parsedHour === null ||
        !Number.isInteger(parsedHour) ||
        parsedHour < 0 ||
        parsedHour > 23)
    ) {
      Alert.alert("Error", "Reminder hour must be a number between 0 and 23");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateNote(existingNote!._id, {
          content: trimmed,
          list_name: trimmedListName,
          remind_on_date: trimmedDate,
          remind_at_hour: trimmedHour,
          reminders_enabled: remindersEnabled,
        });
      } else {
        await createNote(
          trimmed,
          trimmedListName,
          remindersEnabled,
          parsedHour ?? undefined,
          trimmedDate || undefined
        );
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={styles.headerSave}>
            {saving ? "Saving..." : isEditing ? "Update" : "Save"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, content, listName, saving, isEditing]);

  return (
    <View style={styles.container}>
      {!isEditing && (
        <View style={styles.listSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listPills}
          >
            {existingLists.map((name) => (
              <TouchableOpacity
                key={name}
                style={[styles.pill, listName === name && styles.pillActive]}
                onPress={() => {
                  setListName(name);
                  setShowNewListInput(false);
                }}
              >
                <Text style={[styles.pillText, listName === name && styles.pillTextActive]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.pill, styles.pillNew, showNewListInput && styles.pillActive]}
              onPress={() => {
                setShowNewListInput(true);
                setListName("");
              }}
            >
              <Text style={[styles.pillText, showNewListInput && styles.pillTextActive]}>
                + New List
              </Text>
            </TouchableOpacity>
          </ScrollView>
          {showNewListInput && (
            <TextInput
              style={styles.newListInput}
              placeholder="New list name"
              value={listName}
              onChangeText={setListName}
              autoFocus
            />
          )}
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="What's on your mind?"
        value={content}
        onChangeText={setContent}
        multiline
        autoFocus={!showNewListInput}
        textAlignVertical="top"
      />

      <View style={styles.reminderSection}>
        <View style={styles.reminderHeader}>
          <View style={styles.reminderCopy}>
            <Text style={styles.reminderTitle}>Phone alerts for this note</Text>
            <Text style={styles.reminderHint}>
              Keep smart reminders on, or turn them off for notes that should stay silent.
            </Text>
          </View>
          <Switch
            value={remindersEnabled}
            onValueChange={setRemindersEnabled}
            trackColor={{ false: "#d7d7d7", true: "#A5D6A7" }}
            thumbColor={remindersEnabled ? "#2E7D32" : "#f4f4f4"}
          />
        </View>

        <Text style={styles.helperLabel}>Reminder date override</Text>
        <TextInput
          style={[styles.metaInput, !remindersEnabled && styles.metaInputDisabled]}
          placeholder="YYYY-MM-DD"
          value={remindOnDate}
          onChangeText={setRemindOnDate}
          editable={remindersEnabled}
          autoCapitalize="none"
        />

        <Text style={styles.helperLabel}>Reminder hour override</Text>
        <TextInput
          style={[styles.metaInput, !remindersEnabled && styles.metaInputDisabled]}
          placeholder="0-23, optional"
          value={remindAtHour}
          onChangeText={setRemindAtHour}
          editable={remindersEnabled}
          keyboardType="number-pad"
        />
        <Text style={styles.helperFootnote}>
          Leave these blank to use the smart time context already inferred from the note.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  listSection: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 8,
  },
  listPills: {
    paddingHorizontal: 12,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
  },
  pillActive: {
    backgroundColor: "#2E7D32",
  },
  pillNew: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
  pillText: {
    fontSize: 13,
    color: "#666",
  },
  pillTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  newListInput: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    fontSize: 14,
  },
  input: {
    backgroundColor: "#fff",
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 220,
  },
  reminderSection: {
    backgroundColor: "#fff",
    marginTop: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  reminderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  reminderCopy: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  reminderHint: {
    marginTop: 4,
    fontSize: 13,
    color: "#777",
    lineHeight: 18,
  },
  helperLabel: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  metaInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  metaInputDisabled: {
    backgroundColor: "#f1f1f1",
    color: "#999",
  },
  helperFootnote: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: "#888",
  },
  headerSave: {
    color: "#2E7D32",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 4,
  },
});
