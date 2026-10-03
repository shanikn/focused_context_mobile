import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  applyReminderSchedule,
  clearReminderSchedule,
  getScheduledNoteIds,
  REMINDER_CHANNEL_ID,
} from "./scheduledReminders";

jest.mock("expo-notifications", () => ({
  SchedulableTriggerInputTypes: { DAILY: "daily", DATE: "date" },
  AndroidImportance: { HIGH: 4 },
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: "reminder-old-note" },
    { identifier: "some-other-notification" },
  ] as never);
});

const plan = [
  {
    identifier: "reminder-a",
    noteId: "a",
    body: "remind me at 17:53",
    trigger: { kind: "daily" as const, hour: 17, minute: 53 },
  },
  {
    identifier: "reminder-b",
    noteId: "b",
    body: "dentist",
    trigger: { kind: "date" as const, date: new Date(2026, 9, 5, 15, 0) },
  },
];

test("cancels only earlier reminder alarms, then schedules the plan", async () => {
  await applyReminderSchedule(plan);

  expect(mocked.cancelScheduledNotificationAsync.mock.calls).toEqual([["reminder-old-note"]]);
  expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
    REMINDER_CHANNEL_ID,
    expect.objectContaining({ importance: 4 })
  );
  expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: "reminder-a",
    content: expect.objectContaining({ body: "remind me at 17:53", data: { noteId: "a" } }),
    trigger: { type: "daily", hour: 17, minute: 53, channelId: REMINDER_CHANNEL_ID },
  });
  expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: "reminder-b",
    content: expect.objectContaining({ body: "dentist", data: { noteId: "b" } }),
    trigger: { type: "date", date: new Date(2026, 9, 5, 15, 0), channelId: REMINDER_CHANNEL_ID },
  });
});

test("remembers which notes have an alarm, so polling can skip them", async () => {
  await applyReminderSchedule(plan);
  expect(await getScheduledNoteIds()).toEqual(new Set(["a", "b"]));
});

test("rescheduling replaces the previous set", async () => {
  await applyReminderSchedule(plan);
  await applyReminderSchedule([plan[1]]);
  expect(await getScheduledNoteIds()).toEqual(new Set(["b"]));
});

test("clearReminderSchedule cancels reminder alarms and forgets them", async () => {
  await applyReminderSchedule(plan);
  jest.clearAllMocks();
  mocked.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: "reminder-a" },
    { identifier: "reminder-b" },
    { identifier: "some-other-notification" },
  ] as never);

  await clearReminderSchedule();

  expect(mocked.cancelScheduledNotificationAsync.mock.calls).toEqual([
    ["reminder-a"],
    ["reminder-b"],
  ]);
  expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(await getScheduledNoteIds()).toEqual(new Set());
});
