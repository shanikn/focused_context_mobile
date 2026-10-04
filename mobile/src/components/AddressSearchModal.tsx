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
} from "react-native";
import { AddressResult, searchAddress, searchErrorMessage } from "../lib/nominatim";

// Find a place's coordinates by address. Searches only when the user taps
// Search (Nominatim policy: no search-as-you-type).
export default function AddressSearchModal({
  visible,
  placeName,
  onPick,
  onCancel,
}: {
  visible: boolean;
  placeName: string;
  onPick: (result: AddressResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setResults(null);
      setError(null);
    }
  }, [visible]);

  const runSearch = async () => {
    if (!query.trim() || searching) {
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setResults(await searchAddress(query));
    } catch (e) {
      setError(searchErrorMessage(e));
    } finally {
      setSearching(false);
    }
  };

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
            <ScrollView style={styles.results}>
              {results.map((r) => (
                <TouchableOpacity
                  key={`${r.latitude},${r.longitude},${r.label}`}
                  style={styles.result}
                  onPress={() => onPick(r)}
                >
                  <Text style={styles.resultText}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={styles.attribution}>
            Address search: © OpenStreetMap contributors, via Nominatim. Your search text is sent there.
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
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 20, maxHeight: "85%" },
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
  results: { maxHeight: 260, marginBottom: 8 },
  result: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  resultText: { fontSize: 14, color: "#333" },
  attribution: { fontSize: 11, color: "#999", marginTop: 4 },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: "#666", fontSize: 14 },
});
