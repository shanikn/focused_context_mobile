import { apiRequest } from "./client";
import { geocodeViaBackend } from "./geocode";

jest.mock("./client", () => ({ apiRequest: jest.fn() }));

test("address search calls the backend's GET /places/search with the query", async () => {
  (apiRequest as jest.Mock).mockResolvedValue([]);
  await geocodeViaBackend("Reichman University");
  const path = (apiRequest as jest.Mock).mock.calls[0][0] as string;
  const url = new URL(path, "https://example.test");
  expect(url.pathname).toBe("/places/search");
  expect(url.searchParams.get("q")).toBe("Reichman University");
});

test("with a location, sends it rounded to about 1 km so Google prefers nearby results", async () => {
  (apiRequest as jest.Mock).mockResolvedValue([]);
  await geocodeViaBackend("Rothschild 10", { latitude: 32.166345, longitude: 34.843321 });
  const url = new URL((apiRequest as jest.Mock).mock.calls.at(-1)[0] as string, "https://example.test");
  expect(url.searchParams.get("lat")).toBe("32.17");
  expect(url.searchParams.get("lon")).toBe("34.84");
});

test("without a location, no lat/lon", async () => {
  (apiRequest as jest.Mock).mockResolvedValue([]);
  await geocodeViaBackend("Rothschild 10");
  const url = new URL((apiRequest as jest.Mock).mock.calls.at(-1)[0] as string, "https://example.test");
  expect(url.searchParams.has("lat")).toBe(false);
  expect(url.searchParams.has("lon")).toBe(false);
});
