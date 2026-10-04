import {
  locationAfterGeofenceEvent,
  regionsChanged,
  regionsFromPlaces,
  shouldGeofence,
  shouldNotifyArrival,
} from "./geofenceLogic";
import { UNKNOWN, UserPlace } from "./userPlaces";

const KNOWN = new Set(["id-home", "id-gym", "id-uni"]);

describe("locationAfterGeofenceEvent (region id = place id)", () => {
  test("Enter a saved place: it becomes the current location, an arrival", () => {
    expect(locationAfterGeofenceEvent("enter", "id-gym", UNKNOWN, KNOWN)).toEqual({
      location: "id-gym",
      arrived: true,
    });
  });

  test("Enter while already there: still an arrival", () => {
    expect(locationAfterGeofenceEvent("enter", "id-home", "id-home", KNOWN)).toEqual({
      location: "id-home",
      arrived: true,
    });
  });

  test("Enter replaces a different current place", () => {
    expect(locationAfterGeofenceEvent("enter", "id-uni", "id-home", KNOWN)).toEqual({
      location: "id-uni",
      arrived: true,
    });
  });

  test("Exit the current place: back to unknown", () => {
    expect(locationAfterGeofenceEvent("exit", "id-home", "id-home", KNOWN)).toEqual({
      location: UNKNOWN,
      arrived: false,
    });
  });

  test("Exit a place that isn't current: keep the current one", () => {
    expect(locationAfterGeofenceEvent("exit", "id-home", "id-gym", KNOWN)).toEqual({
      location: "id-gym",
      arrived: false,
    });
  });

  test("a region for a place that no longer exists changes nothing", () => {
    expect(locationAfterGeofenceEvent("enter", "id-deleted", "id-home", KNOWN)).toEqual({
      location: "id-home",
      arrived: false,
    });
    expect(locationAfterGeofenceEvent("enter", UNKNOWN, "id-home", KNOWN)).toEqual({
      location: "id-home",
      arrived: false,
    });
  });
});

describe("regionsFromPlaces", () => {
  const place = (id: string, coords: UserPlace["coords"]): UserPlace => ({
    id,
    name: id,
    keywords: [],
    kind: null,
    coords,
  });

  test("one region per place with coordinates on this phone, identified by place id", () => {
    expect(
      regionsFromPlaces([
        place("id-home", { latitude: 32.1, longitude: 34.8, radius: 150 }),
        place("id-work", null),
        place("id-gym", { latitude: 32.2, longitude: 34.9, radius: 300 }),
      ])
    ).toEqual([
      { identifier: "id-home", latitude: 32.1, longitude: 34.8, radius: 150, notifyOnEnter: true, notifyOnExit: true },
      { identifier: "id-gym", latitude: 32.2, longitude: 34.9, radius: 300, notifyOnEnter: true, notifyOnExit: true },
    ]);
  });

  test("no places with coordinates: no regions", () => {
    expect(regionsFromPlaces([place("id-work", null)])).toEqual([]);
  });
});

describe("shouldGeofence", () => {
  const on = {
    foreground: true,
    background: true,
    notificationsEnabled: true,
    notificationsGranted: true,
    placeCount: 2,
  };

  test("everything on and at least one place with coordinates: geofence", () => {
    expect(shouldGeofence(on)).toBe(true);
  });

  test.each([
    ["no background location", { background: false }],
    ["no foreground location", { foreground: false }],
    ["notifications switched off in the app", { notificationsEnabled: false }],
    ["notification permission not granted", { notificationsGranted: false }],
    ["no places with coordinates", { placeCount: 0 }],
  ])("%s: don't geofence", (_label, change) => {
    expect(shouldGeofence({ ...on, ...change })).toBe(false);
  });
});

describe("initial ENTER after (re-)registering geofences", () => {
  // Android (expo-location sets INITIAL_TRIGGER_ENTER) reports ENTER right away
  // for every region you're already inside when geofences are registered.
  const REGISTERED = 1_000_000;

  test("ENTER within a minute of registering is not an arrival to notify about", () => {
    expect(shouldNotifyArrival("enter", REGISTERED + 5_000, REGISTERED)).toBe(false);
    expect(shouldNotifyArrival("enter", REGISTERED + 59_000, REGISTERED)).toBe(false);
  });

  test("ENTER later is a real arrival", () => {
    expect(shouldNotifyArrival("enter", REGISTERED + 61_000, REGISTERED)).toBe(true);
  });

  test("EXIT never notifies", () => {
    expect(shouldNotifyArrival("exit", REGISTERED + 120_000, REGISTERED)).toBe(false);
  });

  test("no registration time recorded: treat as a real arrival", () => {
    expect(shouldNotifyArrival("enter", REGISTERED, null)).toBe(true);
  });
});

describe("regionsChanged (skip re-registering when nothing changed)", () => {
  const home = { identifier: "id-home", latitude: 1, longitude: 2, radius: 200, notifyOnEnter: true, notifyOnExit: true };
  const uni = { identifier: "id-uni", latitude: 3, longitude: 4, radius: 400, notifyOnEnter: true, notifyOnExit: true };

  test("same regions, any order: unchanged", () => {
    expect(regionsChanged([home, uni], [uni, home])).toBe(false);
  });

  test("a moved place, a new radius, or an added/removed place: changed", () => {
    expect(regionsChanged([home], [{ ...home, latitude: 1.001 }])).toBe(true);
    expect(regionsChanged([home], [{ ...home, radius: 400 }])).toBe(true);
    expect(regionsChanged([home], [home, uni])).toBe(true);
    expect(regionsChanged([home, uni], [uni])).toBe(true);
  });

  test("nothing registered before: changed", () => {
    expect(regionsChanged(null, [home])).toBe(true);
  });
});
