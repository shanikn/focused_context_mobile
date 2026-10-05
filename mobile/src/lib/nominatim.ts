// Address search with OpenStreetMap Nominatim, following its usage policy
// (https://operations.osmfoundation.org/policies/nominatim/):
// at most 1 request per second, an identifying User-Agent, and searching
// only when the user submits (no search-as-you-type).

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
export const NOMINATIM_USER_AGENT = "FocusedContext/1.0 (university project; com.shanini.mobile)";
const MAX_RESULTS = 5;

export interface AddressResult {
  label: string;
  latitude: number;
  longitude: number;
}

// invisible bidi control characters (LRM/RLM, embeddings, isolates) that a
// Hebrew keyboard or copied RTL text can add; they make Nominatim miss
const BIDI_CONTROLS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function cleanQuery(query: string): string {
  return query.replace(BIDI_CONTROLS, "").replace(/\s+/g, " ").trim();
}

export function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: cleanQuery(query),
    format: "jsonv2",
    limit: String(MAX_RESULTS),
    // labels in Hebrew where OpenStreetMap has them, else English
    "accept-language": "he,en",
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

export function parseResults(raw: unknown): AddressResult[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const results: AddressResult[] = [];
  for (const item of raw as Record<string, unknown>[]) {
    const latitude = Number(item?.lat);
    const longitude = Number(item?.lon);
    if (
      typeof item?.display_name !== "string" ||
      item.lat === undefined ||
      item.lon === undefined ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      continue;
    }
    results.push({ label: item.display_name, latitude, longitude });
  }
  return results;
}

// Returns a function that resolves once at least `intervalMs` has passed
// since the previous call resolved.
export function createRateLimiter(
  intervalMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): () => Promise<void> {
  let last = -Infinity;
  return async () => {
    const wait = last + intervalMs - now();
    if (wait > 0) {
      await sleep(wait);
    }
    last = now();
  };
}

const defaultLimiter = createRateLimiter(1000);

const DEFAULT_TIMEOUT_MS = 15000;

export type AddressSearchErrorKind =
  | "blocked" // 403: Nominatim refused the request
  | "rate_limited" // 429
  | "http" // any other non-2xx status
  | "network" // no response at all: offline, DNS, TLS/certificate
  | "timeout"
  | "bad_response"; // a 2xx that isn't the expected JSON

export class AddressSearchError extends Error {
  kind: AddressSearchErrorKind;
  status?: number;
  detail?: string;

  constructor(kind: AddressSearchErrorKind, message: string, status?: number, detail?: string) {
    super(message);
    this.name = "AddressSearchError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

// What to show the user: the actual reason, not a generic "check your connection".
export function searchErrorMessage(error: unknown): string {
  if (error instanceof AddressSearchError) {
    switch (error.kind) {
      case "blocked":
        return `The address service refused the request (HTTP ${error.status}).`;
      case "rate_limited":
        // our server's message ("...try again in a minute" / "...tomorrow"), else the general one
        return error.detail || "Too many searches, try again in a minute.";
      case "http":
        return `The address service had a problem (HTTP ${error.status}). Try again later.`;
      case "network":
        return `Couldn't reach the address service (${error.detail}). Check your connection.`;
      case "timeout":
        return "The address service took too long to answer. Try again.";
      case "bad_response":
        return "The address service sent an unexpected answer. Try again later.";
    }
  }
  return `Address search failed: ${error instanceof Error ? error.message : String(error)}`;
}

export async function searchAddress(
  query: string,
  fetchFn: typeof fetch = fetch,
  limiter: () => Promise<void> = defaultLimiter,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AddressResult[]> {
  if (!cleanQuery(query)) {
    return [];
  }
  await limiter();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchFn(buildSearchUrl(query), {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (controller.signal.aborted || (e as Error)?.name === "AbortError") {
      throw new AddressSearchError("timeout", "Address search timed out");
    }
    const detail = e instanceof Error ? e.message : String(e);
    console.warn("Address search: network error", detail);
    throw new AddressSearchError("network", `Address search failed: ${detail}`, undefined, detail);
  }
  clearTimeout(timer);

  if (!response.ok) {
    let body = "";
    try {
      body = typeof response.text === "function" ? (await response.text()).slice(0, 200) : "";
    } catch {
      body = "";
    }
    console.warn("Address search: HTTP", response.status, body);
    const kind = response.status === 403 ? "blocked" : response.status === 429 ? "rate_limited" : "http";
    // detail is shown for a 429 (the server's own message), so never the raw body there
    const detail = kind === "rate_limited" ? undefined : body;
    throw new AddressSearchError(kind, `Address search failed (${response.status})`, response.status, detail);
  }
  try {
    return parseResults(await response.json());
  } catch (e) {
    console.warn("Address search: bad response", e);
    throw new AddressSearchError("bad_response", "Address search failed: unexpected response", response.status);
  }
}
