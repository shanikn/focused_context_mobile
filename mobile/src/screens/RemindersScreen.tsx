import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Note } from "../types/notes";
import { fetchCurrentReminders, checkAndNotifyReminders } from "../services/reminderNotifier";

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<Note[]>([]);
  const [location, setLocation] = useState("unknown");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadReminders = useCallback(async () => {
    try {
      const result = await fetchCurrentReminders();
      setReminders(result.reminders);
      setLocation(result.location);
    } catch {
      Alert.alert("Error", "Failed to load reminders");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadReminders();
    }, [loadReminders])
  );

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const result = await checkAndNotifyReminders({ force: true });
      setReminders(result.reminders);
      setLocation(result.location);

      if (!result.notificationsEnabled) {
        Alert.alert("Notifications off", "Enable phone notifications in Settings first.");
      } else if (!result.permissionGranted) {
        Alert.alert("Permission needed", "Allow notifications on this device to receive alerts.");
      } else if (result.notifiedCount === 0) {
        Alert.alert("No reminders sent", "There are no reminder notifications to send right now.");
      } else {
        Alert.alert("Reminder sent", `Sent ${result.notifiedCount} phone notification(s).`);
      }
    } catch {
      Alert.alert("Error", "Failed to check reminders");
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Reminders</Text>
          <Text style={styles.subtitle}>Current context: {location}</Text>
        </View>
        <TouchableOpacity
          style={[styles.button, checking && styles.buttonDisabled]}
          onPress={handleCheckNow}
          disabled={checking}
        >
          <Text style={styles.buttonText}>{checking ? "Checking..." : "Check Now"}</Text>
        </TouchableOpacity>
      </View>

      {reminders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No reminders right now</Text>
          <Text style={styles.emptyHint}>
            Try changing the reminder context in Settings or add a note due around this time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reminders}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          onRefresh={loadReminders}
          refreshing={loading}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardContent}>{item.content}</Text>
              <Text style={styles.cardMeta}>
                {item.category} · {item.list_name}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  subtitle: {
    fontSize: 14,
    color: "#777",
    marginTop: 4,
  },
  button: {
    backgroundColor: "#2E7D32",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 18,
    color: "#999",
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 14,
    color: "#bbb",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardContent: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },
  cardMeta: {
    marginTop: 8,
    fontSize: 12,
    color: "#888",
    textTransform: "capitalize",
  },
});
