import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { signOut } from "firebase/auth";
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

export default function SettingsScreen() {
  const { user } = useAuth();
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [location, setLocation] = useState<LocationBucket>("unknown");
  const [checkingNow, setCheckingNow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getNotificationsEnabled().then(setNotificationsEnabledState).catch(() => {});
      getReminderLocation().then(setLocation).catch(() => {});
    }, [])
  );

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => signOut(auth),
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
    <View style={styles.container}>
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
        <Text style={styles.sectionTitle}>Current reminder context</Text>
        <Text style={styles.helperText}>
          Choose which bucket the reminder engine should use until GPS support is added.
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
