import { Note } from "../types/notes";
import { ServerPlace } from "./userPlaces";

// Badge text for a note's phone alerts. Older notes may lack fields that were
// added later, so a missing reminders_enabled counts as on (as the backend's
// reminder engine does) and only an explicit false means "off".
export function reminderLabel(note: Note): string {
  if (note.reminders_enabled === false) {
    return "Alerts off";
  }
  const manualTime =
    note.remind_at_hour != null
      ? `${String(note.remind_at_hour).padStart(2, "0")}:${String(
          note.remind_at_minute ?? 0
        ).padStart(2, "0")}`
      : null;
  const time =
    manualTime ??
    note.contexts.find((item) => typeof item === "string" && /^\d{2}:\d{2}$/.test(item)) ??
    null;
  if (!note.remind_on_date && !time) {
    return "Smart alerts on";
  }
  const parts = ["Alerts"];
  if (note.remind_on_date) {
    parts.push(`on ${note.remind_on_date}`);
  }
  if (time) {
    parts.push(`at ${time}`);
  }
  return parts.join(" ");
}

// Name of the place a note is tagged with (notes carry place ids in contexts).
export function locationLabel(note: Note, places: ServerPlace[]): string | null {
  for (const item of note.contexts) {
    const place = places.find((p) => p.id === item);
    if (place) {
      return place.name;
    }
  }
  return null;
}
