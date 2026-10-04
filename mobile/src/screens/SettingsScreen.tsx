import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  ScrollView,
} from "react-native";
import * as Location from "expo-location";
import { useFocusEffect } from "@react-navigation/native";
import { signOut } from "firebase/auth";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { auth } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import {
  getNotificationsEnabled,
  getReminderLocation,
  setNotificationsEnabled,
  setReminderLocation,
} from "../lib/reminderPrefs";
import { checkAndNotifyReminders, ensureNotificationPermissions } from "../services/reminderNotifier";
import {
  removePlaceCoords,
  resolveCurrentLocation,
  placeSubtitle,
  RADIUS_CHOICES,
  setPlaceRadius,
  setPlaceCoords,
  UNKNOWN,
  UserPlace,
} from "../lib/userPlaces";
import { createPlace, deletePlace, updatePlace } from "../api/places";
import { loadPlaces } from "../services/placesStore";
import { AddressResult } from "../lib/nominatim";
import PlaceEditorModal from "../components/PlaceEditorModal";
import AddressSearchModal from "../components/AddressSearchModal";
import CategoryColorModal from "../components/CategoryColorModal";
import {
  Category,
  CATEGORIES,
  CategoryColors,
  DEFAULT_CATEGORY_COLORS,
  getCategoryColors,
  resetCategoryColor,
  setCategoryColor,
  textColorFor,
} from "../lib/categoryColors";
import { GrantedPermissions, locationStatus } from "../lib/locationPermissionFlow";
import { getGrantedPermissions } from "../services/locationPermissions";
import { syncGeofencing } from "../services/geofence";
import { clearReminderSchedule, syncScheduledReminders } from "../services/scheduledReminders";
import {
  LocationPermissionModal,
  useLocationPermissionFlow,
} from "../components/LocationPermissionFlow";

