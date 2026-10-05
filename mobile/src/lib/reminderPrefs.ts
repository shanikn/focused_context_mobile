import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  location: "focusedcontext.reminder.location",
  enabled: "focusedcontext.reminder.enabled",
  notifiedSlots: "focusedcontext.reminder.notifiedSlots",
  storeAlerts: "smartmind.storeAlerts.enabled",
};

type NotifiedSlots = Record<string, string>;

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

// The current location: a place id, or "unknown" when not at a saved place.
// Values stored before custom places ("home", "errands", ...) are mapped by
// resolveCurrentLocation in lib/userPlaces once the places are loaded; the
// backend also accepts the old names.
export async function getReminderLocation(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.location)) || "unknown";
}

export async function setReminderLocation(location: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.location, location);
}

export async function getNotificationsEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEYS.enabled);
  return value !== "false";
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.enabled, enabled ? "true" : "false");
}

// errand alerts near supermarkets, pharmacies and post offices (on by default)
export async function getStoreAlertsEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEYS.storeAlerts)) !== "false";
}

export async function setStoreAlertsEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEYS.storeAlerts, enabled ? "true" : "false");
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
