import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton, TextButton } from "./ui";
import { ADDRESS_INPUT_PROPS } from "./addressInputProps";
import { LatLon } from "../lib/geo";
import { jumpToScript, MAP_BASE_URL, mapHtml, MapView, parseMapMessage } from "../lib/mapPick";
import { AddressResult, searchErrorMessage } from "../lib/nominatim";
import { findAddress } from "../services/addressSearch";
import { parsePastedLocation } from "../lib/pastedLocation";
import { resolvePastedLocation } from "../services/pastedLocation";
import { MIN_TOUCH_TARGET, Theme, fonts, radius, spacing } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// Full-screen map to pick a place's location: search an address (or paste
// coordinates or a Google Maps link) to jump there, drag the map under the
// pin, then "Save here".
export default function MapPickerModal({
  visible,
  placeName,
  initialView,
  onSave,
  onCancel,
}: {
  visible: boolean;
  placeName: string;
  initialView: MapView;
  onSave: (point: LatLon) => void;
  onCancel: () => void;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const webView = useRef<WebView>(null);
  // the map's center as last reported by the page (no re-render needed)
  const center = useRef<LatLon>({ latitude: initialView.latitude, longitude: initialView.longitude });
  const html = useMemo(() => {
    center.current = { latitude: initialView.latitude, longitude: initialView.longitude };
    return mapHtml(initialView);
  }, [initialView]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AddressResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const jumpTo = (result: LatLon) => {
    const point = { latitude: result.latitude, longitude: result.longitude };
    center.current = point; // right away, in case Save comes before the page reports
    webView.current?.injectJavaScript(jumpToScript(point));
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q || searching) {
      return;
    }
    Keyboard.dismiss();
    setSearching(true);
    setMessage(null);
    try {
      // coordinates or a Maps link: straight there, no address search
      if (parsePastedLocation(q).kind !== "none") {
        setResults([]);
        jumpTo(await resolvePastedLocation(q));
        return;
      }
      const found = await findAddress(q);
      setResults(found);
      if (found.length === 0) {
        setMessage("No places found. Try another spelling or a nearby street.");
      } else {
        jumpTo(found[0]);
      }
    } catch (e) {
      setResults([]);
      setMessage(searchErrorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TextButton label="Cancel" onPress={onCancel} />
          <Text style={[type.cardTitle, styles.title]} numberOfLines={1}>
            {placeName}
          </Text>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            {...ADDRESS_INPUT_PROPS}
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Address, coordinates or Maps link"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={runSearch}
            accessibilityLabel="Search the map"
          />
          <TouchableOpacity
            style={styles.searchButton}
            onPress={runSearch}
            disabled={!query.trim() || searching}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            {searching ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Ionicons name="search" size={20} color={colors.onPrimary} />
            )}
          </TouchableOpacity>
        </View>
        {message && <Text style={[type.caption, styles.message]}>{message}</Text>}
        {results.length > 1 && (
          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {results.map((r) => (
              <TouchableOpacity
                key={`${r.latitude},${r.longitude},${r.label}`}
                style={styles.resultRow}
                onPress={() => {
                  jumpTo(r);
                  setResults([]);
                }}
                accessibilityRole="button"
                accessibilityLabel={r.label}
              >
                <Text style={[type.body, styles.resultText]} numberOfLines={2}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <WebView
          ref={webView}
          style={styles.map}
          source={{ html, baseUrl: MAP_BASE_URL }}
          originWhitelist={["*"]}
          javaScriptEnabled
          setSupportMultipleWindows={false}
          onMessage={(event) => {
            const point = parseMapMessage(event.nativeEvent.data);
            if (point) {
              center.current = point;
            }
          }}
        />
        <View style={styles.footer}>
          <Text style={type.caption}>Drag the map to put the pin on {placeName}.</Text>
          <PrimaryButton label="Save here" onPress={() => onSave(center.current)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.screen, paddingVertical: 4 },
    title: { flex: 1 },
    searchRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.screen, paddingBottom: 8 },
    searchInput: {
      flex: 1,
      height: MIN_TOUCH_TARGET,
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.text,
      // Hebrew reads right-to-left inside the LTR layout
      writingDirection: "auto",
    },
    searchButton: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      borderRadius: MIN_TOUCH_TARGET / 2,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    message: { paddingHorizontal: spacing.screen, paddingBottom: 8 },
    results: { maxHeight: 200, marginHorizontal: spacing.screen, marginBottom: 8 },
    resultRow: {
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: "center",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    resultText: { writingDirection: "auto" },
    map: { flex: 1 },
    footer: { padding: spacing.screen, gap: 10, backgroundColor: colors.surface },
  });
