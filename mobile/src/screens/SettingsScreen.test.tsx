import React from "react";
import { Alert, AlertButton, Switch, Text, TouchableOpacity } from "react-native";
import TestRenderer, { act, ReactTestInstance, ReactTestRenderer } from "react-test-renderer";
import SettingsScreen from "./SettingsScreen";
import { setReminderLocation } from "../lib/reminderPrefs";
import { syncGeofencing } from "../services/geofence";
import { checkAndNotifyReminders } from "../services/reminderNotifier";
import { getAllCoords, setPlaceCoords } from "../lib/userPlaces";

jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return { useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []) };
});
jest.mock("expo-location", () => ({
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
jest.mock("firebase/auth", () => ({ signOut: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@react-native-google-signin/google-signin", () => ({ GoogleSignin: { signOut: jest.fn() } }));
jest.mock("../config/firebase", () => ({ auth: { currentUser: null } }));
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { email: "shani@example.com" } }) }));
jest.mock("../lib/reminderPrefs", () => ({
  getNotificationsEnabled: jest.fn().mockResolvedValue(true),
  setNotificationsEnabled: jest.fn().mockResolvedValue(undefined),
  getReminderLocation: jest.fn().mockResolvedValue("id-home"),
  setReminderLocation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../services/reminderNotifier", () => ({
  checkAndNotifyReminders: jest.fn().mockResolvedValue({
    notificationsEnabled: true,
    permissionGranted: true,
    notifiedCount: 0,
  }),
  ensureNotificationPermissions: jest.fn().mockResolvedValue(true),
}));
jest.mock("../api/places", () => ({ createPlace: jest.fn(), deletePlace: jest.fn(), updatePlace: jest.fn() }));
jest.mock("../services/placesStore", () => {
  const { getAllCoords, mergePlaces } = jest.requireActual("../lib/userPlaces");
  const server = [
    { id: "id-home", name: "Home", keywords: [], kind: "home" },
    { id: "id-gym", name: "Gym", keywords: [], kind: null },
  ];
  return { loadPlaces: jest.fn(async () => mergePlaces(server, await getAllCoords())) };
});
jest.mock("../services/locationPermissions", () => ({
  getGrantedPermissions: jest.fn().mockResolvedValue({ foreground: true, background: true, notifications: true }),
}));
jest.mock("../services/geofence", () => ({ syncGeofencing: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../services/scheduledReminders", () => ({
  clearReminderSchedule: jest.fn().mockResolvedValue(undefined),
  syncScheduledReminders: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../components/LocationPermissionFlow", () => ({
  useLocationPermissionFlow: () => ({ screen: null, start: jest.fn(), proceed: jest.fn(), skip: jest.fn() }),
  LocationPermissionModal: () => null,
}));
// the color wheel needs native Reanimated; not under test here
jest.mock("../components/CategoryColorModal", () => () => null);
jest.mock("../components/AddressSearchModal", () => {
  const { View } = require("react-native");
  return (props: { visible: boolean; placeName: string }) =>
    props.visible ? <View testID="address-search" accessibilityLabel={props.placeName} /> : null;
});

function allText(node: ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map((t) => [t.props.children].flat().join(""))
    .join(" | ");
}

function byLabel(tree: ReactTestRenderer, label: string): ReactTestInstance {
  const found = tree.root.findAllByType(TouchableOpacity).filter((t) => t.props.accessibilityLabel === label);
  if (found.length === 0) {
    throw new Error(`nothing with accessibilityLabel "${label}"`);
  }
  return found[0];
}

let alertSpy: jest.SpyInstance;
const lastAlertButtons = (): string[] =>
  ((alertSpy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[]).map((b) => b.text ?? "");

async function pressAlertButton(text: string) {
  const button = ((alertSpy.mock.calls.at(-1)?.[2] ?? []) as AlertButton[]).find((b) => b.text === text);
  if (!button?.onPress) {
    throw new Error(`no alert button "${text}"`);
  }
  await act(async () => {
    await button.onPress!();
  });
}

async function renderScreen() {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(<SettingsScreen />);
  });
  return tree;
}

