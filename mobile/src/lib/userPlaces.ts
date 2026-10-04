import AsyncStorage from "@react-native-async-storage/async-storage";

// The user's places: names (and keywords) come from the backend, while each
// place's coordinates stay on this phone, stored by place id. Geofence
// regions and the current location use the same place ids.

export const DEFAULT_RADIUS_METERS = 150;

// the current location when not at any saved place
export const UNKNOWN = "unknown";

const COORDS_KEY = "focusedcontext.placeCoords";
// before custom places: one place per fixed bucket, stored as an array
const LEGACY_PLACES_KEY = "focusedcontext.places";

export type PlaceKind = "home" | "uni" | "work";

export interface ServerPlace {
  id: string;
  name: string;
  keywords: string[];
  kind: PlaceKind | null;
}

export interface PlaceCoords {
  latitude: number;
  longitude: number;
  radius: number; // meters
}

export interface UserPlace extends ServerPlace {
  coords: PlaceCoords | null; // null: not set on this phone
}

export async function getAllCoords(): Promise<Record<string, PlaceCoords>> {
  const raw = await AsyncStorage.getItem(COORDS_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCoords(coords: Record<string, PlaceCoords>): Promise<void> {
  await AsyncStorage.setItem(COORDS_KEY, JSON.stringify(coords));
}

export async function setPlaceCoords(
  placeId: string,
  position: { latitude: number; longitude: number },
  radius: number = DEFAULT_RADIUS_METERS
): Promise<void> {
  const coords = await getAllCoords();
  coords[placeId] = { latitude: position.latitude, longitude: position.longitude, radius };
  await writeCoords(coords);
}

export async function removePlaceCoords(placeId: string): Promise<void> {
  const coords = await getAllCoords();
  if (placeId in coords) {
    delete coords[placeId];
    await writeCoords(coords);
  }
}

// keep only coordinates of places that still exist on the backend
export async function pruneCoords(places: ServerPlace[]): Promise<void> {
  const coords = await getAllCoords();
  const ids = new Set(places.map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(coords).filter(([id]) => ids.has(id)));
  if (Object.keys(kept).length !== Object.keys(coords).length) {
    await writeCoords(kept);
  }
}

export function mergePlaces(
  places: ServerPlace[],
  coords: Record<string, PlaceCoords>
): UserPlace[] {
  return places.map((p) => ({ ...p, coords: coords[p.id] ?? null }));
}

// Old data: [{ bucket: "home" | "uni" | "work" | "errands", latitude, ... }].
// home/uni/work move to the backend place of that kind; errands is dropped.
// Returns how many places were moved. Needs the backend places, so it waits
// (and keeps the old data) until they are known.
export async function migrateLegacyPlaces(places: ServerPlace[]): Promise<number> {
  const raw = await AsyncStorage.getItem(LEGACY_PLACES_KEY);
  if (!raw || places.length === 0) {
    return 0;
  }
  let legacy: unknown[] = [];
  try {
    const parsed = JSON.parse(raw);
    legacy = Array.isArray(parsed) ? parsed : [];
  } catch {
    legacy = [];
  }
  const coords = await getAllCoords();
  let moved = 0;
  for (const item of legacy as Record<string, unknown>[]) {
    const target = places.find((p) => p.kind !== null && p.kind === item.bucket);
    if (!target || coords[target.id] || typeof item.latitude !== "number" || typeof item.longitude !== "number") {
      continue;
    }
    coords[target.id] = {
      latitude: item.latitude,
      longitude: item.longitude,
      radius: typeof item.radius === "number" ? item.radius : DEFAULT_RADIUS_METERS,
    };
    moved += 1;
  }
  await writeCoords(coords);
  await AsyncStorage.removeItem(LEGACY_PLACES_KEY);
  return moved;
}

// The stored current location is a place id or "unknown". Values from before
// custom places ("home", "uni", "work", "errands") are mapped by kind.
export function resolveCurrentLocation(stored: string | null, places: ServerPlace[]): string {
  if (!stored || stored === UNKNOWN) {
    return UNKNOWN;
  }
  if (places.some((p) => p.id === stored)) {
    return stored;
  }
  return places.find((p) => p.kind !== null && p.kind === stored)?.id ?? UNKNOWN;
}

export function placeName(id: string, places: ServerPlace[]): string | null {
  return places.find((p) => p.id === id)?.name ?? null;
}
