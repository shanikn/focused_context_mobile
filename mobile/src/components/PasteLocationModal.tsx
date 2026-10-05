import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton, TextButton } from "./ui";
import { ADDRESS_INPUT_PROPS } from "./addressInputProps";
import { LatLon } from "../lib/geo";
import { resolvePastedLocation } from "../services/pastedLocation";
import { MIN_TOUCH_TARGET, Theme, fonts, radius } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";

// Set a place's location from pasted coordinates ("32.0812, 34.8105") or a
// Google Maps link. Problems show here and the dialog stays open.
export default function PasteLocationModal({
  visible,
  placeName,
  onSave,
  onCancel,
}: {
  visible: boolean;
  placeName: string;
  onSave: (point: LatLon) => void;
  onCancel: () => void;
}) {
  const { colors, type } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setText("");
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const use = async () => {
    const value = text.trim();
    if (!value || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onSave(await resolvePastedLocation(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[type.cardTitle, styles.title]}>Location for {placeName}</Text>
          <Text style={type.caption}>Paste coordinates or a Google Maps link (Share → Copy link).</Text>
          <TextInput
            {...ADDRESS_INPUT_PROPS}
            style={styles.input}
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(null);
            }}
            placeholder="32.0812, 34.8105 or https://maps.app.goo.gl/…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            onSubmitEditing={use}
            autoFocus
            accessibilityLabel="Coordinates or Google Maps link"
          />
          {error && <Text style={[type.caption, styles.error]}>{error}</Text>}
          <View style={styles.actions}>
            <TextButton label="Cancel" onPress={onCancel} />
            <PrimaryButton label="Use this location" onPress={use} disabled={!text.trim()} loading={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
    card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 10 },
    title: { marginBottom: 2 },
    input: {
      minHeight: MIN_TOUCH_TARGET,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
      fontFamily: fonts.body,
      fontSize: 15,
      color: colors.text,
      writingDirection: "auto",
    },
    error: { color: colors.danger },
    actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  });
