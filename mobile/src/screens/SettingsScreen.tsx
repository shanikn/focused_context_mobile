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
  LOCATION_BUCKETS,
  LocationBucket,
  setNotificationsEnabled,
  setReminderLocation,
} from "../lib/reminderPrefs";
import { checkAndNotifyReminders, ensureNotificationPermissions } from "../services/reminderNotifier";
import {
  bucketLabel,
  getPlaces,
  Place,
  PLACE_BUCKETS,
  PlaceBucket,
  placeFromPosition,
  placesByBucket,
  removePlace,
  savePlace,
} from "../lib/places";
import { GrantedPermissions, locationStatus } from "../lib/locationPermissionFlow";
import { getGrantedPermissions } from "../services/locationPermissions";
import {
  LocationPermissionModal,
  useLocationPermissionFlow,
} from "../components/LocationPermissionFlow";

export default function SettingsScreen() {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [location, setLocation] = useState<LocationBucket>("unknown");
  const [checkingNow, setCheckingNow] = useState(false);
  const [places, setPlaces] = useState<Record<PlaceBucket, Place | null>>(placesByBucket([]));
  const [permissions, setPermissions] = useState<GrantedPermissions | null>(null);
  const [savingBucket, setSavingBucket] = useState<PlaceBucket | null>(null);
  // bucket the user tapped before the permission flow, saved once it finishes
  const pendingBucket = useRef<PlaceBucket | null>(null);

  const refreshPlaces = useCallback(async () => {
    setPlaces(placesByBucket(await getPlaces()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      getNotificationsEnabled().then(setNotificationsEnabledState).catch(() => {});
      getReminderLocation().then(setLocation).catch(() => {});
      refreshPlaces().catch(() => {});
      // read-only: never prompts
      getGrantedPermissions().then(setPermissions).catch(() => {});
    }, [refreshPlaces])
  );

  const saveCurrentLocationAs = useCallback(
    async (bucket: PlaceBucket) => {
      setSavingBucket(bucket);
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        await savePlace(placeFromPosition(bucket, position.coords));
        await refreshPlaces();
      } catch {
        Alert.alert("Couldn't get your location", "Check that location is on and try again.");
      } finally {
        setSavingBucket(null);
      }
    },
    [refreshPlaces]
  );

  const handlePermissionFlowDone = useCallback(
    (granted: GrantedPermissions) => {
      setPermissions(granted);
      const bucket = pendingBucket.current;
      pendingBucket.current = null;
      if (!bucket) {
        return;
      }
      if (granted.foreground) {
        saveCurrentLocationAs(bucket);
      } else {
        Alert.alert(
          "Location not allowed",
          "Without location access, set your current context with the picker instead."
        );
      }
    },
    [saveCurrentLocationAs]
  );

  const permissionFlow = useLocationPermissionFlow(handlePermissionFlowDone);

  const handleSetPlace = async (bucket: PlaceBucket) => {
    const granted = await getGrantedPermissions();
    setPermissions(granted);
    if (granted.foreground) {
      await saveCurrentLocationAs(bucket);
      return;
    }
    pendingBucket.current = bucket;
    await permissionFlow.start();
  };

  const handleRemovePlace = (place: Place) => {
    Alert.alert("Remove place", `Remove your saved ${place.label} location?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removePlace(place.id);
          await refreshPlaces();
        },
      },
    ]);
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
  };

  const handleSelectLocation = async (nextLocation: LocationBucket) => {
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
          Stand at a place and save it. Places stay on this phone.
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
        {PLACE_BUCKETS.map((bucket) => {
          const place = places[bucket];
          return (
            <View key={bucket} style={styles.placeRow}>
              <View style={styles.rowText}>
                <Text style={styles.placeName}>{bucketLabel(bucket)}</Text>
                <Text style={styles.helperText}>
                  {place ? `Saved, ${place.radius} m radius` : "Not set"}
                </Text>
              </View>
              {place && (
                <TouchableOpacity onPress={() => handleRemovePlace(place)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.placeButton, savingBucket !== null && styles.checkButtonDisabled]}
                onPress={() => handleSetPlace(bucket)}
                disabled={savingBucket !== null}
              >
                <Text style={styles.placeButtonText}>
                  {savingBucket === bucket
                    ? "Saving..."
                    : `Set ${bucketLabel(bucket)} to my current location`}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current reminder context</Text>
        <Text style={styles.helperText}>
          Manual fallback and override: pick where you are now.
        </Text>
        <View style={styles.pillWrap}>
          {LOCATION_BUCKETS.map((option) => (
            <TouchableOpacity
              key={option}
              style={[styles.pill, location === option && styles.pillActive]}
              onPress={() => handleSelectLocation(option)}
            >
              <Text style={[styles.pillText, location === option && styles.pillTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

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
  placeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
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
