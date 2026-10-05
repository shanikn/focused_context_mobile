import { ApiError } from "../api/client";
import { geocodeViaBackend } from "../api/geocode";
import { AddressResult, AddressSearchError, cleanQuery, searchAddress } from "../lib/nominatim";
import { LatLon } from "../lib/geo";
import { recentFix } from "./currentPosition";

// Address search for the app. Goes through our backend (/places/search), which
// talks to Nominatim with the server's identity, rate limit and cache.
// Falls back to calling Nominatim from the phone only when the backend is
// an older version without /places/search (404).

interface Deps {
  viaBackend: (query: string, near?: LatLon) => Promise<AddressResult[]>;
  direct: (query: string) => Promise<AddressResult[]>;
  // where the phone is, if it knows recently; never waits for a new fix
  near?: () => Promise<LatLon | null>;
}

// the last known position, if under 10 minutes old and within 2 km accuracy
async function recentNear(): Promise<LatLon | null> {
  const fix = await recentFix({ maxAgeMs: 10 * 60 * 1000, maxAccuracyM: 2000 });
  return fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
}

const defaultDeps: Deps = { viaBackend: geocodeViaBackend, direct: (q) => searchAddress(q), near: recentNear };

function serverMessage(body: string): string | undefined {
  try {
    const message = JSON.parse(body)?.detail?.message;
    return typeof message === "string" ? message : undefined;
  } catch {
    return undefined;
  }
}

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
  let near: LatLon | null = null;
  try {
    near = deps.near ? await deps.near() : null;
  } catch {
    near = null; // no permission or no fix: search without it
  }
  try {
    return await (near ? deps.viaBackend(cleaned, near) : deps.viaBackend(cleaned));
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 404) {
        return deps.direct(cleaned);
      }
      const kind = upstreamKind(e.body);
      console.warn("Address search via backend failed", e.status, e.body.slice(0, 200));
      if (e.status === 429) {
        // our own per-user limit sends a message to show; Nominatim's doesn't
        throw new AddressSearchError("rate_limited", e.message, 429, serverMessage(e.body));
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
