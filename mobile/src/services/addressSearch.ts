import { ApiError } from "../api/client";
import { geocodeViaBackend } from "../api/geocode";
import { AddressResult, AddressSearchError, cleanQuery, searchAddress } from "../lib/nominatim";

// Address search for the app. Goes through our backend (/geocode/), which
// talks to Nominatim with the server's identity, rate limit and cache.
// Falls back to calling Nominatim from the phone only when the backend is
// an older version without /geocode/ (404).

interface Deps {
  viaBackend: (query: string) => Promise<AddressResult[]>;
  direct: (query: string) => Promise<AddressResult[]>;
}

const defaultDeps: Deps = { viaBackend: geocodeViaBackend, direct: (q) => searchAddress(q) };

function upstreamKind(body: string): string | undefined {
  try {
    return JSON.parse(body)?.detail?.kind;
  } catch {
    return undefined;
  }
}

function upstreamStatus(body: string): number | undefined {
  try {
    return JSON.parse(body)?.detail?.upstream_status ?? undefined;
  } catch {
    return undefined;
  }
}

export async function findAddress(query: string, deps: Deps = defaultDeps): Promise<AddressResult[]> {
  const cleaned = cleanQuery(query);
  if (!cleaned) {
    return [];
  }
  try {
    return await deps.viaBackend(cleaned);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 404) {
        return deps.direct(cleaned);
      }
      const kind = upstreamKind(e.body);
      console.warn("Address search via backend failed", e.status, e.body.slice(0, 200));
      if (e.status === 429) {
        throw new AddressSearchError("rate_limited", e.message, 429);
      }
      if (e.status === 504) {
        throw new AddressSearchError("timeout", e.message, 504);
      }
      if (kind === "blocked") {
        const status = upstreamStatus(e.body) ?? 403;
        throw new AddressSearchError("blocked", e.message, status);
      }
      throw new AddressSearchError("http", e.message, e.status);
    }
    const detail = e instanceof Error ? e.message : String(e);
    console.warn("Address search: backend unreachable", detail);
    throw new AddressSearchError("network", detail, undefined, detail);
  }
}
