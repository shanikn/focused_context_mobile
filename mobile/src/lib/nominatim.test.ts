import {
  buildSearchUrl,
  createRateLimiter,
  NOMINATIM_USER_AGENT,
  parseResults,
  searchAddress,
} from "./nominatim";

describe("buildSearchUrl", () => {
  test("free-text query, JSON, a few results", () => {
    const url = new URL(buildSearchUrl("Herzliya Pituah 4"));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Herzliya Pituah 4");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  test("trims the query", () => {
    expect(new URL(buildSearchUrl("  gym  ")).searchParams.get("q")).toBe("gym");
  });
});

describe("parseResults", () => {
  test("keeps name and numeric coordinates", () => {
    const raw = [
      { display_name: "Reichman University, Herzliya, Israel", lat: "32.1765", lon: "34.8365", place_id: 1 },
      { display_name: "Somewhere", lat: "1.5", lon: "-2.25", place_id: 2 },
    ];
    expect(parseResults(raw)).toEqual([
      { label: "Reichman University, Herzliya, Israel", latitude: 32.1765, longitude: 34.8365 },
      { label: "Somewhere", latitude: 1.5, longitude: -2.25 },
    ]);
  });

  test("skips entries with missing or invalid coordinates", () => {
    const raw = [
      { display_name: "bad", lat: "x", lon: "1" },
      { display_name: "no lon", lat: "1" },
      { display_name: "out of range", lat: "95", lon: "1" },
      { display_name: "ok", lat: "1", lon: "2" },
    ];
    expect(parseResults(raw).map((r) => r.label)).toEqual(["ok"]);
  });

  test("anything that isn't a list gives no results", () => {
    expect(parseResults({ error: "x" })).toEqual([]);
    expect(parseResults(null)).toEqual([]);
  });
});

describe("createRateLimiter (Nominatim policy: at most 1 request per second)", () => {
  test("first call is immediate, a quick second call waits the remainder", async () => {
    let now = 1000;
    const waits: number[] = [];
    const limit = createRateLimiter(1000, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    await limit();
    now += 300;
    await limit();
    expect(waits).toEqual([700]);
  });

  test("no wait once a second has passed", async () => {
    let now = 0;
    const sleep = jest.fn(async () => {});
    const limit = createRateLimiter(1000, () => now, sleep);
    await limit();
    now += 1500;
    await limit();
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("searchAddress", () => {
  test("sends an identifying User-Agent and parses the response", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: "Gym", lat: "1", lon: "2" }],
    });
    const results = await searchAddress("gym", fetchMock as unknown as typeof fetch, async () => {});
    expect(results).toEqual([{ label: "Gym", latitude: 1, longitude: 2 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get("q")).toBe("gym");
    expect(init.headers["User-Agent"]).toBe(NOMINATIM_USER_AGENT);
    expect(NOMINATIM_USER_AGENT).toMatch(/FocusedContext/);
  });

  test("empty query: no request", async () => {
    const fetchMock = jest.fn();
    expect(await searchAddress("   ", fetchMock as unknown as typeof fetch, async () => {})).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("HTTP error throws", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 429, json: async () => [] });
    await expect(
      searchAddress("gym", fetchMock as unknown as typeof fetch, async () => {})
    ).rejects.toThrow("429");
  });
});
