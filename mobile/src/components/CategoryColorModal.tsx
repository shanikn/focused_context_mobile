import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Theme } from "../theme";
import { useTheme, useThemedStyles } from "../ThemeContext";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ColorPicker, { BrightnessSlider, Panel3 } from "reanimated-color-picker";
import { BASIC_SWATCHES, normalizeHex, textColorFor } from "../lib/categoryColors";

// Pick a color for one category: basic swatches, or any color from the wheel.
export default function CategoryColorModal({
  visible,
  category,
  color,
  isDefault,
  onSave,
  onReset,
  onCancel,
}: {
  visible: boolean;
  category: string;
  color: string;
  isDefault: boolean;
  onSave: (hex: string) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState(color);

  useEffect(() => {
    if (visible) {
      setDraft(color);
    }
  }, [visible, color]);

  // the picker can report "#RRGGBBAA"; categories use opaque "#RRGGBB"
  const pickFromWheel = (hex: string) => {
    const normalized = normalizeHex(hex.slice(0, 7));
    if (normalized) {
      setDraft(normalized);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* gestures inside a Modal need their own root view on Android */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>Color for {category}</Text>

            <View style={[styles.preview, { backgroundColor: draft }]}>
              <Text style={[styles.previewText, { color: textColorFor(draft) }]}>{category}</Text>
            </View>

            <Text style={styles.label}>Basic colors</Text>
            <View style={styles.swatches}>
              {BASIC_SWATCHES.map((swatch) => (
                <TouchableOpacity
                  key={swatch}
                  accessibilityLabel={`Color ${swatch}`}
                  style={[
                    styles.swatch,
                    { backgroundColor: swatch },
                    draft === swatch && styles.swatchSelected,
                  ]}
                  onPress={() => setDraft(swatch)}
                />
              ))}
            </View>

            <Text style={styles.label}>Custom color</Text>
            <ColorPicker style={styles.picker} value={draft} onCompleteJS={(c) => pickFromWheel(c.hex)}>
              <Panel3 style={styles.wheel} />
              <BrightnessSlider style={styles.slider} />
            </ColorPicker>

            <TouchableOpacity style={styles.primary} onPress={() => onSave(draft)}>
              <Text style={styles.primaryText}>Save</Text>
            </TouchableOpacity>
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondary} onPress={onReset} disabled={isDefault}>
                <Text style={[styles.secondaryText, isDefault && styles.disabledText]}>
                  Reset to default
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondary} onPress={onCancel}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = ({ colors }: Theme) =>
  StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 18 },
  title: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: 12, textTransform: "capitalize" },
  preview: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  previewText: { fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border },
  swatchSelected: { borderWidth: 3, borderColor: colors.text },
  picker: { gap: 12, marginBottom: 16 },
  wheel: { width: 190, height: 190, alignSelf: "center" },
  slider: { borderRadius: 10 },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  secondary: { paddingVertical: 12, paddingHorizontal: 4 },
  secondaryText: { color: colors.textMuted, fontSize: 14 },
  disabledText: { color: colors.border },
});
