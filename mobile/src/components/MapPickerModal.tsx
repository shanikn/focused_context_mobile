import React, { useMemo, useRef } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { PrimaryButton, TextButton } from "./ui";
import { LatLon } from "../lib/geo";
import { MAP_BASE_URL, mapHtml, MapView, parseMapMessage } from "../lib/mapPick";
import { Theme, spacing } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// Full-screen map to pick a place's location: drag the map under the pin,
// then "Save here".
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
  const { type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // the map's center as last reported by the page (no re-render needed)
  const center = useRef<LatLon>({ latitude: initialView.latitude, longitude: initialView.longitude });
  const html = useMemo(() => {
    center.current = { latitude: initialView.latitude, longitude: initialView.longitude };
    return mapHtml(initialView);
  }, [initialView]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TextButton label="Cancel" onPress={onCancel} />
          <Text style={[type.cardTitle, styles.title]} numberOfLines={1}>
            {placeName}
          </Text>
        </View>
        <WebView
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
    map: { flex: 1 },
    footer: { padding: spacing.screen, gap: 10, backgroundColor: colors.surface },
  });
