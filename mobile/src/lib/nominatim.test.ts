import {
  buildSearchUrl,
  createRateLimiter,
  NOMINATIM_USER_AGENT,
  parseResults,
  searchAddress,
  AddressSearchError,
  searchErrorMessage,
} from "./nominatim";

describe("buildSearchUrl", () => {
  test("free-text query, JSON, a few results", () => {
    const url = new URL(buildSearchUrl("Herzliya Pituah 4"));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Herzliya Pituah 4");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("limit")).toBe("5");
    // labels in Hebrew where OpenStreetMap has them, else English
    expect(url.searchParams.get("accept-language")).toBe("he,en");
  });

  test("Hebrew goes through unchanged", () => {
    expect(new URL(buildSearchUrl("רוטשילד 10, תל אביב")).searchParams.get("q")).toBe("רוטשילד 10, תל אביב");
  });

  test("removes invisible direction marks a Hebrew keyboard can add (RTL)", () => {
    const q = "‏אוניברסיטת רייכמן‎ ‫Reichman‬⁦";
    expect(new URL(buildSearchUrl(q)).searchParams.get("q")).toBe("אוניברסיטת רייכמן Reichman");
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

describe("errors say what actually went wrong", () => {
  const noWait = async () => {};
  const failWith = async (fetchMock: jest.Mock) => {
    try {
      await searchAddress("Reichman University", fetchMock as unknown as typeof fetch, noWait, 50);
    } catch (e) {
      return e;
    }
    throw new Error("expected searchAddress to throw");
  };

  test("403: Nominatim refused the request (blocked / User-Agent)", async () => {
    const e = await failWith(
      jest.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Access denied. See https://operations.osmfoundation.org/policies/nominatim/" })
    );
    expect(e).toBeInstanceOf(AddressSearchError);
    expect((e as AddressSearchError).kind).toBe("blocked");
    expect(searchErrorMessage(e)).toMatch(/refused/i);
    expect(searchErrorMessage(e)).toMatch(/403/);
    expect(searchErrorMessage(e)).not.toMatch(/connection/i);
  });

  test("429: too many searches", async () => {
    const e = await failWith(jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "" }));
    expect((e as AddressSearchError).kind).toBe("rate_limited");
    expect(searchErrorMessage(e)).toBe("Too many searches, try again in a minute.");
  });

  test("other HTTP status: shows the status", async () => {
    const e = await failWith(jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }));
    expect((e as AddressSearchError).kind).toBe("http");
    expect(searchErrorMessage(e)).toMatch(/503/);
  });

  test("network failure (e.g. TLS or no connection): says so, with the underlying error", async () => {
    const e = await failWith(jest.fn().mockRejectedValue(new TypeError("Network request failed")));
    expect((e as AddressSearchError).kind).toBe("network");
    expect(searchErrorMessage(e)).toMatch(/couldn't reach/i);
    expect(searchErrorMessage(e)).toMatch(/Network request failed/);
  });

  test("no answer in time: times out instead of spinning forever", async () => {
    const hang = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })))
        )
    );
    const e = await failWith(hang);
    expect((e as AddressSearchError).kind).toBe("timeout");
    expect(searchErrorMessage(e)).toMatch(/took too long/i);
  });

  test("a response that isn't JSON: bad response", async () => {
    const e = await failWith(
      jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } })
    );
    expect((e as AddressSearchError).kind).toBe("bad_response");
  });

  test("unknown errors still produce a message", () => {
    expect(searchErrorMessage(new Error("boom"))).toMatch(/boom/);
  });
});
