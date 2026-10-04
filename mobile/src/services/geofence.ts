import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { auth } from "../config/firebase";
import { setAuthToken } from "../api/client";
import { locationAfterGeofenceEvent, regionsFromPlaces, shouldGeofence } from "../lib/geofenceLogic";
import { getAllCoords } from "../lib/userPlaces";
import { loadPlaces } from "./placesStore";
import {
  getNotificationsEnabled,
  getReminderLocation,
  setReminderLocation,
} from "../lib/reminderPrefs";
import { getGrantedPermissions } from "./locationPermissions";
import { checkAndNotifyReminders } from "./reminderNotifier";

export const GEOFENCE_TASK = "focusedcontext-geofence";

// When Android wakes the app in the background for a geofence event, no
// screen has mounted, so AuthContext hasn't set the API token yet.
async function ensureAuthToken(): Promise<boolean> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    return false;
  }
  setAuthToken(await user.getIdToken());
  return true;
}

// Defined at module top level (imported from index.ts) so the task exists
// even when the app is started in the background just to handle an event.
TaskManager.defineTask<{
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.log("Geofence task error", error.message);
    return;
  }
  try {
    const event = data.eventType === Location.GeofencingEventType.Enter ? "enter" : "exit";
    const current = await getReminderLocation();
    // regions are only registered for places with coordinates on this phone
    const knownPlaceIds = new Set(Object.keys(await getAllCoords()));
    const { location, arrived } = locationAfterGeofenceEvent(
      event,
      data.region.identifier ?? "",
      current,
      knownPlaceIds
    );
    if (location !== current) {
      await setReminderLocation(location);
    }
    if (arrived && (await ensureAuthToken())) {
      // per-slot de-dupe in checkAndNotifyReminders stops re-entry spam
      await checkAndNotifyReminders({ onArrival: true });
    }
  } catch (e) {
    console.log("Geofence task failed", e);
  }
});

// Start geofencing for the saved places when automatic location and
// notifications are on; otherwise stop it. Call whenever places, location
// permissions or the notifications switch change. Never prompts.
export async function syncGeofencing(): Promise<void> {
  try {
    const [permissions, notificationsEnabled, places] = await Promise.all([
      getGrantedPermissions(),
      getNotificationsEnabled(),
      loadPlaces(),
    ]);
    const regions = regionsFromPlaces(places);
    const active = shouldGeofence({
      foreground: permissions.foreground,
      background: permissions.background,
      notificationsEnabled,
      notificationsGranted: permissions.notifications,
      placeCount: regions.length,
    });
    if (active) {
      // replaces any regions registered before
      await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
    } else if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch (e) {
    console.log("Geofence sync failed", e);
  }
}
