import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { clearOfflineData } from "./alertNotesCache";
import { GEOFENCE_REGIONS_KEY, GEOFENCE_REGISTERED_AT_KEY, GEOFENCE_TASK } from "./geofenceKeys";
import { clearReminderSchedule } from "./scheduledReminders";

async function quietly(step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch {
    // one step failing mustn't stop the others
  }
}

// Everything a sign-out leaves behind for the next person on this phone:
// geofences watching this user's places and stores, their alarms and any
// other scheduled notification (e.g. a store alert waiting out its 2
// minutes), and the note text kept for offline alerts. Used by Settings'
// Sign out, by an expired sign-in (apiAuth), and by account deletion.
// Never throws.
// Preferences (appearance, colors...) and place coordinates stay.
export async function signOutCleanup(): Promise<void> {
  await quietly(async () => {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  });
  // so the next sync registers geofences afresh
  await quietly(() => AsyncStorage.multiRemove([GEOFENCE_REGIONS_KEY, GEOFENCE_REGISTERED_AT_KEY]));
  await quietly(clearReminderSchedule);
  await quietly(() => Notifications.cancelAllScheduledNotificationsAsync());
  await quietly(clearOfflineData);
}
