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

export function buildSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query.trim(),
    format: "jsonv2",
    limit: String(MAX_RESULTS),
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

export async function searchAddress(
  query: string,
  fetchFn: typeof fetch = fetch,
  limiter: () => Promise<void> = defaultLimiter
): Promise<AddressResult[]> {
  if (!query.trim()) {
    return [];
  }
  await limiter();
  const response = await fetchFn(buildSearchUrl(query), {
    headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Address search failed (${response.status})`);
  }
  return parseResults(await response.json());
}
