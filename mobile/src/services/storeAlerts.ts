import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { getNotes } from "../api/notes";
import { nearbyStores } from "../api/places";
import { GeofenceRegion } from "../lib/geofenceLogic";
import { getNotificationsEnabled, getStoreAlertsEnabled } from "../lib/reminderPrefs";
import {
  errandStoreType,
  LatLon,
  MAX_STORE_FENCES,
  needsStoreRefresh,
  neededStoreTypes,
  openErrands,
  parseStoreRegionId,
  recordStoreEnter,
  recordStoreExit,
  REFRESH_REGION_ID,
  refreshRegion,
  SEARCH_RADIUS_M,
  shouldNotifyStore,
  Store,
  storeAlertMessage,
  StoreCache,
  storeRegionId,
  storeRegions,
  StoreType,
  StoreVisits,
} from "../lib/storeAlerts";
import { Note } from "../types/notes";
import { syncGeofencing } from "./geofence";
import { getGrantedPermissions } from "./locationPermissions";
import { quickFix } from "./currentPosition";

// Errand alerts near any store of the right type. See lib/storeAlerts.ts for
// how it stays cheap on battery: geofences only, and a 1 km "refresh" fence
// that wakes the app to look for stores again after you've moved.

const KEYS = {
  cache: "smartmind.storeAlerts.cache", // stores found around the last lookup point
  regions: "smartmind.storeAlerts.regions", // store fences + the refresh fence to register
  names: "smartmind.storeAlerts.names", // region id -> store name, for the alert
  visits: "smartmind.storeAlerts.visits", // once-per-visit bookkeeping
  errands: "smartmind.storeAlerts.errands", // open errands at the last sync, for offline alerts
};

// a fix this recent is good enough to look for stores 2 km around
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;
const LAST_KNOWN_ACCURACY_M = 500;

interface SavedRegions {
  stores: GeofenceRegion[];
  refresh: GeofenceRegion | null;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// the store fences and refresh fence syncGeofencing should register
export async function getStoreRegions(): Promise<SavedRegions> {
  const saved = await readJson<SavedRegions | null>(KEYS.regions, null);
  return saved && Array.isArray(saved.stores) ? saved : { stores: [], refresh: null };
}

async function clearStoreRegions(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.regions);
}

async function isActive(): Promise<boolean> {
  const [enabled, notificationsEnabled, permissions] = await Promise.all([
    getStoreAlertsEnabled(),
    getNotificationsEnabled(),
    getGrantedPermissions(),
  ]);
  return (
    enabled && notificationsEnabled && permissions.foreground && permissions.background && permissions.notifications
  );
}

// the phone's recent location if it has one (free), else one Balanced fix
// with a timeout; finding stores 2 km around doesn't need more
async function currentPosition(): Promise<LatLon | null> {
  const fix = await quickFix({ maxAgeMs: LAST_KNOWN_MAX_AGE_MS, maxAccuracyM: LAST_KNOWN_ACCURACY_M });
  return fix ? { latitude: fix.latitude, longitude: fix.longitude } : null;
}

// only what an alert needs
function slim(notes: Note[]): Note[] {
  return notes.map(
    (n) =>
      ({
        _id: n._id,
        content: n.content,
        category: n.category,
        store_type: n.store_type ?? null,
        reminders_enabled: n.reminders_enabled,
        never_show: n.never_show,
        cooldown_until: n.cooldown_until,
      }) as Note
  );
}

async function lookUpStores(
  cache: StoreCache | null,
  position: LatLon,
  types: StoreType[],
  now: number
): Promise<StoreCache | null> {
  // same area and still fresh: only the types we don't have yet
  const sameArea = cache !== null && !needsStoreRefresh(cache, position, [], now);
  const toFetch = sameArea ? types.filter((t) => !cache!.byType[t]) : types;
  const results = await Promise.all(
    toFetch.map((t) =>
      nearbyStores(t, position.latitude, position.longitude, SEARCH_RADIUS_M)
        .then((stores: Store[]) => [t, stores] as const)
        .catch(() => null)
    )
  );
  const found = results.filter((r): r is readonly [StoreType, Store[]] => r !== null);
  if (found.length === 0) {
    return cache; // couldn't reach the server: keep the stores we had
  }
  const byType = sameArea ? { ...cache!.byType } : {};
  for (const [t, stores] of found) {
    byType[t] = stores;
  }
  if (!sameArea) {
    // a type that failed keeps its old stores until the next lookup
    for (const t of types) {
      if (!byType[t] && cache?.byType[t]) {
        byType[t] = cache.byType[t];
      }
    }
  }
  const allFound = found.length === toFetch.length;
  return {
    center: sameArea ? cache!.center : allFound || !cache ? position : cache.center,
    fetchedAt: sameArea ? cache!.fetchedAt : allFound || !cache ? now : cache.fetchedAt,
    byType,
  };
}

