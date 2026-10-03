import { reminderLabel } from "./noteLabels";
import { Note } from "../types/notes";

const base = {
  contexts: [] as string[],
  remind_at_hour: null,
  remind_at_minute: null,
  remind_on_date: null,
  reminders_enabled: true,
} as unknown as Note;

const note = (fields: Record<string, unknown>) => ({ ...base, ...fields }) as Note;

test("AI-inferred time with alerts on", () => {
  expect(reminderLabel(note({ contexts: ["home", "17:53"] }))).toBe("Alerts at 17:53");
});

test("older note without a reminders_enabled field counts as alerts on", () => {
  const legacy = note({ contexts: ["home", "17:53"] }) as Partial<Note>;
  delete legacy.reminders_enabled;
  expect(reminderLabel(legacy as Note)).toBe("Alerts at 17:53");
});

test("alerts explicitly turned off by the user", () => {
  expect(reminderLabel(note({ contexts: ["17:53"], reminders_enabled: false }))).toBe(
    "Alerts off"
  );
});

test("manual time wins over the inferred one", () => {
  expect(
    reminderLabel(note({ contexts: ["09:00"], remind_at_hour: 7, remind_at_minute: 5 }))
  ).toBe("Alerts at 07:05");
});

test("date and time", () => {
  expect(reminderLabel(note({ contexts: ["15:00"], remind_on_date: "2026-10-05" }))).toBe(
    "Alerts on 2026-10-05 at 15:00"
  );
});

test("no time or date: smart alerts", () => {
  expect(reminderLabel(note({}))).toBe("Smart alerts on");
});
