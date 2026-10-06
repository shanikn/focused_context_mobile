import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { clearOfflineData } from "./alertNotesCache";
import { GEOFENCE_REGIONS_KEY, GEOFENCE_REGISTERED_AT_KEY, GEOFENCE_TASK } from "./geofenceKeys";
import { clearReminderSchedule } from "./scheduledReminders";
import { signOutCleanup } from "./signOutCleanup";

jest.mock("expo-location", () => ({
  hasStartedGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
}));
jest.mock("expo-notifications", () => ({ cancelAllScheduledNotificationsAsync: jest.fn() }));
jest.mock("./scheduledReminders", () => ({ clearReminderSchedule: jest.fn() }));
jest.mock("./alertNotesCache", () => ({ clearOfflineData: jest.fn() }));

const started = Location.hasStartedGeofencingAsync as jest.Mock;
const stop = Location.stopGeofencingAsync as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  started.mockResolvedValue(true);
  stop.mockResolvedValue(undefined);
  (clearReminderSchedule as jest.Mock).mockResolvedValue(undefined);
  (clearOfflineData as jest.Mock).mockResolvedValue(undefined);
  (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(undefined);
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    [GEOFENCE_REGIONS_KEY, "[]"],
    [GEOFENCE_REGISTERED_AT_KEY, "1"],
    ["focusedcontext.appearance", "dark"],
  ]);
});

test("the geofence keys keep their storage names", () => {
  expect(GEOFENCE_TASK).toBe("focusedcontext-geofence");
  expect(GEOFENCE_REGIONS_KEY).toBe("focusedcontext.geofence.regions");
  expect(GEOFENCE_REGISTERED_AT_KEY).toBe("focusedcontext.geofence.registeredAt");
});

test("stops geofencing, forgets the registered regions, clears alarms and offline notes", async () => {
  await signOutCleanup();
  expect(stop).toHaveBeenCalledWith(GEOFENCE_TASK);
  expect(await AsyncStorage.getItem(GEOFENCE_REGIONS_KEY)).toBeNull();
  expect(await AsyncStorage.getItem(GEOFENCE_REGISTERED_AT_KEY)).toBeNull();
  expect(clearReminderSchedule).toHaveBeenCalled();
  expect(clearOfflineData).toHaveBeenCalled();
  // preferences stay
  expect(await AsyncStorage.getItem("focusedcontext.appearance")).toBe("dark");
});

test("geofencing that isn't running isn't stopped", async () => {
  started.mockResolvedValue(false);
  await signOutCleanup();
  expect(stop).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(GEOFENCE_REGIONS_KEY)).toBeNull();
});

test("a step failing doesn't stop the others or throw", async () => {
  started.mockRejectedValue(new Error("no task manager"));
  (clearReminderSchedule as jest.Mock).mockRejectedValue(new Error("boom"));
  await expect(signOutCleanup()).resolves.toBeUndefined();
  expect(await AsyncStorage.getItem(GEOFENCE_REGIONS_KEY)).toBeNull();
  expect(clearOfflineData).toHaveBeenCalled();
});

test("cancels every scheduled notification, e.g. a store alert still waiting out its 2 minutes", async () => {
  await signOutCleanup();
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
});

test("cancelling failing doesn't stop the rest", async () => {
  (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockRejectedValue(new Error("boom"));
  await expect(signOutCleanup()).resolves.toBeUndefined();
  expect(clearOfflineData).toHaveBeenCalled();
});
