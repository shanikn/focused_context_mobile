import AsyncStorage from "@react-native-async-storage/async-storage";
import { Note } from "../types/notes";
import { groupNotes, NoteSection } from "./noteSections";

// The notes list has two views: Recent (one list, newest created first) and
// Upcoming (the date sections). The last choice is kept on this phone.

export type NotesView = "recent" | "upcoming";

const STORAGE_KEY = "smartmind.notesView";

function createdTime(note: Note): number | null {
  const t = note.created_at ? new Date(note.created_at).getTime() : NaN;
  return Number.isNaN(t) ? null : t;
}

// newest created first; notes without a valid created_at go last, in their order
export function sortRecent(notes: Note[]): Note[] {
  return notes
    .map((n, i) => ({ n, i, t: createdTime(n) }))
    .sort((a, b) => {
      if (a.t !== null && b.t !== null && a.t !== b.t) {
        return b.t - a.t;
      }
      if ((a.t === null) !== (b.t === null)) {
        return a.t === null ? 1 : -1;
      }
      return a.i - b.i;
    })
    .map((x) => x.n);
}

export function notesViewSections(view: NotesView, notes: Note[], now: Date): NoteSection[] {
  if (view === "upcoming") {
    return groupNotes(notes, now);
  }
  return notes.length > 0 ? [{ key: "recent", title: "", notes: sortRecent(notes) }] : [];
}

export async function getNotesView(): Promise<NotesView> {
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === "upcoming" ? "upcoming" : "recent";
  } catch {
    return "recent";
  }
}

export async function setNotesView(view: NotesView): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, view);
  } catch {
    // only a convenience: the list still works, it just won't be remembered
  }
}
