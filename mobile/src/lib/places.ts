import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationBucket } from "./reminderPrefs";

// saved places live on the device only, at most one per location bucket

export const DEFAULT_RADIUS_METERS = 150;

const STORAGE_KEY = "focusedcontext.places";

// "unknown" means "not at a saved place", so it can't be a place itself
export type PlaceBucket = Exclude<LocationBucket, "unknown">;

export interface Place {
  id: string;
  bucket: PlaceBucket;
  label: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
}

export type NewPlace = Omit<Place, "id" | "radius"> & { radius?: number };

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getPlaces(): Promise<Place[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePlaces(places: Place[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(places));
}

// saving a bucket that already has a place replaces the old one
export async function savePlace(input: NewPlace): Promise<Place> {
  if ((input.bucket as LocationBucket) === "unknown") {
    throw new Error('"unknown" is not a place bucket');
  }
  const place: Place = {
    id: newId(),
    bucket: input.bucket,
    label: input.label,
    latitude: input.latitude,
    longitude: input.longitude,
    radius: input.radius ?? DEFAULT_RADIUS_METERS,
  };
  const others = (await getPlaces()).filter((p) => p.bucket !== place.bucket);
  await writePlaces([...others, place]);
  return place;
}

export async function removePlace(id: string): Promise<void> {
  const places = await getPlaces();
  const remaining = places.filter((p) => p.id !== id);
  if (remaining.length !== places.length) {
    await writePlaces(remaining);
  }
}
