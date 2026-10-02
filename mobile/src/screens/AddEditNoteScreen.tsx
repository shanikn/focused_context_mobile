import React, { useState, useLayoutEffect, useCallback, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Text,
  StyleSheet,
  Alert,
  Switch,
  Platform,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useNavigation, useRoute, useFocusEffect, RouteProp } from "@react-navigation/native";
import { createNote, updateNote, getNotes } from "../api/notes";
import { NotesStackParamList } from "../../App";
import { getCustomLists } from "../lib/listPrefs";

type RouteParams = RouteProp<NotesStackParamList, "AddEditNote">;
const CATEGORY_OPTIONS = ["task", "errand", "idea", "reminder", "scheduled", "uncategorized"] as const;
const LOCATION_OPTIONS = ["home", "uni", "work", "errands"] as const;

function formatDateValue(date: Date | null): string {
  if (!date) {
    return "Use smart date";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeValue(date: Date | null): string {
  if (!date) {
    return "Use smart time";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseDateValue(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function parseTimeValue(hour?: number | null, minute?: number | null): Date | null {
  if (hour === null || hour === undefined) {
    return null;
  }

  const date = new Date();
  date.setHours(hour, minute ?? 0, 0, 0);
  return date;
}

export default function AddEditNoteScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const existingNote = route.params?.note;
  const initialListName = route.params?.initialListName;

  const isEditing = !!existingNote?._id;
  const [content, setContent] = useState(existingNote?.content || "");
  const [listName, setListName] = useState(existingNote?.list_name || initialListName || "General");
  const [categoryExplicit, setCategoryExplicit] = useState(existingNote?.category_explicit ?? false);
  const [selectedCategory, setSelectedCategory] = useState(existingNote?.category || "uncategorized");
  const [locationExplicit, setLocationExplicit] = useState(existingNote?.location_explicit ?? false);
  const [selectedLocation, setSelectedLocation] = useState(existingNote?.location_value || "home");
  const [remindersEnabled, setRemindersEnabled] = useState(existingNote?.reminders_enabled ?? true);
  const [dateOverrideEnabled, setDateOverrideEnabled] = useState(
    existingNote?.remind_date_explicit ?? false
  );
  const [timeOverrideEnabled, setTimeOverrideEnabled] = useState(
    existingNote?.remind_time_explicit ?? (existingNote?.remind_at_hour !== null && existingNote?.remind_at_hour !== undefined)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    existingNote?.remind_date_explicit ? parseDateValue(existingNote?.remind_on_date) : null
  );
  const [selectedTime, setSelectedTime] = useState<Date | null>(
    (existingNote?.remind_time_explicit ?? false)
      ? parseTimeValue(existingNote?.remind_at_hour, existingNote?.remind_at_minute)
      : null
  );
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === "ios");
  const [showTimePicker, setShowTimePicker] = useState(Platform.OS === "ios");
  const [existingLists, setExistingLists] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getNotes(), getCustomLists()])
        .then(([notes, customLists]) => {
          const names = [...new Set([...notes.map((n) => n.list_name || "General"), ...customLists])].sort();
          setExistingLists(names);
        })
        .catch(() => {});
    }, [])
  );

  const handleSave = async () => {
    const trimmed = content.trim();
    const trimmedListName = listName.trim() || "General";
    const reminderDate = dateOverrideEnabled && selectedDate ? formatDateValue(selectedDate) : "";
    const reminderHour = timeOverrideEnabled && selectedTime ? selectedTime.getHours() : null;
    const reminderMinute = timeOverrideEnabled && selectedTime ? selectedTime.getMinutes() : null;

    if (!trimmed) {
      Alert.alert("Error", "Note content cannot be empty");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await updateNote(existingNote!._id, {
          content: trimmed,
          list_name: trimmedListName,
          category: selectedCategory,
          category_explicit: categoryExplicit,
          location_explicit: locationExplicit,
          location_value: locationExplicit ? selectedLocation : "",
          remind_date_explicit: dateOverrideEnabled,
          remind_time_explicit: timeOverrideEnabled,
          remind_on_date: reminderDate,
          remind_at_hour: reminderHour === null ? "" : String(reminderHour),
          remind_at_minute: reminderMinute === null ? "" : String(reminderMinute),
          reminders_enabled: remindersEnabled,
        });
      } else {
        await createNote(
          trimmed,
          trimmedListName,
          remindersEnabled,
          categoryExplicit,
          selectedCategory,
          locationExplicit,
          locationExplicit ? selectedLocation : undefined,
          dateOverrideEnabled,
          timeOverrideEnabled,
          reminderHour ?? undefined,
          reminderMinute ?? undefined,
          reminderDate || undefined
        );
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  // The header button is set up once per effect run, so it must call the
  // latest handleSave. Capturing handleSave directly saved stale state:
  // changing only the time/date/category/location and tapping Update sent
  // the old values.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => handleSaveRef.current()} disabled={saving}>
          <Text style={styles.headerSave}>
            {saving ? "Saving..." : isEditing ? "Update" : "Save"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, saving, isEditing]);

  const handleDateChange = (_event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (nextDate) {
      setDateOverrideEnabled(true);
      setSelectedDate(nextDate);
    }
  };

  const handleTimeChange = (_event: DateTimePickerEvent, nextTime?: Date) => {
    if (Platform.OS !== "ios") {
      setShowTimePicker(false);
    }
    if (nextTime) {
      setTimeOverrideEnabled(true);
      setSelectedTime(nextTime);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.listSection}>
        <Text style={styles.sectionTitle}>List</Text>
        <Text style={styles.sectionHint}>
          Choose where this note belongs. You can move existing notes between lists.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listPills}
        >
          {existingLists.map((name) => (
            <TouchableOpacity
              key={name}
              style={[styles.pill, listName === name && styles.pillActive]}
              onPress={() => setListName(name)}
            >
              <Text style={[styles.pillText, listName === name && styles.pillTextActive]}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <TextInput
        style={styles.input}
        placeholder="What's on your mind?"
        value={content}
        onChangeText={setContent}
        multiline
        autoFocus
        textAlignVertical="top"
      />

      <View style={styles.categorySection}>
        <Text style={styles.sectionTitle}>Category</Text>
        <Text style={styles.sectionHint}>
          Keep smart categorization, or override it if you want this note filed differently.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listPills}
        >
          <TouchableOpacity
            style={[styles.pill, !categoryExplicit && styles.pillActive]}
            onPress={() => setCategoryExplicit(false)}
          >
            <Text style={[styles.pillText, !categoryExplicit && styles.pillTextActive]}>
              Smart
            </Text>
          </TouchableOpacity>
          {CATEGORY_OPTIONS.map((category) => (
            <TouchableOpacity
              key={category}
              style={[styles.pill, categoryExplicit && selectedCategory === category && styles.pillActive]}
              onPress={() => {
                setSelectedCategory(category);
                setCategoryExplicit(true);
              }}
            >
              <Text
                style={[
                  styles.pillText,
                  categoryExplicit && selectedCategory === category && styles.pillTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.categorySection}>
        <Text style={styles.sectionTitle}>Location</Text>
        <Text style={styles.sectionHint}>
          Keep smart location inference, or override it if this note belongs to a specific place.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listPills}
        >
          <TouchableOpacity
            style={[styles.pill, !locationExplicit && styles.pillActive]}
            onPress={() => setLocationExplicit(false)}
          >
            <Text style={[styles.pillText, !locationExplicit && styles.pillTextActive]}>
              Smart
            </Text>
          </TouchableOpacity>
          {LOCATION_OPTIONS.map((location) => (
            <TouchableOpacity
              key={location}
              style={[styles.pill, locationExplicit && selectedLocation === location && styles.pillActive]}
              onPress={() => {
                setSelectedLocation(location);
                setLocationExplicit(true);
              }}
            >
              <Text
                style={[
                  styles.pillText,
                  locationExplicit && selectedLocation === location && styles.pillTextActive,
                ]}
              >
                {location}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

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
        <View style={styles.selectionRow}>
          <TouchableOpacity
            style={[styles.selectionButton, !remindersEnabled && styles.selectionButtonDisabled]}
            disabled={!remindersEnabled}
            onPress={() => setShowDatePicker((current) => !current)}
          >
            <Text style={[styles.selectionValue, !remindersEnabled && styles.selectionValueDisabled]}>
              {dateOverrideEnabled
                ? formatDateValue(selectedDate)
                : existingNote?.remind_on_date
                  ? `Smart: ${existingNote.remind_on_date}`
                  : "Use smart date"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearButton}
            disabled={!remindersEnabled}
            onPress={() => {
              setDateOverrideEnabled(false);
              setSelectedDate(null);
            }}
          >
            <Text style={[styles.clearButtonText, !remindersEnabled && styles.selectionValueDisabled]}>
              Smart
            </Text>
          </TouchableOpacity>
        </View>
        {showDatePicker && remindersEnabled && (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={selectedDate ?? new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={handleDateChange}
            />
          </View>
        )}

        <Text style={styles.helperLabel}>Reminder time override</Text>
        <View style={styles.selectionRow}>
          <TouchableOpacity
            style={[styles.selectionButton, !remindersEnabled && styles.selectionButtonDisabled]}
            disabled={!remindersEnabled}
            onPress={() => setShowTimePicker((current) => !current)}
          >
            <Text style={[styles.selectionValue, !remindersEnabled && styles.selectionValueDisabled]}>
              {timeOverrideEnabled
                ? formatTimeValue(selectedTime)
                : existingNote?.contexts.find((item) => typeof item === "string" && /^\d{2}:\d{2}$/.test(item))
                  ? `Smart: ${existingNote.contexts.find((item) => typeof item === "string" && /^\d{2}:\d{2}$/.test(item))}`
                  : "Use smart time"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearButton}
            disabled={!remindersEnabled}
            onPress={() => {
              setTimeOverrideEnabled(false);
              setSelectedTime(null);
            }}
          >
            <Text style={[styles.clearButtonText, !remindersEnabled && styles.selectionValueDisabled]}>
              Smart
            </Text>
          </TouchableOpacity>
        </View>
        {showTimePicker && remindersEnabled && (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={selectedTime ?? new Date()}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleTimeChange}
            />
          </View>
        )}
        <Text style={styles.helperFootnote}>
          Leave these blank to use the smart time context already inferred from the note.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  contentContainer: {
    paddingBottom: 24,
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
  pillText: {
    fontSize: 13,
    color: "#666",
  },
  pillTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#fff",
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 220,
  },
  categorySection: {
    backgroundColor: "#fff",
    marginTop: 12,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    paddingHorizontal: 16,
  },
  sectionHint: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 13,
    color: "#777",
    lineHeight: 18,
    paddingHorizontal: 16,
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
  selectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectionButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fafafa",
  },
  selectionButtonDisabled: {
    backgroundColor: "#f1f1f1",
  },
  selectionValue: {
    fontSize: 14,
    color: "#333",
  },
  selectionValueDisabled: {
    color: "#999",
  },
  clearButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  clearButtonText: {
    fontSize: 13,
    color: "#2E7D32",
    fontWeight: "600",
  },
  pickerWrap: {
    marginTop: 10,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
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
