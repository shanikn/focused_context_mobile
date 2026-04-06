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
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { getNotes, deleteNote } from "../api/notes";
import { Note } from "../types/notes";
import NoteCard from "../components/NoteCard";
import { NotesStackParamList } from "../../App";

type Nav = NativeStackNavigationProp<NotesStackParamList, "NotesList">;

export default function NotesListScreen() {
  const navigation = useNavigation<Nav>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("All");

  const listNames = useMemo(() => {
    const names = [...new Set(notes.map((n) => n.list_name || "General"))];
    return ["All", ...names.sort()];
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (activeTab === "All") return notes;
    return notes.filter((n) => (n.list_name || "General") === activeTab);
  }, [notes, activeTab]);

  const fetchNotes = useCallback(async () => {
    try {
      const data = await getNotes();
      setNotes(data);
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
    } catch {
      Alert.alert("Error", "Failed to delete note");
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("AddEditNote")}
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
});