// Register fences for the nearest stores of each type I have open errands
// for, or remove them all. Call on app start, when it comes to the
// foreground, after notes change, and when the setting changes. Never prompts.
export async function syncStoreAlerts(): Promise<void> {
  try {
    if (!(await isActive())) {
      await clearStoreRegions();
      await syncGeofencing();
      return;
    }
    let notes: Note[];
    try {
      notes = await getNotes();
    } catch {
      return; // offline: keep the fences we have
    }
    const now = Date.now();
    const errands = openErrands(notes, now);
    await writeJson(KEYS.errands, slim(errands));
    const types = neededStoreTypes(errands);
    if (types.length === 0) {
      await clearStoreRegions();
      await syncGeofencing();
      return;
    }
    const position = await currentPosition();
    if (!position) {
      return;
    }
    let cache = await readJson<StoreCache | null>(KEYS.cache, null);
    if (needsStoreRefresh(cache, position, types, now)) {
      cache = await lookUpStores(cache, position, types, now);
      if (cache) {
        await writeJson(KEYS.cache, cache);
      }
    }
    if (!cache) {
      return;
    }
    // ordered from where the stores were looked up, so the fences stay the
    // same (and aren't re-registered) until we move about 1 km
    const stores = storeRegions(cache.byType, types, cache.center, MAX_STORE_FENCES);
    const names: Record<string, string> = {};
    for (const t of types) {
      for (const s of cache.byType[t] ?? []) {
        names[storeRegionId(t, s.id)] = s.name;
      }
    }
    await writeJson(KEYS.names, names);
    await writeJson(KEYS.regions, {
      stores,
      refresh: stores.length > 0 ? refreshRegion(cache.center) : null,
    } satisfies SavedRegions);
    await syncGeofencing();
  } catch (e) {
    console.log("Store alerts sync failed", e);
  }
}

async function errandsFor(storeType: StoreType): Promise<Note[]> {
  let errands: Note[];
  try {
    // fresh, so errands done or deleted since the last sync aren't listed
    errands = openErrands(await getNotes(), Date.now());
    await writeJson(KEYS.errands, slim(errands));
  } catch {
    errands = openErrands(await readJson<Note[]>(KEYS.errands, []), Date.now());
  }
  return errands.filter((e) => errandStoreType(e) === storeType);
}

// Called from the geofence task for store and refresh regions.
export async function handleStoreGeofenceEvent(event: "enter" | "exit", regionId: string): Promise<void> {
  try {
    if (regionId === REFRESH_REGION_ID) {
      if (event === "exit") {
        await syncStoreAlerts(); // moved about 1 km
      }
      return;
    }
    const parsed = parseStoreRegionId(regionId);
    if (!parsed) {
      return;
    }
    const now = Date.now();
    const visits = await readJson<StoreVisits>(KEYS.visits, {});
    if (event === "exit") {
      await writeJson(KEYS.visits, recordStoreExit(visits, regionId, now));
      return;
    }
    const [enabled, notificationsEnabled] = await Promise.all([getStoreAlertsEnabled(), getNotificationsEnabled()]);
    if (!enabled || !notificationsEnabled || !shouldNotifyStore(visits[regionId], now)) {
      return;
    }
    const errands = await errandsFor(parsed.storeType);
    if (errands.length === 0) {
      await writeJson(KEYS.visits, recordStoreEnter(visits, regionId, now, false));
      return;
    }
    const names = await readJson<Record<string, string>>(KEYS.names, {});
    const { title, body } = storeAlertMessage(names[regionId] ?? "a store nearby", errands);
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
        data: { kind: "store", storeType: parsed.storeType, noteIds: errands.map((e) => e._id) },
      },
      trigger: null,
    });
    await writeJson(KEYS.visits, recordStoreEnter(visits, regionId, now, true));
  } catch (e) {
    console.log("Store alert failed", e);
  }
}
