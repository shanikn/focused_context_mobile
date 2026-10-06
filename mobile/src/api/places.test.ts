import { apiRequest } from "./client";
import { nearbyStores } from "./places";

jest.mock("./client", () => ({ apiRequest: jest.fn().mockResolvedValue([]) }));

const sentParams = () =>
  new URL((apiRequest as jest.Mock).mock.calls.at(-1)[0] as string, "https://example.test").searchParams;

beforeEach(() => (apiRequest as jest.Mock).mockClear());

test("store lookup sends the position rounded to 3 decimals (about 100 m)", async () => {
  await nearbyStores("pharmacy", 32.166345, 34.843321, 2000);
  const params = sentParams();
  expect(params.get("lat")).toBe("32.166");
  expect(params.get("lon")).toBe("34.843");
  expect(params.get("type")).toBe("pharmacy");
  expect(params.get("radius_m")).toBe("2000");
});

test("rounding works below zero and keeps no more digits than needed", async () => {
  await nearbyStores("supermarket", -33.86884, 151.20929);
  const params = sentParams();
  expect(params.get("lat")).toBe("-33.869");
  expect(params.get("lon")).toBe("151.209");
});
