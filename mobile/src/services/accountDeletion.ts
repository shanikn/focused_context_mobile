import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { signOut } from "firebase/auth";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { deleteAccount } from "../api/account";
import { auth } from "../config/firebase";
import { GEOFENCE_TASK } from "./geofence";
import { clearReminderSchedule } from "./scheduledReminders";

async function quietly(step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch {
    // one cleanup step failing mustn't stop the others or the sign-out
  }
}

// Delete the account on the server (notes, places, the Firebase user). Only
// if that worked: stop geofences and alarms, clear everything this app keeps
// on the phone, and sign out. If the server fails, nothing changes here.
export async function deleteAccountAndSignOut(): Promise<void> {
  await deleteAccount();
  const usedGoogle = auth.currentUser?.providerData.some((p) => p.providerId === "google.com") ?? false;
  await quietly(async () => {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  });
  await quietly(clearReminderSchedule);
  await quietly(() => Notifications.cancelAllScheduledNotificationsAsync());
  // place coordinates, preferences, caches, colors, the current place...
  await quietly(() => AsyncStorage.clear());
  await quietly(() => signOut(auth));
  if (usedGoogle) {
    // not awaited: with outdated Play services this never settles
    try {
      GoogleSignin.signOut().catch(() => {});
    } catch {
      // native module unavailable
    }
  }
}