export default function SettingsScreen() {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [location, setLocation] = useState<string>(UNKNOWN);
  const [checkingNow, setCheckingNow] = useState(false);
  const [places, setPlaces] = useState<UserPlace[]>([]);
  const [permissions, setPermissions] = useState<GrantedPermissions | null>(null);
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);
  // place the user tapped "Use current location" for before the permission
  // flow; saved once the flow finishes
  const pendingPlaceId = useRef<string | null>(null);
  // place editor: null = closed, { place: null } = add, { place } = rename
  const [editor, setEditor] = useState<{ place: UserPlace | null } | null>(null);
  const [addressFor, setAddressFor] = useState<UserPlace | null>(null);
  const [categoryColors, setCategoryColors] = useState<CategoryColors>(DEFAULT_CATEGORY_COLORS);
  const [colorFor, setColorFor] = useState<Category | null>(null);

  const refreshPlaces = useCallback(async () => {
    const loaded = await loadPlaces();
    setPlaces(loaded);
    // map an old stored value ("home", "errands", a deleted place) to a place id
    const stored = await getReminderLocation();
    const resolved = resolveCurrentLocation(stored, loaded);
    if (loaded.length > 0 && resolved !== stored) {
      await setReminderLocation(resolved);
    }
    setLocation(loaded.length > 0 ? resolved : stored);
  }, []);

  useFocusEffect(
    useCallback(() => {
      getNotificationsEnabled().then(setNotificationsEnabledState).catch(() => {});
      refreshPlaces().catch(() => {});
      getCategoryColors().then(setCategoryColors).catch(() => {});
      // read-only: never prompts
      getGrantedPermissions().then(setPermissions).catch(() => {});
    }, [refreshPlaces])
  );

  const afterPlacesChanged = useCallback(async () => {
    await refreshPlaces();
    await syncGeofencing();
  }, [refreshPlaces]);

  const saveCurrentLocationFor = useCallback(
    async (placeId: string) => {
      setSavingPlaceId(placeId);
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await setPlaceCoords(placeId, position.coords, undefined, { source: "current" });
        await afterPlacesChanged();
      } catch {
        Alert.alert("Couldn't get your location", "Check that location is on and try again.");
      } finally {
        setSavingPlaceId(null);
      }
    },
    [afterPlacesChanged]
  );

  const handlePermissionFlowDone = useCallback(
    (granted: GrantedPermissions) => {
      setPermissions(granted);
      syncGeofencing();
      const placeId = pendingPlaceId.current;
      pendingPlaceId.current = null;
      if (!placeId) {
        return;
      }
      if (granted.foreground) {
        saveCurrentLocationFor(placeId);
      } else {
        Alert.alert(
          "Location not allowed",
          "Without location access, find the place by address or set your current context with the picker."
        );
      }
    },
    [saveCurrentLocationFor]
  );

  const permissionFlow = useLocationPermissionFlow(handlePermissionFlowDone);

  const handleUseCurrentLocation = async (place: UserPlace) => {
    const granted = await getGrantedPermissions();
    setPermissions(granted);
    if (granted.foreground) {
      await saveCurrentLocationFor(place.id);
      return;
    }
    pendingPlaceId.current = place.id;
    await permissionFlow.start();
  };

  // "Save as <place>" in the address dialog. Errors propagate so the dialog
  // stays open and shows them; on success it closes and confirms.
  const handleAddressSave = async (result: AddressResult) => {
    const place = addressFor;
    if (!place) {
      return;
    }
    await setPlaceCoords(place.id, result, undefined, { source: "address", address: result.label });
    setAddressFor(null);
    Alert.alert("Location saved", `${place.name}: ${result.label}`);
    await afterPlacesChanged();
  };

  const handleEditorSave = async (name: string, keywords: string[]) => {
    const target = editor?.place ?? null;
    setEditor(null);
    try {
      if (target) {
        await updatePlace(target.id, { name, keywords });
      } else {
        await createPlace(name, keywords);
      }
      await afterPlacesChanged();
    } catch (e: any) {
      const taken = String(e?.message ?? "").includes("409");
      Alert.alert(
        "Couldn't save the place",
        taken ? `You already have a place named "${name}".` : "Check your connection and try again."
      );
    }
  };

  // a new radius re-registers the geofences (afterPlacesChanged -> syncGeofencing)
  const handleSetRadius = async (place: UserPlace, radius: number) => {
    if (place.coords?.radius === radius) {
      return;
    }
    try {
      await setPlaceRadius(place.id, radius);
      await afterPlacesChanged();
    } catch {
      Alert.alert("Couldn't change the radius", "Try again.");
    }
  };

  const handleClearCoords = (place: UserPlace) => {
    Alert.alert("Forget location", `Forget where ${place.name} is on this phone?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Forget",
        style: "destructive",
        onPress: async () => {
          await removePlaceCoords(place.id);
          await afterPlacesChanged();
        },
      },
    ]);
  };

  const handleDeletePlace = (place: UserPlace) => {
    Alert.alert(
      "Delete place",
      `Delete ${place.name}? Notes tagged with it lose that tag.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePlace(place.id);
              await removePlaceCoords(place.id);
              if (location === place.id) {
                await setReminderLocation(UNKNOWN);
              }
              await afterPlacesChanged();
            } catch {
              Alert.alert("Couldn't delete the place", "Check your connection and try again.");
            }
          },
        },
      ]
    );
  };

  const status = permissions ? locationStatus(permissions) : null;

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const usedGoogle = auth.currentUser?.providerData.some(
            (p) => p.providerId === "google.com"
          );
          await signOut(auth);
          // the next user mustn't get this user's alarms
          clearReminderSchedule().catch(() => {});
          if (!usedGoogle) {
            return;
          }
          // clear the cached Google account so the picker shows next time.
          // Not awaited: with outdated Play services this promise never
          // settles, and it must never block the Firebase sign-out above.
          try {
            GoogleSignin.signOut().catch(() => {});
          } catch {
            // native module unavailable — nothing to clear
          }
        },
      },
    ]);
  };

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsEnabledState(value);
    await setNotificationsEnabled(value);

    if (value) {
      const granted = await ensureNotificationPermissions();
      if (!granted) {
        Alert.alert(
          "Notifications disabled",
          "Permission was not granted, so reminders cannot appear as phone notifications."
        );
      }
    }
    // turning notifications off stops geofencing and exact alarms; on restarts them
    await syncGeofencing();
    await syncScheduledReminders();
  };

  const handleSaveCategoryColor = async (hex: string) => {
    const category = colorFor;
    setColorFor(null);
    if (!category) {
      return;
    }
    await setCategoryColor(category, hex);
    setCategoryColors(await getCategoryColors());
  };

  const handleResetCategoryColor = async () => {
    const category = colorFor;
    setColorFor(null);
    if (!category) {
      return;
    }
    await resetCategoryColor(category);
    setCategoryColors(await getCategoryColors());
  };

  const handleSelectLocation = async (nextLocation: string) => {
    setLocation(nextLocation);
    await setReminderLocation(nextLocation);
  };

  const handleCheckNow = async () => {
    setCheckingNow(true);
    try {
      const result = await checkAndNotifyReminders({ force: true });
      if (!result.notificationsEnabled) {
        Alert.alert("Notifications off", "Enable phone notifications first.");
      } else if (!result.permissionGranted) {
        Alert.alert("Permission needed", "Allow notifications on this device to receive alerts.");
      } else if (result.notifiedCount === 0) {
        Alert.alert("No alerts sent", "No notes are due at the current time and context.");
      } else {
        Alert.alert("Alerts sent", `Sent ${result.notifiedCount} phone notification(s).`);
      }
    } catch {
      Alert.alert("Error", "Failed to check reminders");
    } finally {
      setCheckingNow(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.sectionTitle}>Phone notifications</Text>
            <Text style={styles.helperText}>
              Poll the backend and show local reminders on this phone.
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: "#d7d7d7", true: "#A5D6A7" }}
            thumbColor={notificationsEnabled ? "#2E7D32" : "#f4f4f4"}
          />
        </View>
        <TouchableOpacity
          style={[styles.checkButton, checkingNow && styles.checkButtonDisabled]}
          onPress={handleCheckNow}
          disabled={checkingNow}
        >
          <Text style={styles.checkButtonText}>
            {checkingNow ? "Checking..." : "Check alerts now"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved places</Text>
        <Text style={styles.helperText}>
          Your places. Names sync to your account; where each place is stays on this phone.
        </Text>
        {status && (
          <Text style={[styles.statusText, status.mode === "manual" && styles.statusManual]}>
            {status.message}
          </Text>
        )}
        {status?.mode === "manual" && (
          <TouchableOpacity style={styles.linkButton} onPress={() => permissionFlow.start()}>
            <Text style={styles.linkButtonText}>Turn on automatic location</Text>
          </TouchableOpacity>
        )}
        {places.map((place) => (
          <View key={place.id} style={styles.placeBlock}>
            <View style={styles.placeRow}>
              <View style={styles.rowText}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.helperText} numberOfLines={2}>
                  {placeSubtitle(place)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditor({ place })}>
                <Text style={styles.linkSmall}>Rename</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeletePlace(place)}>
                <Text style={styles.removeText}>Delete</Text>
              </TouchableOpacity>
            </View>
            {place.coords && (
              <View style={styles.radiusRow} accessibilityLabel={`${place.name} radius`}>
                <Text style={styles.radiusLabel}>Radius</Text>
                {RADIUS_CHOICES.map((r) => {
                  const on = place.coords?.radius === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.radiusChip, on && styles.radiusChipOn]}
                      onPress={() => handleSetRadius(place, r)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[styles.radiusChipText, on && styles.radiusChipTextOn]}>{r} m</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <View style={styles.placeActions}>
              <TouchableOpacity
                style={[styles.placeButton, savingPlaceId !== null && styles.checkButtonDisabled]}
                onPress={() => handleUseCurrentLocation(place)}
                disabled={savingPlaceId !== null}
              >
                <Text style={styles.placeButtonText}>
                  {savingPlaceId === place.id ? "Saving..." : "Use current location"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.placeButtonOutline}
                onPress={() => setAddressFor(place)}
              >
                <Text style={styles.placeButtonOutlineText}>Search address</Text>
              </TouchableOpacity>
              {place.coords && (
                <TouchableOpacity onPress={() => handleClearCoords(place)}>
                  <Text style={styles.linkSmall}>Forget</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.addPlaceButton} onPress={() => setEditor({ place: null })}>
          <Text style={styles.addPlaceText}>+ Add place</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current reminder context</Text>
        <Text style={styles.helperText}>
          Manual fallback and override: pick where you are now.
        </Text>
        <View style={styles.pillWrap}>
          {[{ id: UNKNOWN, name: "Not at a place" }, ...places].map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.pill, location === option.id && styles.pillActive]}
              onPress={() => handleSelectLocation(option.id)}
            >
              <Text style={[styles.pillText, location === option.id && styles.pillTextActive]}>
                {option.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Category colors</Text>
        <Text style={styles.helperText}>
          Tap a category to change its color. Saved on this phone.
        </Text>
        {CATEGORIES.map((category) => {
          const color = categoryColors[category];
          return (
            <TouchableOpacity
              key={category}
              style={styles.colorRow}
              onPress={() => setColorFor(category)}
            >
              <Text style={[styles.colorBadge, { backgroundColor: color, color: textColorFor(color) }]}>
                {category}
              </Text>
              <Text style={styles.colorHex}>
                {color}
                {color === DEFAULT_CATEGORY_COLORS[category] ? "  (default)" : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <CategoryColorModal
        visible={colorFor !== null}
        category={colorFor ?? ""}
        color={colorFor ? categoryColors[colorFor] : "#000000"}
        isDefault={colorFor ? categoryColors[colorFor] === DEFAULT_CATEGORY_COLORS[colorFor] : true}
        onSave={handleSaveCategoryColor}
        onReset={handleResetCategoryColor}
        onCancel={() => setColorFor(null)}
      />
      <PlaceEditorModal
        visible={editor !== null}
        title={editor?.place ? `Rename ${editor.place.name}` : "Add place"}
        initialName={editor?.place?.name ?? ""}
        initialKeywords={editor?.place?.keywords ?? []}
        onSave={handleEditorSave}
        onCancel={() => setEditor(null)}
      />
      <AddressSearchModal
        visible={addressFor !== null}
        placeName={addressFor?.name ?? ""}
        onSave={handleAddressSave}
        onCancel={() => setAddressFor(null)}
      />
      <LocationPermissionModal
        screen={permissionFlow.screen}
        onContinue={permissionFlow.proceed}
        onSkip={permissionFlow.skip}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  rowText: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: "#999",
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: "#333",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  helperText: {
    fontSize: 13,
    color: "#777",
    lineHeight: 18,
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#f1f1f1",
  },
  pillActive: {
    backgroundColor: "#2E7D32",
  },
  pillText: {
    fontSize: 14,
    color: "#666",
    textTransform: "capitalize",
  },
  pillTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  statusText: {
    fontSize: 13,
    color: "#2E7D32",
    lineHeight: 18,
    marginTop: 10,
  },
  statusManual: {
    color: "#B26A00",
  },
  linkButton: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  linkButtonText: {
    color: "#2E7D32",
    fontSize: 14,
    fontWeight: "600",
  },
  placeBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  radiusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  radiusLabel: {
    fontSize: 13,
    color: "#777",
    marginRight: 2,
  },
  radiusChip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "#f1f1f1",
    justifyContent: "center",
  },
  radiusChipOn: {
    backgroundColor: "#2E7D32",
  },
  radiusChipText: {
    fontSize: 13,
    color: "#555",
  },
  radiusChipTextOn: {
    color: "#fff",
    fontWeight: "600",
  },
  placeActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  placeButtonOutline: {
    borderWidth: 1,
    borderColor: "#2E7D32",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  placeButtonOutlineText: {
    color: "#2E7D32",
    fontSize: 13,
    fontWeight: "600",
  },
  linkSmall: {
    color: "#2E7D32",
    fontSize: 13,
  },
  addPlaceButton: {
    marginTop: 16,
    alignSelf: "flex-start",
  },
  addPlaceText: {
    color: "#2E7D32",
    fontSize: 15,
    fontWeight: "600",
  },
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  placeName: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
  },
  placeButton: {
    flexShrink: 1,
    maxWidth: 170,
    backgroundColor: "#2E7D32",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  placeButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  removeText: {
    color: "#e53935",
    fontSize: 13,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginTop: 4,
  },
  colorBadge: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
  colorHex: {
    fontSize: 12,
    color: "#999",
  },
  signOutButton: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e53935",
  },
  signOutText: {
    color: "#e53935",
    fontSize: 16,
    fontWeight: "600",
  },
  checkButton: {
    marginTop: 14,
    backgroundColor: "#2E7D32",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  checkButtonDisabled: {
    opacity: 0.7,
  },
  checkButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
