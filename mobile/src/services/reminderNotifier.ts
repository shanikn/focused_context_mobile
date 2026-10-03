import * as Notifications from "expo-notifications";

import { getReminders } from "../api/reminders";
import { Note } from "../types/notes";
import {
  getNotificationsEnabled,
  getReminderLocation,
  markNotifiedInSlot,
  wasNotifiedInSlot,
} from "../lib/reminderPrefs";
import { getScheduledNoteIds } from "./scheduledReminders";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface ReminderCheckResult {
  reminders: Note[];
  notifiedCount: number;
  location: string;
  notificationsEnabled: boolean;
  permissionGranted: boolean;
}

function getCurrentSlot(now: Date): string {
  return `${now.toISOString().slice(0, 13)}`;
}

function getExplicitReminderTime(note: Note): { hour: number; minute: number } | null {
  if (typeof note.remind_at_hour === "number") {
    return {
      hour: note.remind_at_hour,
      minute: typeof note.remind_at_minute === "number" ? note.remind_at_minute : 0,
    };
  }

  for (const item of note.contexts) {
    if (!item.includes(":")) {
      continue;
    }

    const [hourText, minuteText] = item.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return { hour, minute };
    }
  }

  return null;
}

function isDueNow(note: Note, now: Date): boolean {
  const explicitTime = getExplicitReminderTime(note);
  if (!explicitTime) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = explicitTime.hour * 60 + explicitTime.minute;
  const delta = currentMinutes - targetMinutes;

  return delta >= 0 && delta <= 5;
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function fetchCurrentReminders(): Promise<{
  reminders: Note[];
  location: string;
}> {
  const now = new Date();
  const location = await getReminderLocation();
  const reminders = await getReminders(location, now.getHours(), now.getMinutes());
  return { reminders, location };
}

// on arrival at a saved place, notify up to this many of its top notes
const MAX_ARRIVAL_NOTES = 3;

export async function checkAndNotifyReminders(
  options: { force?: boolean; onArrival?: boolean } = {}
): Promise<ReminderCheckResult> {
  const notificationsEnabled = await getNotificationsEnabled();
  const permissionGranted = notificationsEnabled
    ? await ensureNotificationPermissions()
    : false;

  const { reminders, location } = await fetchCurrentReminders();

  if (!notificationsEnabled || !permissionGranted) {
    return {
      reminders,
      notifiedCount: 0,
      location,
      notificationsEnabled,
      permissionGranted,
    };
  }

  const now = new Date();
  const slot = getCurrentSlot(now);
  let notifiedCount = 0;

  // arrival: the top notes for this place (the backend already ranks and
  // filters them for the location), whether or not they have a time.
  // otherwise: only notes whose time is due now
  const candidates = options.onArrival
    ? reminders.slice(0, MAX_ARRIVAL_NOTES)
    : reminders;
  // polling is the fallback: notes with an exact scheduled alarm are skipped
  // on the timed path so they don't notify twice
  const scheduledIds = options.onArrival ? new Set<string>() : await getScheduledNoteIds();

  for (const note of candidates) {
    if (!options.onArrival && !isDueNow(note, now)) {
      continue;
    }
    if (scheduledIds.has(note._id)) {
      continue;
    }

    if (!options.force && (await wasNotifiedInSlot(note._id, slot))) {
      continue;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "FocusedContext reminder",
        body: note.content,
        sound: "default",
        data: {
          noteId: note._id,
          category: note.category,
          listName: note.list_name,
        },
      },
      trigger: null,
    });

    await markNotifiedInSlot(note._id, slot);
    notifiedCount += 1;
  }

  return {
    reminders,
    notifiedCount,
    location,
    notificationsEnabled,
    permissionGranted,
  };
}
