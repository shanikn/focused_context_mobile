import { canAlert } from "./alertRules";
import { Note } from "../types/notes";

const note = (fields: Partial<Note>) => ({ category: "todo", reminders_enabled: true, ...fields }) as Note;

test("ideas never alert", () => {
  expect(canAlert(note({ category: "idea" }))).toBe(false);
});

test("alerts off never alert", () => {
  expect(canAlert(note({ reminders_enabled: false }))).toBe(false);
});

test("to-dos, errands, events and old categories can alert", () => {
  for (const category of ["todo", "errand", "event", "scheduled", "reminder", "uncategorized", "task"]) {
    expect(canAlert(note({ category }))).toBe(true);
  }
});

test("an older note without reminders_enabled can alert", () => {
  const n = note({}) as Partial<Note>;
  delete n.reminders_enabled;
  expect(canAlert(n as Note)).toBe(true);
});
