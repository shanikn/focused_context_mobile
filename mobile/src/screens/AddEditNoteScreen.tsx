import React, { useState, useLayoutEffect, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Text,
  StyleSheet,
  Alert,
} from "react-native";
import { useNavigation, useRoute, useFocusEffect, RouteProp } from "@react-navigation/native";
import { createNote, updateNote, getNotes } from "../api/notes";
import { NotesStackParamList } from "../../App";

type RouteParams = RouteProp<NotesStackParamList, "AddEditNote">;

export default function AddEditNoteScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();

  const isEditing = !!route.params?.noteId;
  const [content, setContent] = useState(route.params?.noteContent || "");
  const [listName, setListName] = useState(route.params?.noteListName || "General");
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
    if (!trimmed) {
      Alert.alert("Error", "Note content cannot be empty");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateNote(route.params!.noteId!, { content: trimmed });
      } else {
        await createNote(trimmed, listName.trim() || "General");
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
  }, [navigation, content, listName, saving]);

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
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
  },
  headerSave: {
    color: "#2E7D32",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 4,
  },
});
