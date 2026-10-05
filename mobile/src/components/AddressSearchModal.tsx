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
import { ADDRESS_INPUT_PROPS } from "./addressInputProps";
import { PrimaryButton, TextButton } from "./ui";
import { MIN_TOUCH_TARGET, Theme, fonts, radius } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

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
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
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
              {...ADDRESS_INPUT_PROPS}
              style={[styles.input, styles.rtlAware]}
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
                <ActivityIndicator color={colors.onPrimary} />
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
                        color={on ? colors.primary : colors.textMuted}
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

          <PrimaryButton
            label={`Save as ${placeName}`}
            onPress={save}
            disabled={!selected}
            loading={saving}
            style={styles.saveButton}
          />

          <Text style={styles.attribution}>
            Address search: © OpenStreetMap contributors, via Nominatim. Your search text goes through our server to OpenStreetMap.
          </Text>
          <View style={styles.cancelRow}>
            <TextButton label="Cancel" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = ({ colors, type }: Theme) =>
  StyleSheet.create({
  // Hebrew reads right-to-left inside the LTR layout
  rtlAware: { writingDirection: "auto" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, maxHeight: "90%" },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text, marginBottom: 12 },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  searchButton: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.chip,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
  searchText: { color: colors.onPrimary, fontFamily: fonts.bodyBold, fontSize: 15 },
  error: { ...type.caption, color: colors.danger, marginBottom: 8 },
  empty: { ...type.caption, marginBottom: 8 },
  hint: { ...type.caption, marginBottom: 6 },
  // flexGrow 0 + maxHeight: the list takes the space it needs, up to 220,
  // and never collapses to zero height inside the dialog
  results: { flexGrow: 0, maxHeight: 220, marginBottom: 8 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: MIN_TOUCH_TARGET + 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  resultSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  resultText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text },
  resultTextSelected: { fontFamily: fonts.bodySemi, color: colors.primaryDark },
  selectedBox: {
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  selectedLabel: { ...type.caption, marginBottom: 2 },
  selectedText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  saveButton: { marginBottom: 8 },
  attribution: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  cancelRow: { alignItems: "center" },
});
