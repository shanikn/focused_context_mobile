import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AddressResult, searchErrorMessage } from "../lib/nominatim";
import { findAddress } from "../services/addressSearch";

// Find a place's coordinates by address: search, tap a result to select it,
// then "Save as <place>". Searches only when the user taps Search
// (Nominatim policy: no search-as-you-type).
export default function AddressSearchModal({
  visible,
  placeName,
  onSave,
  onCancel,
}: {
  visible: boolean;
  placeName: string;
  // saves the location; the parent closes the dialog. Throw to keep it open.
  onSave: (result: AddressResult) => Promise<void>;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[] | null>(null);
  const [selected, setSelected] = useState<AddressResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setResults(null);
      setSelected(null);
      setError(null);
    }
  }, [visible]);

  const runSearch = async () => {
    if (!query.trim() || searching) {
      return;
    }
    // close the keyboard so the results aren't hidden behind it
    Keyboard.dismiss();
    setSearching(true);
    setError(null);
    setSelected(null);
    try {
      setResults(await findAddress(query));
    } catch (e) {
      setError(searchErrorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    if (!selected || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
    } catch {
      setError(`Couldn't save the location for ${placeName}. Try again.`);
    } finally {
      setSaving(false);
    }
  };

  const isSelected = (r: AddressResult) =>
    selected !== null &&
    selected.label === r.label &&
    selected.latitude === r.latitude &&
    selected.longitude === r.longitude;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Find {placeName} by address</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Street, city"
              returnKeyType="search"
              onSubmitEditing={runSearch}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.searchButton, (!query.trim() || searching) && styles.disabled]}
              onPress={runSearch}
              disabled={!query.trim() || searching}
            >
              {searching ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.searchText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
          {results && results.length === 0 && <Text style={styles.empty}>No matches.</Text>}
          {results && results.length > 0 && (
            <>
              <Text style={styles.hint}>Tap a result to select it:</Text>
              {/* "handled": with the keyboard still open, the first tap on a
                  result must select it, not just close the keyboard */}
              <ScrollView
                style={styles.results}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {results.map((r) => {
                  const on = isSelected(r);
                  return (
                    <TouchableOpacity
                      key={`${r.latitude},${r.longitude},${r.label}`}
                      style={[styles.result, on && styles.resultSelected]}
                      onPress={() => setSelected(r)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Ionicons
                        name={on ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={on ? "#2E7D32" : "#999"}
                      />
                      <Text style={[styles.resultText, on && styles.resultTextSelected]} numberOfLines={2}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {selected && (
            <View style={styles.selectedBox} testID="selected-address">
              <Text style={styles.selectedLabel}>Selected address</Text>
              <Text style={styles.selectedText}>{selected.label}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, (!selected || saving) && styles.disabled]}
            onPress={save}
            disabled={!selected || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>{`Save as ${placeName}`}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.attribution}>
            Address search: © OpenStreetMap contributors, via Nominatim. Your search text goes through our server to OpenStreetMap.
          </Text>
          <TouchableOpacity style={styles.secondary} onPress={onCancel}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 20, maxHeight: "90%" },
  title: { fontSize: 18, fontWeight: "600", color: "#333", marginBottom: 12 },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  searchButton: {
    backgroundColor: "#2E7D32",
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  searchText: { color: "#fff", fontWeight: "600" },
  error: { color: "#e53935", fontSize: 13, marginBottom: 8 },
  empty: { color: "#777", fontSize: 13, marginBottom: 8 },
  hint: { color: "#777", fontSize: 13, marginBottom: 6 },
  // flexGrow 0 + maxHeight: the list takes the space it needs, up to 220,
  // and never collapses to zero height inside the dialog
  results: { flexGrow: 0, maxHeight: 220, marginBottom: 8 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 8,
  },
  resultSelected: { borderColor: "#2E7D32", backgroundColor: "#E8F5E9" },
  resultText: { flex: 1, fontSize: 14, color: "#333" },
  resultTextSelected: { fontWeight: "600", color: "#1B5E20" },
  selectedBox: {
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  selectedLabel: { fontSize: 12, color: "#777", marginBottom: 2 },
  selectedText: { fontSize: 14, color: "#333" },
  saveButton: {
    backgroundColor: "#2E7D32",
    borderRadius: 10,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  saveText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  attribution: { fontSize: 11, color: "#999", marginTop: 4 },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: "#666", fontSize: 14 },
});
