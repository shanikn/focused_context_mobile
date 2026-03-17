import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { createNote, updateNote } from "../api/notes";
import { NotesStackParamList } from "../../App";

type RouteParams = RouteProp<NotesStackParamList, "AddEditNote">;

export default function AddEditNoteScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();

  const isEditing = !!route.params?.noteId;
  const [content, setContent] = useState(route.params?.noteContent || "");
  const [listName, setListName] = useState(route.params?.noteListName || "General");
  const [saving, setSaving] = useState(false);

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
      Alert.alert("Error", "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TextInput
        style={styles.contentInput}
        placeholder="What's on your mind?"
        value={content}
        onChangeText={setContent}
        multiline
        autoFocus
        textAlignVertical="top"
      />

      <TextInput
        style={styles.listInput}
        placeholder="List name (e.g. Groceries, Work)"
        value={listName}
        onChangeText={setListName}
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>
            {isEditing ? "Update" : "Save"}
          </Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 16,
  },
  contentInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
    minHeight: 120,
  },
  listInput: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: "#2E7D32",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
