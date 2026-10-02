import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { GrantedPermissions, PermissionStep } from "../lib/locationPermissionFlow";

// Reads the current permission state without prompting.
export async function getGrantedPermissions(): Promise<GrantedPermissions> {
  const [foreground, background, notifications] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);
  return {
    foreground: foreground.granted,
    background: background.granted,
    notifications: notifications.granted,
  };
}

// Shows the system prompt for a request step; screens do nothing here.
export async function requestPermissionFor(step: PermissionStep): Promise<void> {
  switch (step) {
    case "foreground":
      await Location.requestForegroundPermissionsAsync();
      break;
    case "background":
      // Android 11+: opens the app's location settings ("Allow all the time")
      await Location.requestBackgroundPermissionsAsync();
      break;
    case "notifications":
      await Notifications.requestPermissionsAsync();
      break;
    default:
      break;
  }
}
