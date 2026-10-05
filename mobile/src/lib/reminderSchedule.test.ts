import { planReminderSchedule, REMINDER_ID_PREFIX } from "./reminderSchedule";
import { Note } from "../types/notes";

// Friday 2026-10-02, 12:00 local time
const NOW = new Date(2026, 9, 2, 12, 0, 0);

let counter = 0;
function note(fields: Partial<Note>): Note {
  counter += 1;
  return {
    _id: `n${counter}`,
    content: "note",
    contexts: [],
    reminders_enabled: true,
    never_show: false,
    cooldown_until: null,
    remind_time_explicit: false,
    remind_at_hour: null,
    remind_at_minute: null,
    remind_on_date: null,
    reminder_time_source: null,
    ...fields,
  } as Note;
}

test("time written in the note, no date: repeats daily at that time", () => {
  const n = note({ content: "remind me at 17:53", contexts: ["home", "17:53"], reminder_time_source: "text" });
  expect(planReminderSchedule([n], NOW)).toEqual([
    {
      identifier: `${REMINDER_ID_PREFIX}${n._id}`,
      noteId: n._id,
      body: "remind me at 17:53",
      trigger: { kind: "daily", hour: 17, minute: 53 },
    },
  ]);
});

test("time set by the user wins over the one in contexts", () => {
  const n = note({
    contexts: ["09:00"],
    remind_time_explicit: true,
    remind_at_hour: 7,
    remind_at_minute: 5,
    reminder_time_source: "explicit",
  });
  expect(planReminderSchedule([n], NOW)[0].trigger).toEqual({ kind: "daily", hour: 7, minute: 5 });
});

test("dated note in the future: one exact alarm at that date and time", () => {
  const n = note({ contexts: ["15:00"], remind_on_date: "2026-10-05", reminder_time_source: "text" });
  expect(planReminderSchedule([n], NOW)[0].trigger).toEqual({
    kind: "date",
    date: new Date(2026, 9, 5, 15, 0, 0),
  });
});

test("dated note later today is scheduled; earlier today is not", () => {
  const later = note({ contexts: ["17:53"], remind_on_date: "2026-10-02", reminder_time_source: "text" });
  const earlier = note({ contexts: ["08:00"], remind_on_date: "2026-10-02", reminder_time_source: "text" });
  expect(planReminderSchedule([later, earlier], NOW).map((r) => r.noteId)).toEqual([later._id]);
});

test("location default times are left to polling", () => {
  const n = note({ contexts: ["home", "09:00"], reminder_time_source: "default" });
  expect(planReminderSchedule([n], NOW)).toEqual([]);
});

test("older backend without reminder_time_source: only times the user set", () => {
  const explicit = note({
    contexts: ["14:30"],
    remind_time_explicit: true,
    remind_at_hour: 14,
    remind_at_minute: 30,
    reminder_time_source: undefined,
  });
  const unknownSource = note({ contexts: ["home", "09:00"], reminder_time_source: undefined });
  expect(planReminderSchedule([explicit, unknownSource], NOW).map((r) => r.noteId)).toEqual([
    explicit._id,
  ]);
});

test("alerts off, never show, or cooling down: not scheduled", () => {
  const timed = { contexts: ["17:53"], reminder_time_source: "text" as const };
  expect(
    planReminderSchedule(
      [
        note({ ...timed, reminders_enabled: false }),
        note({ ...timed, never_show: true }),
        note({ ...timed, cooldown_until: "2026-10-03T12:00:00" }),
      ],
      NOW
    )
  ).toEqual([]);
});

test("a cooldown that already ended doesn't block", () => {
  const n = note({ contexts: ["17:53"], reminder_time_source: "text", cooldown_until: "2026-10-01T12:00:00" });
  expect(planReminderSchedule([n], NOW)).toHaveLength(1);
});

test("an older note without reminders_enabled counts as on", () => {
  const n = note({ contexts: ["17:53"], reminder_time_source: "text" }) as Partial<Note>;
  delete n.reminders_enabled;
  expect(planReminderSchedule([n as Note], NOW)).toHaveLength(1);
});

test("no time: nothing to schedule", () => {
  expect(planReminderSchedule([note({ reminder_time_source: null })], NOW)).toEqual([]);
});

test("caps the number of alarms, keeping the soonest dated ones", () => {
  const dated = [5, 3, 4].map((day) =>
    note({ contexts: ["10:00"], remind_on_date: `2026-10-0${day}`, reminder_time_source: "text" })
  );
  const daily = note({ contexts: ["18:00"], reminder_time_source: "text" });
  const plan = planReminderSchedule([...dated, daily], NOW, 3);
  expect(plan.map((r) => r.noteId)).toEqual([daily._id, dated[1]._id, dated[2]._id]);
});

test("an idea never gets an alarm, even with a time", () => {
  const idea = note({ category: "idea", contexts: ["17:53"], reminder_time_source: "text" });
  const explicitIdea = note({
    category: "idea",
    remind_time_explicit: true,
    remind_at_hour: 9,
    remind_at_minute: 0,
    reminder_time_source: "explicit",
  });
  expect(planReminderSchedule([idea, explicitIdea], NOW)).toEqual([]);
});