beforeEach(async () => {
  jest.clearAllMocks();
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  await AsyncStorage.clear();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

test("cards in order: Where you are now, Saved places, Category colors, Phone notifications, account", async () => {
  const tree = await renderScreen();
  const text = allText(tree.root);
  const order = ["Settings", "Where you are now", "Saved places", "Category colors", "Phone notifications", "Signed in as"];
  const positions = order.map((t) => text.indexOf(t));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(text).toContain("shani@example.com");
});

test("Where you are now: places plus 'Not at a place'; tapping one sets it", async () => {
  const tree = await renderScreen();
  expect(byLabel(tree, "Home").props.accessibilityState.selected).toBe(true);
  await act(async () => byLabel(tree, "Gym").props.onPress());
  expect(setReminderLocation).toHaveBeenCalledWith("id-gym");
  await act(async () => byLabel(tree, "Not at a place").props.onPress());
  expect(setReminderLocation).toHaveBeenLastCalledWith("unknown");
});

test("a place without a location: 'No location set', no radius chips, 'Set location' offers both ways", async () => {
  const tree = await renderScreen();
  expect(allText(tree.root)).toContain("No location set");
  expect(tree.root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === "Gym radius 400 m")).toBe(
    false
  );
  await act(async () => byLabel(tree, "Set location for Gym").props.onPress());
  expect(lastAlertButtons()).toEqual(["Use current location", "Search address", "Cancel"]);
  await pressAlertButton("Search address");
  expect(tree.root.findByProps({ testID: "address-search" }).props.accessibilityLabel).toBe("Gym");
});

test("a place with a location: subtitle with address and radius, radius chips re-register geofences", async () => {
  await setPlaceCoords("id-home", { latitude: 1, longitude: 2 }, 200, { source: "address", address: "Herzl 1, Herzliya" });
  const tree = await renderScreen();
  expect(allText(tree.root)).toContain("Herzl 1, Herzliya · 200 m");
  expect(byLabel(tree, "Home radius 200 m").props.accessibilityState.selected).toBe(true);
  await act(async () => byLabel(tree, "Home radius 400 m").props.onPress());
  expect((await getAllCoords())["id-home"].radius).toBe(400);
  expect(syncGeofencing).toHaveBeenCalled();
});

test("the ⋯ menu offers the other place actions (removing the location is its own button)", async () => {
  await setPlaceCoords("id-home", { latitude: 1, longitude: 2 });
  const tree = await renderScreen();
  await act(async () => byLabel(tree, "Home options").props.onPress());
  expect(lastAlertButtons()).toEqual(["Use current location", "Search address", "Rename", "Delete", "Cancel"]);
  await act(async () => byLabel(tree, "Gym options").props.onPress());
  expect(lastAlertButtons()).toEqual(["Use current location", "Search address", "Rename", "Delete", "Cancel"]);
});

test("phone notifications switch and Check alerts now still work", async () => {
  const tree = await renderScreen();
  const notifications = tree.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === "Phone notifications")!;
  expect(notifications.props.value).toBe(true);
  await act(async () => byLabel(tree, "Check alerts now").props.onPress());
  expect(checkAndNotifyReminders).toHaveBeenCalledWith({ force: true });
});

test("Sign out asks to confirm", async () => {
  const tree = await renderScreen();
  await act(async () => byLabel(tree, "Sign out").props.onPress());
  expect(lastAlertButtons()).toEqual(["Cancel", "Sign Out"]);
});

test("Appearance: System / Light / Dark, default System, saved on the phone", async () => {
  const { ThemeProvider } = require("../ThemeContext");
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>
    );
  });
  expect(allText(tree.root)).toContain("Appearance");
  expect(byLabel(tree, "Appearance: System").props.accessibilityState.selected).toBe(true);
  await act(async () => byLabel(tree, "Appearance: Dark").props.onPress());
  expect(byLabel(tree, "Appearance: Dark").props.accessibilityState.selected).toBe(true);
  expect(await AsyncStorage.getItem("focusedcontext.appearance")).toBe("dark");
});

