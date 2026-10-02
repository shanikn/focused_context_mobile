import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_RADIUS_METERS,
  getPlaces,
  PLACE_BUCKETS,
  placeFromPosition,
  placesByBucket,
  removePlace,
  savePlace,
} from "./places";

const HOME = { bucket: "home" as const, label: "Home", latitude: 32.16, longitude: 34.84 };
const UNI = { bucket: "uni" as const, label: "Reichman", latitude: 32.176, longitude: 34.836 };

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("no saved places at first", async () => {
  expect(await getPlaces()).toEqual([]);
});

test("savePlace stores a place with an id and the default 150 m radius", async () => {
  const saved = await savePlace(HOME);

  expect(DEFAULT_RADIUS_METERS).toBe(150);
  expect(saved).toEqual({ ...HOME, id: expect.any(String), radius: 150 });
  expect(await getPlaces()).toEqual([saved]);
});

test("savePlace keeps a custom radius", async () => {
  const saved = await savePlace({ ...UNI, radius: 300 });
  expect(saved.radius).toBe(300);
});

test("one place per bucket: saving a bucket again replaces its old place", async () => {
  await savePlace(HOME);
  const uni = await savePlace(UNI);
  const newHome = await savePlace({ ...HOME, label: "New flat", latitude: 32.1 });

  const places = await getPlaces();
  expect(places).toHaveLength(2);
  expect(places).toEqual(expect.arrayContaining([uni, newHome]));
  expect(places.filter((p) => p.bucket === "home")).toEqual([newHome]);
});

test("places persist in AsyncStorage", async () => {
  const saved = await savePlace(HOME);
  const raw = await AsyncStorage.getItem("focusedcontext.places");
  expect(JSON.parse(raw as string)).toEqual([saved]);
});

test("removePlace deletes only the place with that id", async () => {
  const home = await savePlace(HOME);
  const uni = await savePlace(UNI);

  await removePlace(home.id);

  expect(await getPlaces()).toEqual([uni]);
});

test("removePlace with an unknown id changes nothing", async () => {
  const home = await savePlace(HOME);
  await removePlace("does-not-exist");
  expect(await getPlaces()).toEqual([home]);
});

test("the 'unknown' bucket can't be saved as a place", async () => {
  await expect(
    savePlace({ ...HOME, bucket: "unknown" as never })
  ).rejects.toThrow();
  expect(await getPlaces()).toEqual([]);
});

test("corrupt stored data is treated as no places", async () => {
  await AsyncStorage.setItem("focusedcontext.places", "not json");
  expect(await getPlaces()).toEqual([]);
});

test("PLACE_BUCKETS are the four real places, without 'unknown'", () => {
  expect(PLACE_BUCKETS).toEqual(["home", "uni", "work", "errands"]);
});

test("placesByBucket gives every bucket, with null where nothing is saved", async () => {
  const uni = await savePlace(UNI);
  expect(placesByBucket(await getPlaces())).toEqual({
    home: null,
    uni,
    work: null,
    errands: null,
  });
});

test("placeFromPosition turns a GPS fix into a place for that bucket", () => {
  expect(
    placeFromPosition("work", { latitude: 32.08, longitude: 34.78 })
  ).toEqual({ bucket: "work", label: "Work", latitude: 32.08, longitude: 34.78 });
});
