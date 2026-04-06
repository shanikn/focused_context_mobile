import * as Notifications from "expo-notifications";

import { getReminders } from "../api/reminders";
import { Note } from "../types/notes";
import {
  getNotificationsEnabled,
  getReminderLocation,
  markNotifiedInSlot,
  wasNotifiedInSlot,
} from "../lib/reminderPrefs";

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

export async function checkAndNotifyReminders(
  options: { force?: boolean } = {}
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

  for (const note of reminders) {
    if (!isDueNow(note, now)) {
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
