import { Note } from "../types/notes";
import { normalizeCategory } from "./categoryColors";
import { GENERAL } from "./folderOrder";

// Filters for the notes list: checked folders, category chip and search text.
// They combine (a note must match all three) and keep the notes' order.

export const ALL_CATEGORIES = "All";

export interface NoteFilters {
  folders: string[]; // the checked folders; none checked = every folder
  category: string; // "All" or a category
  query: string;
}

// Hebrew vowel points and cantillation marks (niqqud), and invisible
// direction marks a Hebrew keyboard or copied RTL text can add
const HEBREW_MARKS = /[֑-ׇ]/g;
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;

export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFC")
    .replace(HEBREW_MARKS, "")
    .replace(BIDI_MARKS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  const words = normalizeForSearch(filters.query).split(" ").filter(Boolean);
  return notes.filter((note) => {
    if (filters.folders.length > 0 && !filters.folders.includes(note.list_name || GENERAL)) {
      return false;
    }
    if (filters.category !== ALL_CATEGORIES && normalizeCategory(note.category) !== filters.category) {
      return false;
    }
    if (words.length > 0) {
      const text = normalizeForSearch(note.content ?? "");
      return words.every((w) => text.includes(w));
    }
    return true;
  });
}

// A search, a category or checked folders are narrowing the list.
export function hasActiveFilters(filters: NoteFilters): boolean {
  return filters.query.trim() !== "" || filters.category !== ALL_CATEGORIES || filters.folders.length > 0;
}
