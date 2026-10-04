import AsyncStorage from "@react-native-async-storage/async-storage";

import { listPlaces } from "../api/places";
import {
  getAllCoords,
  mergePlaces,
  migrateLegacyPlaces,
  pruneCoords,
  ServerPlace,
  UserPlace,
} from "../lib/userPlaces";

// last places loaded from the backend, so the app (and the geofence task)
// still knows the place names and ids offline
const CACHE_KEY = "focusedcontext.serverPlaces";

export async function getCachedServerPlaces(): Promise<ServerPlace[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// The user's places with this phone's coordinates. Falls back to the cache
// when the backend can't be reached.
export async function loadPlaces(): Promise<UserPlace[]> {
  let places: ServerPlace[];
  try {
    places = await listPlaces();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(places));
    await migrateLegacyPlaces(places);
    await pruneCoords(places);
  } catch {
    places = await getCachedServerPlaces();
  }
  return mergePlaces(places, await getAllCoords());
}
