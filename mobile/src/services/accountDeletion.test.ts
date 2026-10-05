import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { signOut } from "firebase/auth";
import { deleteAccount } from "../api/account";
import { clearReminderSchedule } from "./scheduledReminders";
import { deleteAccountAndSignOut } from "./accountDeletion";

jest.mock("../api/account", () => ({ deleteAccount: jest.fn() }));
jest.mock("firebase/auth", () => ({ signOut: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../config/firebase", () => ({ auth: { currentUser: { providerData: [{ providerId: "google.com" }] } } }));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { signOut: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("./scheduledReminders", () => ({ clearReminderSchedule: jest.fn().mockResolvedValue(undefined) }));
jest.mock("expo-notifications", () => ({ cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("expo-location", () => ({
  hasStartedGeofencingAsync: jest.fn().mockResolvedValue(true),
  stopGeofencingAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./geofence", () => ({ GEOFENCE_TASK: "geofence-task" }));

const order: string[] = [];

beforeEach(async () => {
  jest.clearAllMocks();
  order.length = 0;
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    ["focusedcontext.placeCoords", "{}"],
    ["smartmind.storeAlerts.errands", "[]"],
  ]);
  (deleteAccount as jest.Mock).mockImplementation(async () => {
    order.push("server");
    return { deleted: { notes: 3, places: 4, vectors: 3 }, firebase_user: "deleted" };
  });
  (signOut as jest.Mock).mockImplementation(async () => {
    order.push("signOut");
  });
});

test("deletes on the server first, then clears the phone and signs out", async () => {
  await deleteAccountAndSignOut();
  expect(order).toEqual(["server", "signOut"]);
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  expect(Location.stopGeofencingAsync).toHaveBeenCalledWith("geofence-task");
  expect(clearReminderSchedule).toHaveBeenCalled();
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  const { GoogleSignin } = jest.requireMock("@react-native-google-signin/google-signin");
  expect(GoogleSignin.signOut).toHaveBeenCalled();
});

test("if the server fails, nothing on the phone changes and you stay signed in", async () => {
  (deleteAccount as jest.Mock).mockRejectedValue(new Error("API error 502"));
  await expect(deleteAccountAndSignOut()).rejects.toThrow("API error 502");
  expect(signOut).not.toHaveBeenCalled();
  expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual([
    "focusedcontext.placeCoords",
    "smartmind.storeAlerts.errands",
  ]);
  expect(Location.stopGeofencingAsync).not.toHaveBeenCalled();
});

test("a cleanup step failing doesn't stop the rest or the sign-out", async () => {
  (Location.stopGeofencingAsync as jest.Mock).mockRejectedValue(new Error("no task"));
  (clearReminderSchedule as jest.Mock).mockRejectedValue(new Error("boom"));
  await deleteAccountAndSignOut();
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  expect(signOut).toHaveBeenCalled();
});
