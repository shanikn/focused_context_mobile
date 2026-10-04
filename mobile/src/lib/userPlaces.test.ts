import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_RADIUS_METERS,
  getAllCoords,
  mergePlaces,
  migrateLegacyPlaces,
  placeLocationText,
  placeName,
  removePlaceCoords,
  resolveCurrentLocation,
  ServerPlace,
  setPlaceCoords,
  UNKNOWN,
} from "./userPlaces";

const HOME: ServerPlace = { id: "id-home", name: "Home", keywords: [], kind: "home" };
const UNI: ServerPlace = { id: "id-uni", name: "Uni", keywords: [], kind: "uni" };
const WORK: ServerPlace = { id: "id-work", name: "Work", keywords: [], kind: "work" };
const GYM: ServerPlace = { id: "id-gym", name: "Gym", keywords: ["workout"], kind: null };
const SERVER = [HOME, UNI, WORK, GYM];

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("coordinates on the phone, by place id", () => {
  test("none saved at first", async () => {
    expect(await getAllCoords()).toEqual({});
  });

  test("setPlaceCoords stores coordinates with the default 150 m radius", async () => {
    await setPlaceCoords("id-gym", { latitude: 32.1, longitude: 34.8 });
    expect(DEFAULT_RADIUS_METERS).toBe(150);
    expect(await getAllCoords()).toEqual({
      "id-gym": { latitude: 32.1, longitude: 34.8, radius: 150 },
    });
  });

  test("several places can have coordinates; setting again replaces", async () => {
    await setPlaceCoords("id-gym", { latitude: 1, longitude: 1 });
    await setPlaceCoords("id-home", { latitude: 2, longitude: 2 }, 300);
    await setPlaceCoords("id-gym", { latitude: 3, longitude: 3 });
    expect(await getAllCoords()).toEqual({
      "id-gym": { latitude: 3, longitude: 3, radius: 150 },
      "id-home": { latitude: 2, longitude: 2, radius: 300 },
    });
  });

  test("removePlaceCoords forgets one place", async () => {
    await setPlaceCoords("id-gym", { latitude: 1, longitude: 1 });
    await setPlaceCoords("id-home", { latitude: 2, longitude: 2 });
    await removePlaceCoords("id-gym");
    expect(Object.keys(await getAllCoords())).toEqual(["id-home"]);
  });

  test("corrupt stored data reads as none", async () => {
    await AsyncStorage.setItem("focusedcontext.placeCoords", "not json");
    expect(await getAllCoords()).toEqual({});
  });
});

describe("mergePlaces", () => {
  test("backend places in their order, with this phone's coordinates or null", () => {
    const merged = mergePlaces(SERVER, {
      "id-gym": { latitude: 1, longitude: 2, radius: 150 },
      "id-deleted-elsewhere": { latitude: 0, longitude: 0, radius: 150 },
    });
    expect(merged.map((p) => [p.name, p.coords])).toEqual([
      ["Home", null],
      ["Uni", null],
      ["Work", null],
      ["Gym", { latitude: 1, longitude: 2, radius: 150 }],
    ]);
  });
});

describe("migrateLegacyPlaces (old one-place-per-bucket data)", () => {
  const legacy = [
    { id: "x1", bucket: "home", label: "Home", latitude: 10, longitude: 11, radius: 150 },
    { id: "x2", bucket: "uni", label: "Uni", latitude: 20, longitude: 21, radius: 300 },
    { id: "x3", bucket: "errands", label: "Errands", latitude: 30, longitude: 31, radius: 150 },
  ];

  test("home/uni/work move to the backend place ids; errands is dropped", async () => {
    await AsyncStorage.setItem("focusedcontext.places", JSON.stringify(legacy));

    const moved = await migrateLegacyPlaces(SERVER);

    expect(moved).toBe(2);
    expect(await getAllCoords()).toEqual({
      "id-home": { latitude: 10, longitude: 11, radius: 150 },
      "id-uni": { latitude: 20, longitude: 21, radius: 300 },
    });
    expect(await AsyncStorage.getItem("focusedcontext.places")).toBeNull();
  });

  test("doesn't overwrite coordinates already saved for the new id", async () => {
    await setPlaceCoords("id-home", { latitude: 99, longitude: 99 });
    await AsyncStorage.setItem("focusedcontext.places", JSON.stringify(legacy));
    await migrateLegacyPlaces(SERVER);
    expect((await getAllCoords())["id-home"].latitude).toBe(99);
  });

  test("nothing to migrate: no-op", async () => {
    expect(await migrateLegacyPlaces(SERVER)).toBe(0);
    expect(await getAllCoords()).toEqual({});
  });

  test("waits if the backend places aren't known yet", async () => {
    await AsyncStorage.setItem("focusedcontext.places", JSON.stringify(legacy));
    expect(await migrateLegacyPlaces([])).toBe(0);
    expect(await AsyncStorage.getItem("focusedcontext.places")).not.toBeNull();
  });
});