describe("Remove place", () => {
  const hasLabel = (tree: ReactTestRenderer, label: string) =>
    tree.root.findAllByType(TouchableOpacity).some((t) => t.props.accessibilityLabel === label);

  beforeEach(async () => {
    await setPlaceCoords("id-home", { latitude: 1, longitude: 2 }, 400, { source: "address", address: "Herzl 1" });
  });

  test("a visible button on each place with a location, none on places without one", async () => {
    const tree = await renderScreen();
    expect(byLabel(tree, "Remove place Home")).toBeTruthy();
    expect(allText(byLabel(tree, "Remove place Home"))).toContain("Remove place");
    expect(hasLabel(tree, "Remove place Gym")).toBe(false);
  });

  test("asks to confirm; Cancel keeps everything", async () => {
    const tree = await renderScreen();
    await act(async () => byLabel(tree, "Remove place Home").props.onPress());
    expect(alertSpy.mock.calls.at(-1)?.[0]).toBe("Remove place");
    expect(alertSpy.mock.calls.at(-1)?.[1]).toMatch(/Home.*address and radius.*arrival alerts.*notes/is);
    expect(lastAlertButtons()).toEqual(["Cancel", "Remove"]);
    await pressAlertButton("Cancel").catch(() => {}); // Cancel has no handler
    expect((await getAllCoords())["id-home"]).toBeDefined();
  });

  test("Remove clears the address and radius and stops arrival alerts; the place and its notes stay", async () => {
    const { deletePlace } = jest.requireMock("../api/places");
    const tree = await renderScreen();
    await act(async () => byLabel(tree, "Remove place Home").props.onPress());
    (syncGeofencing as jest.Mock).mockClear();
    await pressAlertButton("Remove");
    expect((await getAllCoords())["id-home"]).toBeUndefined();
    expect(syncGeofencing).toHaveBeenCalled(); // geofences re-registered without Home
    expect(deletePlace).not.toHaveBeenCalled(); // the place and its note tags stay
    const text = allText(tree.root);
    expect(text).toContain("Home");
    expect(text).toContain("No location set");
    expect(hasLabel(tree, "Home radius 400 m")).toBe(false);
    expect(hasLabel(tree, "Remove place Home")).toBe(false);
  });
});

describe("Remove place and Where you are now", () => {
  const { getReminderLocation } = jest.requireMock("../lib/reminderPrefs");
  let stored: string;

  beforeEach(async () => {
    await setPlaceCoords("id-home", { latitude: 1, longitude: 2 });
    await setPlaceCoords("id-gym", { latitude: 3, longitude: 4 });
    // remember what the screen saves, so a reload reads it back
    (getReminderLocation as jest.Mock).mockImplementation(async () => stored);
    (setReminderLocation as jest.Mock).mockImplementation(async (value: string) => {
      stored = value;
    });
  });

  afterEach(() => {
    (getReminderLocation as jest.Mock).mockResolvedValue("id-home");
    (setReminderLocation as jest.Mock).mockResolvedValue(undefined);
  });

  async function removePlace(tree: ReactTestRenderer, name: string) {
    await act(async () => byLabel(tree, `Remove place ${name}`).props.onPress());
    await pressAlertButton("Remove");
  }

  test("removing the current place sets 'Not at a place'", async () => {
    stored = "id-home";
    const tree = await renderScreen();
    await removePlace(tree, "Home");
    expect(setReminderLocation).toHaveBeenLastCalledWith("unknown");
    expect(byLabel(tree, "Not at a place").props.accessibilityState.selected).toBe(true);
    expect(byLabel(tree, "Home").props.accessibilityState.selected).toBe(false);
  });

  test("removing another place leaves the current place alone", async () => {
    stored = "id-gym";
    const tree = await renderScreen();
    await removePlace(tree, "Home");
    expect(setReminderLocation).not.toHaveBeenCalledWith("unknown");
    expect(stored).toBe("id-gym");
    expect(byLabel(tree, "Gym").props.accessibilityState.selected).toBe(true);
    // Gym keeps its location
    expect((await getAllCoords())["id-gym"]).toBeDefined();
    expect(byLabel(tree, "Remove place Gym")).toBeTruthy();
  });
});
