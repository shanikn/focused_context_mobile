import AsyncStorage from "@react-native-async-storage/async-storage";
import * as placesApi from "../api/places";
import { loadPlaces } from "./placesStore";
import { getAllCoords, setPlaceCoords } from "../lib/userPlaces";

jest.mock("../api/places", () => ({
  listPlaces: jest.fn(),
  createPlace: jest.fn(),
  updatePlace: jest.fn(),
  deletePlace: jest.fn(),
}));

const api = placesApi as jest.Mocked<typeof placesApi>;
const SERVER = [
  { id: "id-home", name: "Home", keywords: [], kind: "home" as const },
  { id: "id-gym", name: "Gym", keywords: [], kind: null },
];

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

test("loads places from the backend and merges this phone's coordinates", async () => {
  api.listPlaces.mockResolvedValue(SERVER);
  await setPlaceCoords("id-gym", { latitude: 1, longitude: 2 });

  const places = await loadPlaces();

  expect(places.map((p) => [p.name, p.coords?.latitude ?? null])).toEqual([
    ["Home", null],
    ["Gym", 1],
  ]);
});

test("offline: falls back to the last places loaded", async () => {
  api.listPlaces.mockResolvedValueOnce(SERVER);
  await loadPlaces();
  api.listPlaces.mockRejectedValueOnce(new Error("network"));

  const places = await loadPlaces();

  expect(places.map((p) => p.name)).toEqual(["Home", "Gym"]);
});

test("offline and never loaded: no places", async () => {
  api.listPlaces.mockRejectedValue(new Error("network"));
  expect(await loadPlaces()).toEqual([]);
});

test("migrates the old per-bucket coordinates once the backend places are known", async () => {
  await AsyncStorage.setItem(
    "focusedcontext.places",
    JSON.stringify([{ id: "x", bucket: "home", label: "Home", latitude: 5, longitude: 6, radius: 150 }])
  );
  api.listPlaces.mockResolvedValue(SERVER);

  const places = await loadPlaces();

  expect(places[0].coords).toEqual({ latitude: 5, longitude: 6, radius: 150 });
  expect(await getAllCoords()).toEqual({ "id-home": { latitude: 5, longitude: 6, radius: 150 } });
});

test("drops coordinates of places deleted on the backend", async () => {
  await setPlaceCoords("id-deleted", { latitude: 1, longitude: 1 });
  api.listPlaces.mockResolvedValue(SERVER);

  await loadPlaces();

  expect(await getAllCoords()).toEqual({});
});
