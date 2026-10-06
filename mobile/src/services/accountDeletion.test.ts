import AsyncStorage from "@react-native-async-storage/async-storage";
import { signOut } from "firebase/auth";
import { deleteAccount } from "../api/account";
import { signOutCleanup } from "./signOutCleanup";
import { deleteAccountAndSignOut } from "./accountDeletion";

jest.mock("../api/account", () => ({ deleteAccount: jest.fn() }));
jest.mock("firebase/auth", () => ({ signOut: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../config/firebase", () => ({ auth: { currentUser: { providerData: [{ providerId: "google.com" }] } } }));
jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: { signOut: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("./signOutCleanup", () => ({ signOutCleanup: jest.fn() }));

const order: string[] = [];

beforeEach(async () => {
  jest.clearAllMocks();
  order.length = 0;
  await AsyncStorage.clear();
  await AsyncStorage.multiSet([
    ["focusedcontext.placeCoords", "{}"],
    ["smartmind.storeAlerts.errands", "[]"],
    ["focusedcontext.alertNotes", '{"userId":"uid-a","notes":[]}'],
  ]);
  (deleteAccount as jest.Mock).mockImplementation(async () => {
    order.push("server");
    return { deleted: { notes: 3, places: 4, vectors: 3 }, firebase_user: "deleted" };
  });
  (signOut as jest.Mock).mockImplementation(async () => {
    order.push("signOut");
  });
  (signOutCleanup as jest.Mock).mockImplementation(async () => {
    order.push("cleanup");
  });
});

test("deletes on the server first, then clears the phone and signs out", async () => {
  await deleteAccountAndSignOut();
  // the same cleanup as Sign out (geofences, alarms, offline notes), then everything else
  expect(order).toEqual(["server", "cleanup", "signOut"]);
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  const { GoogleSignin } = jest.requireMock("@react-native-google-signin/google-signin");
  expect(GoogleSignin.signOut).toHaveBeenCalled();
});

test("if the server fails, nothing on the phone changes and you stay signed in", async () => {
  (deleteAccount as jest.Mock).mockRejectedValue(new Error("API error 502"));
  await expect(deleteAccountAndSignOut()).rejects.toThrow("API error 502");
  expect(signOut).not.toHaveBeenCalled();
  expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual([
    "focusedcontext.alertNotes",
    "focusedcontext.placeCoords",
    "smartmind.storeAlerts.errands",
  ]);
  expect(signOutCleanup).not.toHaveBeenCalled();
});

test("a cleanup step failing doesn't stop the rest or the sign-out", async () => {
  (signOutCleanup as jest.Mock).mockRejectedValue(new Error("boom"));
  await deleteAccountAndSignOut();
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  expect(signOut).toHaveBeenCalled();
});
