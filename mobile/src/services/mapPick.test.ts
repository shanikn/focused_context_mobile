import AsyncStorage from "@react-native-async-storage/async-storage";
import { fillPickedAddress, savePickedPoint } from "./mapPick";
import { getAllCoords, placeLocationText, setPlaceCoords } from "../lib/userPlaces";

jest.mock("./addressSearch", () => ({ findAddress: jest.fn() }));

const POINT = { latitude: 32.1663, longitude: 34.8433 };
const NEAR = { label: "5 Sirkin St, Herzliya", latitude: 32.1666, longitude: 34.8439 };

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("Save here", () => {
  test("stores the pinned lat/lon as a map location, with the default radius for a new place", async () => {
    await savePickedPoint("id-gym", POINT);
    expect((await getAllCoords())["id-gym"]).toEqual({ ...POINT, radius: 200, source: "map" });
  });

  test("keeps the radius the place already had, and drops an old address", async () => {
    await setPlaceCoords("id-home", { latitude: 1, longitude: 2 }, 400, { source: "address", address: "Old St" });
    await savePickedPoint("id-home", POINT);
    expect((await getAllCoords())["id-home"]).toEqual({ ...POINT, radius: 400, source: "map" });
  });

  test("shown as 'Pinned on map' until the address is known", async () => {
    await savePickedPoint("id-gym", POINT);
    const coords = (await getAllCoords())["id-gym"];
    expect(placeLocationText({ id: "id-gym", name: "Gym", keywords: [], kind: null, coords })).toBe("Pinned on map");
  });
});

describe("then the address, by reverse geocoding through the backend", () => {
  test("fills the nearest address", async () => {
    const find = jest.fn().mockResolvedValue([NEAR]);
    await savePickedPoint("id-gym", POINT);
    expect(await fillPickedAddress("id-gym", POINT, find)).toBe(NEAR.label);
    expect(find).toHaveBeenCalledWith("32.166300,34.843300");
    const coords = (await getAllCoords())["id-gym"];
    expect(coords).toEqual({ ...POINT, radius: 200, source: "map", address: NEAR.label });
    expect(placeLocationText({ id: "id-gym", name: "Gym", keywords: [], kind: null, coords })).toBe(NEAR.label);
  });

  test("search failing or nothing near: the location stays, without an address", async () => {
    await savePickedPoint("id-gym", POINT);
    expect(await fillPickedAddress("id-gym", POINT, jest.fn().mockRejectedValue(new Error("504")))).toBeNull();
    expect(await fillPickedAddress("id-gym", POINT, jest.fn().mockResolvedValue([]))).toBeNull();
    expect((await getAllCoords())["id-gym"]).toEqual({ ...POINT, radius: 200, source: "map" });
  });

  test("doesn't overwrite a location changed meanwhile", async () => {
    let answer!: (r: unknown) => void;
    const find = jest.fn(() => new Promise((resolve) => (answer = resolve)));
    await savePickedPoint("id-gym", POINT);
    const filling = fillPickedAddress("id-gym", POINT, find as never);
    await setPlaceCoords("id-gym", { latitude: 31, longitude: 35 }, undefined, { source: "current" });
    answer([NEAR]);
    expect(await filling).toBeNull();
    expect((await getAllCoords())["id-gym"]).toMatchObject({ latitude: 31, source: "current" });
    expect((await getAllCoords())["id-gym"].address).toBeUndefined();
  });

  test("the place's location removed meanwhile: nothing written", async () => {
    await savePickedPoint("id-gym", POINT);
    await AsyncStorage.clear();
    expect(await fillPickedAddress("id-gym", POINT, jest.fn().mockResolvedValue([NEAR]))).toBeNull();
    expect((await getAllCoords())["id-gym"]).toBeUndefined();
  });
});

describe("pasted locations", () => {
  test("saved as source 'pasted', shown as 'Set from coordinates' until the address is known", async () => {
    await savePickedPoint("id-gym", POINT, "pasted");
    const coords = (await getAllCoords())["id-gym"];
    expect(coords).toEqual({ ...POINT, radius: 200, source: "pasted" });
    expect(placeLocationText({ id: "id-gym", name: "Gym", keywords: [], kind: null, coords })).toBe("Set from coordinates");
    expect(await fillPickedAddress("id-gym", POINT, jest.fn().mockResolvedValue([NEAR]), "pasted")).toBe(NEAR.label);
    expect((await getAllCoords())["id-gym"]).toEqual({ ...POINT, radius: 200, source: "pasted", address: NEAR.label });
  });
});