describe("resolveCurrentLocation (the stored 'where am I' value)", () => {
  test("a known place id stays", () => {
    expect(resolveCurrentLocation("id-gym", SERVER)).toBe("id-gym");
  });

  test("old bucket names map to the place of that kind", () => {
    expect(resolveCurrentLocation("home", SERVER)).toBe("id-home");
    expect(resolveCurrentLocation("uni", SERVER)).toBe("id-uni");
    expect(resolveCurrentLocation("work", SERVER)).toBe("id-work");
  });

  test("errands, deleted places and junk become unknown", () => {
    expect(resolveCurrentLocation("errands", SERVER)).toBe(UNKNOWN);
    expect(resolveCurrentLocation("id-deleted", SERVER)).toBe(UNKNOWN);
    expect(resolveCurrentLocation(null, SERVER)).toBe(UNKNOWN);
    expect(resolveCurrentLocation(UNKNOWN, SERVER)).toBe(UNKNOWN);
  });
});

test("placeName looks a place up by id", () => {
  expect(placeName("id-gym", SERVER)).toBe("Gym");
  expect(placeName("nope", SERVER)).toBeNull();
});

describe("where a place's location came from", () => {
  test("set by address search: the address is stored with the coordinates", async () => {
    await setPlaceCoords("id-uni", { latitude: 32.176, longitude: 34.837 }, undefined, {
      source: "address",
      address: "Reichman University, Herzliya, Israel",
    });
    expect((await getAllCoords())["id-uni"]).toEqual({
      latitude: 32.176,
      longitude: 34.837,
      radius: 150,
      source: "address",
      address: "Reichman University, Herzliya, Israel",
    });
  });

  test("set from current location: no address, marked as current location", async () => {
    await setPlaceCoords("id-home", { latitude: 1, longitude: 2 }, undefined, { source: "current" });
    const c = (await getAllCoords())["id-home"];
    expect(c.source).toBe("current");
    expect(c.address).toBeUndefined();
  });

  test("setting again replaces the old address", async () => {
    await setPlaceCoords("id-uni", { latitude: 1, longitude: 1 }, undefined, { source: "address", address: "Old" });
    await setPlaceCoords("id-uni", { latitude: 2, longitude: 2 }, undefined, { source: "current" });
    expect((await getAllCoords())["id-uni"].address).toBeUndefined();
  });

  test("mergePlaces keeps the address and source", async () => {
    await setPlaceCoords("id-uni", { latitude: 1, longitude: 1 }, undefined, { source: "address", address: "Reichman" });
    const uni = mergePlaces(SERVER, await getAllCoords()).find((p) => p.id === "id-uni")!;
    expect(uni.coords?.address).toBe("Reichman");
  });
});

describe("placeLocationText (the grey line under a place's name in Settings)", () => {
  const place = (coords: unknown) => ({ ...UNI, coords }) as never;

  test("address search: the address", () => {
    expect(
      placeLocationText(place({ latitude: 1, longitude: 1, radius: 150, source: "address", address: "Reichman University, Herzliya, Israel" }))
    ).toBe("Reichman University, Herzliya, Israel");
  });

  test("current location", () => {
    expect(placeLocationText(place({ latitude: 1, longitude: 1, radius: 150, source: "current" }))).toBe(
      "Set from current location"
    );
  });

  test("no location", () => {
    expect(placeLocationText(place(null))).toBe("No location set");
  });

  test("saved before this was tracked (no source): just says it's saved", () => {
    expect(placeLocationText(place({ latitude: 1, longitude: 1, radius: 150 }))).toBe("Location saved");
  });

  test("address search but the address is empty: falls back to 'Location saved'", () => {
    expect(placeLocationText(place({ latitude: 1, longitude: 1, radius: 150, source: "address", address: "  " }))).toBe(
      "Location saved"
    );
  });
});
