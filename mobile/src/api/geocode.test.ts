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
