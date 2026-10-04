import { groupNotes, noteTime } from "./noteSections";
import { reminderLabel } from "./noteLabels";
import { Note } from "../types/notes";

// Sunday 4 Oct 2026, 15:30 local time
const NOW = new Date(2026, 9, 4, 15, 30);

let counter = 0;
function note(fields: Partial<Note>): Note {
  counter += 1;
  return {
    _id: `n${counter}`,
    content: `note ${counter}`,
    contexts: [],
    reminders_enabled: true,
    remind_at_hour: null,
    remind_at_minute: null,
    remind_on_date: null,
    ...fields,
  } as Note;
}

const titles = (notes: Note[], now = NOW) => groupNotes(notes, now).map((s) => s.title);
const ids = (section: { notes: Note[] }) => section.notes.map((n) => n._id);

describe("noteTime", () => {
  test("a time the user set wins", () => {
    expect(noteTime(note({ remind_at_hour: 7, remind_at_minute: 5, contexts: ["09:00"] }))).toBe("07:05");
  });

  test("hour without minute", () => {
    expect(noteTime(note({ remind_at_hour: 9 }))).toBe("09:00");
  });

  test("an HH:MM in contexts", () => {
    expect(noteTime(note({ contexts: ["place-id", "17:53"] }))).toBe("17:53");
  });

  test("no time", () => {
    expect(noteTime(note({ contexts: ["place-id"] }))).toBeNull();
  });

  test("reminderLabel uses the same time", () => {
    const n = note({ contexts: ["17:53"] });
    expect(reminderLabel(n)).toBe(`Alerts at ${noteTime(n)}`);
  });
});

describe("which section a note goes in", () => {
  test("alerts off -> Alerts off", () => {
    expect(titles([note({ reminders_enabled: false, remind_on_date: "2026-10-04" })])).toEqual(["Alerts off"]);
  });

  test("an older note without reminders_enabled counts as on", () => {
    const n = note({ contexts: ["17:53"] }) as Partial<Note>;
    delete n.reminders_enabled;
    expect(titles([n as Note])).toEqual(["Today"]);
  });

  test("dated today -> Today", () => {
    expect(titles([note({ remind_on_date: "2026-10-04" })])).toEqual(["Today"]);
  });

  test("dated tomorrow -> 'Tomorrow · Mon 5 Oct'", () => {
    expect(titles([note({ remind_on_date: "2026-10-05" })])).toEqual(["Tomorrow · Mon 5 Oct"]);
  });

  test("a later date -> 'Wed 7 Oct'", () => {
    expect(titles([note({ remind_on_date: "2026-10-07" })])).toEqual(["Wed 7 Oct"]);
  });

  test("a past date -> Earlier", () => {
    expect(titles([note({ remind_on_date: "2026-10-03" })])).toEqual(["Earlier"]);
  });

  test("no date but a time -> Today (it repeats daily)", () => {
    expect(titles([note({ contexts: ["08:00"] })])).toEqual(["Today"]);
    expect(titles([note({ remind_at_hour: 22 })])).toEqual(["Today"]);
  });

  test("no date and no time -> Smart alerts", () => {
    expect(titles([note({ contexts: ["place-id"] })])).toEqual(["Smart alerts"]);
  });
});

describe("section order and contents", () => {
  test("Earlier, Today, Tomorrow, later dates ascending, Smart alerts, Alerts off", () => {
    const notes = [
      note({ reminders_enabled: false }),
      note({}),
      note({ remind_on_date: "2026-10-12" }),
      note({ remind_on_date: "2026-10-07" }),
      note({ remind_on_date: "2026-10-05" }),
      note({ remind_on_date: "2026-10-04" }),
      note({ remind_on_date: "2026-09-30" }),
    ];
    expect(titles(notes)).toEqual([
      "Earlier",
      "Today",
      "Tomorrow · Mon 5 Oct",
      "Wed 7 Oct",
      "Mon 12 Oct",
      "Smart alerts",
      "Alerts off",
    ]);
  });

  test("empty sections are left out", () => {
    expect(titles([note({}), note({ reminders_enabled: false })])).toEqual(["Smart alerts", "Alerts off"]);
    expect(groupNotes([], NOW)).toEqual([]);
  });

  test("notes on the same later date share one section", () => {
    const a = note({ remind_on_date: "2026-10-07" });
    const b = note({ remind_on_date: "2026-10-07" });
    const sections = groupNotes([a, b], NOW);
    expect(sections).toHaveLength(1);
    expect(ids(sections[0])).toEqual([a._id, b._id]);
  });

  test("keys are stable and unique", () => {
    const sections = groupNotes(
      [
        note({ remind_on_date: "2026-10-03" }),
        note({ remind_on_date: "2026-10-04" }),
        note({ remind_on_date: "2026-10-05" }),
        note({ remind_on_date: "2026-10-07" }),
        note({}),
        note({ reminders_enabled: false }),
      ],
      NOW
    );
    expect(sections.map((s) => s.key)).toEqual([
      "earlier",
      "today",
      "tomorrow",
      "date-2026-10-07",
      "smart",
      "alerts-off",
    ]);
  });
});

describe("order inside a section", () => {
  test("by time ascending; notes without a time keep their order, after the timed ones", () => {
    const untimedA = note({ remind_on_date: "2026-10-04" });
    const late = note({ contexts: ["21:00"] });
    const untimedB = note({ remind_on_date: "2026-10-04" });
    const early = note({ remind_at_hour: 7, remind_at_minute: 30 });
    const mid = note({ remind_on_date: "2026-10-04", contexts: ["12:00"] });
    const [today] = groupNotes([untimedA, late, untimedB, early, mid], NOW);
    expect(ids(today)).toEqual([early._id, mid._id, late._id, untimedA._id, untimedB._id]);
  });

  test("Smart alerts keep their original order", () => {
    const a = note({});
    const b = note({});
    const c = note({});
    expect(ids(groupNotes([c, a, b], NOW)[0])).toEqual([c._id, a._id, b._id]);
  });
});

describe("midnight and date boundaries", () => {
  test("just before midnight: tomorrow's date is Tomorrow", () => {
    const now = new Date(2026, 9, 4, 23, 59, 59);
    expect(titles([note({ remind_on_date: "2026-10-05" })], now)).toEqual(["Tomorrow · Mon 5 Oct"]);
  });

  test("just after midnight: yesterday's date is Earlier, today's is Today", () => {
    const now = new Date(2026, 9, 5, 0, 0, 1);
    expect(titles([note({ remind_on_date: "2026-10-04" })], now)).toEqual(["Earlier"]);
    expect(titles([note({ remind_on_date: "2026-10-05" })], now)).toEqual(["Today"]);
  });

  test("across a month end", () => {
    const now = new Date(2026, 9, 31, 12, 0);
    expect(titles([note({ remind_on_date: "2026-11-01" })], now)).toEqual(["Tomorrow · Sun 1 Nov"]);
  });

  test("across a year end", () => {
    const now = new Date(2026, 11, 31, 12, 0);
    expect(titles([note({ remind_on_date: "2027-01-01" })], now)).toEqual(["Tomorrow · Fri 1 Jan"]);
    expect(titles([note({ remind_on_date: "2027-01-04" })], now)).toEqual(["Mon 4 Jan"]);
  });

  test("an unreadable date counts as no date", () => {
    expect(titles([note({ remind_on_date: "soon" })])).toEqual(["Smart alerts"]);
  });
});
