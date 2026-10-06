import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
import { addFolder, loadFolders, removeFolder } from "../services/foldersStore";
import { GENERAL, folderNames } from "../lib/folderOrder";
import { getFolderSelection, setFolderSelection } from "../lib/folderSelection";
import FolderFilterSheet from "../components/FolderFilterSheet";
import { getNotesView, NotesView, notesViewSections, setNotesView } from "../lib/notesView";
import { currentPlaceLabel } from "../lib/noteCardInfo";
import { getReminderLocation } from "../lib/reminderPrefs";
import { syncScheduledReminders } from "../services/scheduledReminders";
import { syncStoreAlerts } from "../services/storeAlerts";
import { loadPlaces } from "../services/placesStore";
import { ServerPlace } from "../lib/userPlaces";
import {
  CATEGORIES,
  categoryLabel,
  CategoryColors,
  DEFAULT_CATEGORY_COLORS,
  getCategoryColors,
} from "../lib/categoryColors";
import { ALL_CATEGORIES, filterNotes, hasActiveFilters } from "../lib/noteFilter";
import { Chip, ChipRow, SectionLabel, TextButton } from "../components/ui";
import { MIN_TOUCH_TARGET, Theme, fonts, radius, spacing } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

type Nav = NativeStackNavigationProp<NotesStackParamList, "NotesList">;

const FAB_SIZE = 56;
const FAB_MARGIN = 16;

