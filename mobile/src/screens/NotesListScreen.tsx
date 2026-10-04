import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  SectionList,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { getNotes, deleteNote } from "../api/notes";
import { Note } from "../types/notes";
import NoteCard from "../components/NoteCard";
import { NotesStackParamList } from "../../App";
import { addCustomList, getCustomLists, removeCustomList } from "../lib/listPrefs";
import { ALL, GENERAL, folderTabs } from "../lib/folderOrder";
import { groupNotes } from "../lib/noteSections";
import { currentPlaceLabel } from "../lib/noteCardInfo";
import { getReminderLocation } from "../lib/reminderPrefs";
import { syncScheduledReminders } from "../services/scheduledReminders";
import { loadPlaces } from "../services/placesStore";
import { ServerPlace } from "../lib/userPlaces";
import { CategoryColors, DEFAULT_CATEGORY_COLORS, getCategoryColors } from "../lib/categoryColors";
import { Chip, ChipRow, SectionLabel } from "../components/ui";
import { colors, fonts, MIN_TOUCH_TARGET, radius, spacing, type } from "../theme";

type Nav = NativeStackNavigationProp<NotesStackParamList, "NotesList">;

const FAB_SIZE = 56;
const FAB_MARGIN = 16;

export default function NotesListScreen() {
  const navigation = useNavigation<Nav>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [places, setPlaces] = useState<ServerPlace[]>([]);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [categoryColors, setCategoryColors] = useState<CategoryColors>(DEFAULT_CATEGORY_COLORS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(ALL);
  const [customLists, setCustomLists] = useState<string[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState("");

  // All, then General, then the other folders alphabetically (no re-sorting here)
  const listNames = useMemo(() => folderTabs(notes, customLists), [notes, customLists]);

  const filteredNotes = useMemo(() => {
    if (activeTab === ALL) return notes;
    return notes.filter((n) => (n.list_name || GENERAL) === activeTab);
  }, [notes, activeTab]);

  const sections = useMemo(
    () => groupNotes(filteredNotes, new Date()).map((s) => ({ ...s, data: s.notes })),
    [filteredNotes]
  );

  const fetchNotes = useCallback(async () => {
    try {
      const [data, savedLists, userPlaces, colorsByCategory, location] = await Promise.all([
        getNotes(),
        getCustomLists(),
        loadPlaces().catch(() => []),
        getCategoryColors().catch(() => DEFAULT_CATEGORY_COLORS),
        getReminderLocation().catch(() => null),
      ]);
      setNotes(data);
      setPlaces(userPlaces);
      setCategoryColors(colorsByCategory);
      setCustomLists(savedLists);
      setCurrentLocation(location);
    } catch {
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

  const handleDeleteFolder = (name: string) => {
    if (name === ALL || name === GENERAL) return;
    const listNotes = notes.filter((n) => n.list_name === name);
    Alert.alert("Delete List", `Delete "${name}" and its ${listNotes.length} note(s)?`, [
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
            setActiveTab(ALL);
          } catch {
            Alert.alert("Error", "Failed to delete list");
          }
        },
      },
    ]);
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

  const placeLabel = currentPlaceLabel(currentLocation, places);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={[type.screenTitle, styles.title]} numberOfLines={1}>
          My Notes
        </Text>
        <TouchableOpacity
          style={styles.placeChip}
          onPress={() => navigation.getParent()?.navigate("Settings")}
          accessibilityRole="button"
          accessibilityLabel={`${placeLabel}. Open Settings`}
        >
          <Ionicons name="location-outline" size={16} color={colors.primaryDark} />
          <Text style={styles.placeChipText} numberOfLines={1}>
            {placeLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowCreateListModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Create a new folder"
        >
          <Ionicons name="folder-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {notes.length > 0 && (
            <View style={styles.chips}>
              <ChipRow scroll style={styles.chipsContent}>
                {listNames.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    selected={activeTab === name}
                    onPress={() => setActiveTab(name)}
                    onLongPress={() => handleDeleteFolder(name)}
                  />
                ))}
              </ChipRow>
            </View>
          )}

          {notes.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={64} color={colors.border} />
              <Text style={[type.cardTitle, styles.emptyText]}>No notes yet</Text>
              <Text style={type.caption}>Tap + to create your first note</Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item._id}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <SectionLabel title={section.title} style={styles.sectionLabel} />
              )}
              renderItem={({ item }) => (
                <NoteCard
                  note={item}
                  onPress={() => navigation.navigate("AddEditNote", { note: item })}
                  onDelete={() => handleDelete(item._id)}
                  places={places}
                  categoryColors={categoryColors}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: spacing.noteGap }} />}
              contentContainerStyle={styles.listContent}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          )}
        </>
      )}

      <Modal
        visible={showCreateListModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateListModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[type.cardTitle, styles.modalTitle]}>Create New List</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="List name"
              placeholderTextColor={colors.textMuted}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalAction} onPress={() => setShowCreateListModal(false)}>
                <Text style={styles.modalActionSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAction} onPress={handleCreateList}>
                <Text style={styles.modalActionPrimary}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TouchableOpacity
        style={styles.fab}
        onPress={() =>
          navigation.navigate("AddEditNote", {
            initialListName: activeTab !== ALL ? activeTab : undefined,
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Add a note"
      >
        <Ionicons name="add" size={28} color={colors.onPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 20,
  },
  title: { flex: 1 },
  placeChip: {
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    backgroundColor: colors.primarySoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 170,
  },
  placeChipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primaryDark, flexShrink: 1 },
  iconButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  chips: { flexGrow: 0, paddingBottom: 4 },
  chipsContent: { paddingHorizontal: spacing.screen },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 4 },
  emptyText: { marginTop: 12 },
  sectionLabel: { marginTop: 12, marginRight: 4, marginBottom: 0, marginLeft: 4, paddingBottom: 8 },
  listContent: {
    paddingHorizontal: spacing.screen,
    // keep the last card clear of the FAB
    paddingBottom: FAB_SIZE + FAB_MARGIN * 2,
  },
  fab: {
    position: "absolute",
    right: FAB_MARGIN,
    bottom: FAB_MARGIN,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.fab,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18 },
  modalTitle: { marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 12 },
  modalAction: { height: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 8 },
  modalActionSecondary: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textMuted },
  modalActionPrimary: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.primaryDark },
});
