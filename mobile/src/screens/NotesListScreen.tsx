import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { getNotes, deleteNote } from "../api/notes";
import { Note } from "../types/notes";
import NoteCard from "../components/NoteCard";
import { NotesStackParamList } from "../../App";
import { addCustomList, getCustomLists, removeCustomList } from "../lib/listPrefs";
import { syncScheduledReminders } from "../services/scheduledReminders";

type Nav = NativeStackNavigationProp<NotesStackParamList, "NotesList">;

export default function NotesListScreen() {
  const navigation = useNavigation<Nav>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("All");
  const [customLists, setCustomLists] = useState<string[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState("");

  const listNames = useMemo(() => {
    const names = [...new Set([...notes.map((n) => n.list_name || "General"), ...customLists])];
    return ["All", ...names.sort()];
  }, [notes, customLists]);

  const filteredNotes = useMemo(() => {
    if (activeTab === "All") return notes;
    return notes.filter((n) => (n.list_name || "General") === activeTab);
  }, [notes, activeTab]);

  const fetchNotes = useCallback(async () => {
    try {
      const [data, savedLists] = await Promise.all([getNotes(), getCustomLists()]);
      setNotes(data);
      setCustomLists(savedLists);
    } catch (err: any) {
      Alert.alert("Error", "Failed to load notes");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchNotes();
    }, [fetchNotes])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotes();
  };

  const handleDelete = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n._id !== noteId));
      syncScheduledReminders();
    } catch {
      Alert.alert("Error", "Failed to delete note");
    }
  };

  const handleCreateList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) {
      Alert.alert("Error", "List name cannot be empty");
      return;
    }

    if (listNames.includes(trimmed)) {
      Alert.alert("Error", "That list already exists");
      return;
    }

    try {
      const nextLists = await addCustomList(trimmed);
      setCustomLists(nextLists);
      setActiveTab(trimmed);
      setNewListName("");
      setShowCreateListModal(false);
    } catch {
      Alert.alert("Error", "Failed to create list");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {notes.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {listNames.map((name) => (
            <TouchableOpacity
              key={name}
              style={[styles.tab, activeTab === name && styles.tabActive]}
              onPress={() => setActiveTab(name)}
              onLongPress={() => {
                if (name === "All" || name === "General") return;
                const listNotes = notes.filter((n) => n.list_name === name);
                Alert.alert(
                  "Delete List",
                  `Delete "${name}" and its ${listNotes.length} note(s)?`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await Promise.all(listNotes.map((n) => deleteNote(n._id)));
                          setNotes((prev) => prev.filter((n) => n.list_name !== name));
                          syncScheduledReminders();
                          if (listNotes.length === 0) {
                            const nextLists = await removeCustomList(name);
                            setCustomLists(nextLists);
                          }
                          setActiveTab("All");
                        } catch {
                          Alert.alert("Error", "Failed to delete list");
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={[styles.tabText, activeTab === name && styles.tabTextActive]}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {notes.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No notes yet</Text>
          <Text style={styles.emptyHint}>Tap + to create your first note</Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <NoteCard
              note={item}
              onPress={() =>
                navigation.navigate("AddEditNote", {
                  note: item,
                })
              }
              onDelete={() => handleDelete(item._id)}
            />
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      <Modal
        visible={showCreateListModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateListModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create New List</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="List name"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setShowCreateListModal(false)}>
                <Text style={styles.modalActionSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCreateList}>
                <Text style={styles.modalActionPrimary}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.secondaryFab}
        onPress={() => setShowCreateListModal(true)}
      >
        <Ionicons name="folder-open-outline" size={22} color="#2E7D32" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          navigation.navigate("AddEditNote", {
            initialListName: activeTab !== "All" ? activeTab : undefined,
          })
        }
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    color: "#999",
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: "#bbb",
    marginTop: 4,
  },
  tabBar: {
    flexGrow: 0,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tabBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
  },
  tabActive: {
    backgroundColor: "#2E7D32",
  },
  tabText: {
    fontSize: 14,
    color: "#666",
  },
  tabTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2E7D32",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  secondaryFab: {
    position: "absolute",
    right: 20,
    bottom: 88,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d7e7d7",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#222",
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#333",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 18,
    marginTop: 16,
  },
  modalActionSecondary: {
    fontSize: 15,
    color: "#777",
    fontWeight: "600",
  },
  modalActionPrimary: {
    fontSize: 15,
    color: "#2E7D32",
    fontWeight: "700",
  },
});
