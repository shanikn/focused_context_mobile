import { offlineReminders } from "./offlineArrival";
import { Note } from "../types/notes";

// Monday 2026-10-05, 17:30 local
const NOW = new Date(2026, 9, 5, 17, 30, 0);
const HOME = "id-home";
const GYM = "id-gym";

let n = 0;
const note = (content: string, fields: Partial<Note> = {}) =>
  ({
    _id: `n${++n}`,
    content,
    category: "todo",
    contexts: [HOME],
    list_name: "General",
    reminders_enabled: true,
    never_show: false,
    cooldown_until: null,
    remind_on_date: null,
    useful_count: 0,
    dismissed_count: 0,
    ...fields,
  }) as Note;

const ids = (notes: Note[]) => notes.map((x) => x.content);

test("only notes tagged with the place I arrived at", () => {
  const notes = [note("home 1"), note("gym 1", { contexts: [GYM] }), note("no place", { contexts: [] })];
  expect(ids(offlineReminders(notes, HOME, NOW))).toEqual(["home 1"]);
  expect(ids(offlineReminders(notes, GYM, NOW))).toEqual(["gym 1"]);
});

test("nothing for 'Not at a place' (no meaning-based matching offline)", () => {
  expect(offlineReminders([note("home 1")], "unknown", NOW)).toEqual([]);
});

test("same filters as the server: alerts off, ideas, never show, snoozed, another day", () => {
  const notes = [
    note("ok"),
    note("alerts off", { reminders_enabled: false }),
    note("idea", { category: "idea" }),
    note("never", { never_show: true }),
    note("snoozed", { cooldown_until: "2026-10-06T12:00:00" }),
    note("tomorrow", { remind_on_date: "2026-10-06" }),
    note("today", { remind_on_date: "2026-10-05" }),
    note("snooze over", { cooldown_until: "2026-10-04T12:00:00Z" }),
  ];
  expect(ids(offlineReminders(notes, HOME, NOW)).sort()).toEqual(["ok", "snooze over", "today"]);
});

test("a cooldown without a time zone is UTC, as the server stores it", () => {
  // 15:00 UTC is 18:00 in Israel (UTC+3) but this runs in any zone: compare against "now" in UTC terms
  const later = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString().replace("Z", "");
  const earlier = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString().replace("Z", "");
  const notes = [note("still snoozed", { cooldown_until: later }), note("free", { cooldown_until: earlier })];
  expect(ids(offlineReminders(notes, HOME, NOW))).toEqual(["free"]);
});

test("best first like the server: feedback score plus a bonus when the time is near; at most 3", () => {
  const notes = [
    note("plain"),
    note("liked", { useful_count: 2 }),
    note("disliked", { dismissed_count: 4 }),
    note("due soon", { contexts: [HOME, "18:00"] }), // within 60 min: +2
    note("due later", { contexts: [HOME, "21:00"] }),
  ];
  expect(ids(offlineReminders(notes, HOME, NOW))).toEqual(["liked", "due soon", "plain"]);
});