export default function NotesListScreen() {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<Nav>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [places, setPlaces] = useState<ServerPlace[]>([]);
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [categoryColors, setCategoryColors] = useState<CategoryColors>(DEFAULT_CATEGORY_COLORS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // the last load failed; shown only when there are no notes to show
  const [loadFailed, setLoadFailed] = useState(false);
  // focus refetches can overlap: only the newest one may update the screen
  const latestFetch = useRef(0);
  // the folders checked in the filter sheet; remembered while the app is open
  const [checkedFolders, setCheckedFolders] = useState<string[]>(getFolderSelection);
  const [showFolderFilter, setShowFolderFilter] = useState(false);
  const [customLists, setCustomLists] = useState<string[]>([]);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [view, setView] = useState<NotesView>("recent");

  useEffect(() => {
    getNotesView().then(setView);
  }, []);

  const chooseView = (next: NotesView) => {
    setView(next);
    setNotesView(next);
  };

  // General, then the other folders alphabetically, empty ones included
  const listNames = useMemo(() => folderNames(notes, customLists), [notes, customLists]);

  // a checked folder that no longer exists (deleted elsewhere) doesn't count
  const activeFolders = useMemo(
    () => checkedFolders.filter((name) => listNames.includes(name)),
    [checkedFolders, listNames]
  );

  const chooseFolders = (names: string[]) => {
    setCheckedFolders(names);
    setFolderSelection(names);
  };

  const toggleFolder = (name: string) =>
    chooseFolders(checkedFolders.includes(name) ? checkedFolders.filter((n) => n !== name) : [...checkedFolders, name]);

  // checked folders + category chip + search, combined (lib/noteFilter.ts)
  const filters = { folders: activeFolders, category: categoryFilter, query };
  const filteredNotes = useMemo(
    () => filterNotes(notes, { folders: activeFolders, category: categoryFilter, query }),
    [notes, activeFolders, categoryFilter, query]
  );

  const clearSearchAndFilter = () => {
    setQuery("");
    setCategoryFilter(ALL_CATEGORIES);
    chooseFolders([]);
  };

  // Recent: one list, newest first; Upcoming: the date sections
  const sections = useMemo(
    () => notesViewSections(view, filteredNotes, new Date()).map((s) => ({ ...s, data: s.notes })),
    [view, filteredNotes]
  );

  const fetchNotes = useCallback(async () => {
    const fetchId = ++latestFetch.current;
    const isLatest = () => fetchId === latestFetch.current;
    try {
      const [data, savedLists, userPlaces, colorsByCategory, location] = await Promise.all([
        getNotes(),
        loadFolders().catch(() => null),
        loadPlaces().catch(() => []),
        getCategoryColors().catch(() => DEFAULT_CATEGORY_COLORS),
        getReminderLocation().catch(() => null),
      ]);
      if (!isLatest()) {
        return;
      }
      setNotes(data);
      setPlaces(userPlaces);
      setCategoryColors(colorsByCategory);
      if (savedLists) {
        setCustomLists(savedLists);
      }
      setCurrentLocation(location);
      setLoadFailed(false);
    } catch {
      // a failed refetch keeps the notes already on screen; the error is
      // shown only when there's nothing to show (see below)
      if (isLatest()) {
        setLoadFailed(true);
      }
    } finally {
      if (isLatest()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const handleRetry = () => {
    setLoading(true);
    fetchNotes();
  };

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
      syncStoreAlerts();
    } catch {
      Alert.alert("Error", "Failed to delete note");
    }
  };

  // Deleting a folder never deletes notes: they move to General (on the
  // server). A folder with notes asks first, saying so.
  const handleDeleteFolder = (name: string) => {
    if (name === GENERAL) return;
    const count = notes.filter((n) => n.list_name === name).length;
    const message =
      count === 0
        ? `Delete the folder "${name}"?`
        : `"${name}" has ${count} ${count === 1 ? "note" : "notes"}. Delete the folder and move ${
            count === 1 ? "it" : "them"
          } to General?`;
    Alert.alert("Delete folder", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete folder",
        style: "destructive",
        onPress: async () => {
          try {
            const { folders } = await removeFolder(name);
            setCustomLists(folders);
            setNotes((prev) => prev.map((n) => (n.list_name === name ? { ...n, list_name: GENERAL } : n)));
            chooseFolders(getFolderSelection().filter((n) => n !== name));
          } catch {
            Alert.alert("Couldn't delete the folder", "Check your connection and try again.");
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
      const nextLists = await addFolder(trimmed);
      setCustomLists(nextLists);
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

      {notes.length > 0 && (
        <View style={styles.viewToggle} accessibilityRole="tablist">
          {(
            [
              ["recent", "Recent"],
              ["upcoming", "Upcoming"],
            ] as const
          ).map(([value, label]) => {
            const selected = view === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.viewOption, selected && styles.viewOptionSelected]}
                onPress={() => chooseView(value)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
              >
                <Text style={[styles.viewOptionText, selected && styles.viewOptionTextSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {notes.length > 0 && (
        <View style={styles.searchWrap}>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search notes"
            />
            {query.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.filterButton, activeFolders.length > 0 && styles.filterButtonActive]}
            onPress={() => setShowFolderFilter(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter by folder"
            accessibilityValue={activeFolders.length > 0 ? { text: `${activeFolders.length} checked` } : undefined}
          >
            <Ionicons name="filter" size={22} color={activeFolders.length > 0 ? colors.primaryDark : colors.text} />
            {activeFolders.length > 0 && (
              <View style={styles.badge}>
                <Text testID="folder-filter-count" style={styles.badgeText}>
                  {activeFolders.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {notes.length > 0 && (
            <View style={styles.chips}>
              <ChipRow scroll style={styles.chipsContent}>
                <Chip
                  label="All"
                  icon="pricetags-outline"
                  selected={categoryFilter === ALL_CATEGORIES}
                  onPress={() => setCategoryFilter(ALL_CATEGORIES)}
                  accessibilityLabel="All categories"
                />
                {CATEGORIES.map((category) => (
                  <Chip
                    key={category}
                    label={categoryLabel(category)}
                    dotColor={categoryColors[category]}
                    selected={categoryFilter === category}
                    onPress={() => setCategoryFilter(categoryFilter === category ? ALL_CATEGORIES : category)}
                    accessibilityLabel={`${categoryLabel(category)} notes`}
                  />
                ))}
              </ChipRow>
            </View>
          )}

          {notes.length === 0 && loadFailed ? (
            <View style={styles.center}>
              <Ionicons name="cloud-offline-outline" size={56} color={colors.border} />
              <Text style={[type.cardTitle, styles.emptyText]}>Couldn't load your notes</Text>
              <Text style={type.caption}>Check your connection and try again</Text>
              <TextButton label="Try again" onPress={handleRetry} />
            </View>
          ) : notes.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="document-text-outline" size={64} color={colors.border} />
              <Text style={[type.cardTitle, styles.emptyText]}>No notes yet</Text>
              <Text style={type.caption}>Tap + to create your first note</Text>
            </View>
          ) : filteredNotes.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="search-outline" size={56} color={colors.border} />
              <Text style={[type.cardTitle, styles.emptyText]}>No matching notes</Text>
              {activeFolders.length > 0 && <Text style={type.caption}>No notes in the checked folders</Text>}
              {hasActiveFilters(filters) && (
                <TextButton label="Clear search and filter" onPress={clearSearchAndFilter} />
              )}
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item._id}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) =>
                section.title ? <SectionLabel title={section.title} style={styles.sectionLabel} /> : null
              }
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
              contentContainerStyle={[styles.listContent, view === "recent" && styles.recentListContent]}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          )}
        </>
      )}

      <FolderFilterSheet
        visible={showFolderFilter}
        folders={listNames}
        checked={activeFolders}
        onToggle={toggleFolder}
        onClear={() => chooseFolders([])}
        onDelete={handleDeleteFolder}
        onClose={() => setShowFolderFilter(false)}
      />

      <Modal
        visible={showCreateListModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCreateListModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[type.cardTitle, styles.modalTitle]}>New folder</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Folder name"
              placeholderTextColor={colors.textMuted}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalAction}
                onPress={() => setShowCreateListModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalActionSecondary}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalAction}
                onPress={handleCreateList}
                accessibilityRole="button"
                accessibilityLabel="Create"
              >
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
            // exactly one folder checked: the new note starts there
            initialListName: activeFolders.length === 1 ? activeFolders[0] : undefined,
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

const makeStyles = ({ colors, type }: Theme) =>
  StyleSheet.create({
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
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: spacing.screen,
    marginBottom: 10,
    padding: 4,
    borderRadius: radius.chip,
    backgroundColor: colors.primarySoft,
  },
  viewOption: {
    flex: 1,
    height: 40,
    borderRadius: radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  viewOptionSelected: { backgroundColor: colors.primary },
  viewOptionText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.primaryDark },
  viewOptionTextSelected: { color: colors.onPrimary },
  chips: { flexGrow: 0, paddingBottom: 4 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.screen, paddingBottom: 10 },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filterButtonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.onPrimary },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 14,
    paddingRight: 4,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
    // Hebrew searches read right-to-left inside the LTR layout
    writingDirection: "auto",
  },
  clearButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsContent: { paddingHorizontal: spacing.screen },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 4 },
  emptyText: { marginTop: 12 },
  sectionLabel: { marginTop: 12, marginRight: 4, marginBottom: 0, marginLeft: 4, paddingBottom: 8 },
  listContent: {
    paddingHorizontal: spacing.screen,
    // keep the last card clear of the FAB
    paddingBottom: FAB_SIZE + FAB_MARGIN * 2,
  },
  // no section header above the first card in Recent
  recentListContent: { paddingTop: 12 },
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
