import { Note } from "../types/notes";
import { canAlert } from "./alertRules";

// Which notes to show when you arrive at a place. A note with a specific
// time ("remind me I'm home at 17:54") waits for that time and its exact
// alarm, unless it's about arriving ("when I get home at 18:00 ...").

export const MAX_ARRIVAL_NOTES = 3;

const ARRIVAL_WORDS =
  /\b(arriv\w*|on arrival|when i (get|reach|come)\b|get(ting)? (home|there|back|to)\b|when i'?m (at|home|there|back)|when i am (at|home|there|back)|once i'?m|once i am|once i (get|reach))/i;

// fallback for an older backend that doesn't send reminder_time_source
const TIME_IN_TEXT = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(am|pm)\b|\b(morning|noon|afternoon|evening|tonight|night)\b/i;

export function hasSpecificTime(note: Note): boolean {
  if (note.remind_time_explicit && note.remind_at_hour != null) {
    return true;
  }
  const source = note.reminder_time_source;
  if (source !== undefined) {
    return source === "explicit" || source === "text";
  }
  const hasTime = note.contexts.some((c) => typeof c === "string" && /^\d{2}:\d{2}$/.test(c));
  return hasTime && TIME_IN_TEXT.test(note.content);
}

export function isAboutArriving(note: Note): boolean {
  return ARRIVAL_WORDS.test(note.content);
}

// Keeps the backend's ranking; at most `max` notes.
export function arrivalCandidates(notes: Note[], max: number = MAX_ARRIVAL_NOTES): Note[] {
  return notes
    .filter(canAlert)
    .filter((n) => !hasSpecificTime(n) || isAboutArriving(n))
    .slice(0, max);
}
