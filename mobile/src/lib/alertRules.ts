import { Note } from "../types/notes";

// Whether a note may ever notify: alerts on (missing counts as on), and not an idea.
export function canAlert(note: Note): boolean {
  return note.reminders_enabled !== false && note.category !== "idea";
}
