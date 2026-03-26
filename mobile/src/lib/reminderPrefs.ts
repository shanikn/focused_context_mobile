import AsyncStorage from "@react-native-async-storage/async-storage";

export const LOCATION_BUCKETS = ["unknown", "home", "uni", "work", "errands"] as const;

export type LocationBucket = (typeof LOCATION_BUCKETS)[number];

const KEYS = {
  location: "focusedcontext.reminder.location",
  enabled: "focusedcontext.reminder.enabled",
  notifiedSlots: "focusedcontext.reminder.notifiedSlots",
};

type NotifiedSlots = Record<string, string>;

function isLocationBucket(value: string | null): value is LocationBucket {
  return value !== null && LOCATION_BUCKETS.includes(value as LocationBucket);
}

async function getNotifiedSlots(): Promise<NotifiedSlots> {
  const raw = await AsyncStorage.getItem(KEYS.notifiedSlots);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as NotifiedSlots;
  } catch {
    return {};
  }
}

export async function getReminderLocation(): Promise<LocationBucket> {
  const value = await AsyncStorage.getItem(KEYS.location);
  return isLocationBucket(value) ? value : "unknown";
}

export async function setReminderLocation(location: LocationBucket): Promise<void> {
  await AsyncStorage.setItem(KEYS.location, location);
}

export async function getNotificationsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.enabled);
  return value !== "false";
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.enabled, enabled ? "true" : "false");
}

export async function wasNotifiedInSlot(noteId: string, slot: string): Promise<boolean> {
  const slots = await getNotifiedSlots();
  return slots[noteId] === slot;
}

export async function markNotifiedInSlot(noteId: string, slot: string): Promise<void> {
  const slots = await getNotifiedSlots();
  const next: NotifiedSlots = {};

  for (const [id, existingSlot] of Object.entries(slots)) {
    if (existingSlot.slice(0, 10) === slot.slice(0, 10)) {
      next[id] = existingSlot;
    }
  }

  next[noteId] = slot;
  await AsyncStorage.setItem(KEYS.notifiedSlots, JSON.stringify(next));
}
