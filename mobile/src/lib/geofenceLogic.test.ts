import { bucketAfterGeofenceEvent, regionsFromPlaces, shouldGeofence } from "./geofenceLogic";
import { Place } from "./places";

describe("bucketAfterGeofenceEvent", () => {
  test("Enter a saved place: switch to that bucket and count it as an arrival", () => {
    expect(bucketAfterGeofenceEvent("enter", "uni", "unknown")).toEqual({
      bucket: "uni",
      arrived: true,
    });
  });

  test("Enter while already in that bucket: still an arrival", () => {
    expect(bucketAfterGeofenceEvent("enter", "home", "home")).toEqual({
      bucket: "home",
      arrived: true,
    });
  });

  test("Enter replaces a different current bucket", () => {
    expect(bucketAfterGeofenceEvent("enter", "work", "home")).toEqual({
      bucket: "work",
      arrived: true,
    });
  });

  test("Exit the current bucket: back to unknown", () => {
    expect(bucketAfterGeofenceEvent("exit", "home", "home")).toEqual({
      bucket: "unknown",
      arrived: false,
    });
  });

  test("Exit a bucket that isn't current: keep the current one", () => {
    // e.g. user already entered "work", or picked a bucket by hand
    expect(bucketAfterGeofenceEvent("exit", "home", "work")).toEqual({
      bucket: "work",
      arrived: false,
    });
  });

  test("Exit while unknown stays unknown", () => {
    expect(bucketAfterGeofenceEvent("exit", "uni", "unknown")).toEqual({
      bucket: "unknown",
      arrived: false,
    });
  });

  test("an identifier that isn't a place bucket changes nothing", () => {
    expect(bucketAfterGeofenceEvent("enter", "unknown", "home")).toEqual({
      bucket: "home",
      arrived: false,
    });
    expect(bucketAfterGeofenceEvent("enter", "gym", "home")).toEqual({
      bucket: "home",
      arrived: false,
    });
    expect(bucketAfterGeofenceEvent("exit", "gym", "home")).toEqual({
      bucket: "home",
      arrived: false,
    });
  });
});

describe("regionsFromPlaces", () => {
  test("one region per place, identified by its bucket, notifying on enter and exit", () => {
    const places: Place[] = [
      { id: "a", bucket: "home", label: "Home", latitude: 32.1, longitude: 34.8, radius: 150 },
      { id: "b", bucket: "uni", label: "Uni", latitude: 32.17, longitude: 34.83, radius: 300 },
    ];
    expect(regionsFromPlaces(places)).toEqual([
      {
        identifier: "home",
        latitude: 32.1,
        longitude: 34.8,
        radius: 150,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
      {
        identifier: "uni",
        latitude: 32.17,
        longitude: 34.83,
        radius: 300,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
  });

  test("no places: no regions", () => {
    expect(regionsFromPlaces([])).toEqual([]);
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

  test("everything on and at least one place: geofence", () => {
    expect(shouldGeofence(on)).toBe(true);
  });

  test.each([
    ["no background location (automatic location off)", { background: false }],
    ["no foreground location", { foreground: false }],
    ["notifications switched off in the app", { notificationsEnabled: false }],
    ["notification permission not granted", { notificationsGranted: false }],
    ["no saved places", { placeCount: 0 }],
  ])("%s: don't geofence", (_label, change) => {
    expect(shouldGeofence({ ...on, ...change })).toBe(false);
  });
});
