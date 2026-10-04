import { Note } from "../types/notes";
import { CATEGORIES } from "./categoryColors";
import { ALL, GENERAL } from "./folderOrder";

// Filters for the notes list: folder tab, category chip and search text.
// They combine (a note must match all three) and keep the notes' order.

export const ALL_CATEGORIES = "All";

export interface NoteFilters {
  folder: string; // "All" or a folder name
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

function categoryOf(note: Note): string {
  return (CATEGORIES as readonly string[]).includes(note.category) ? note.category : "uncategorized";
}

export function filterNotes(notes: Note[], filters: NoteFilters): Note[] {
  const words = normalizeForSearch(filters.query).split(" ").filter(Boolean);
  return notes.filter((note) => {
    if (filters.folder !== ALL && (note.list_name || GENERAL) !== filters.folder) {
      return false;
    }
    if (filters.category !== ALL_CATEGORIES && categoryOf(note) !== filters.category) {
      return false;
    }
    if (words.length > 0) {
      const text = normalizeForSearch(note.content ?? "");
      return words.every((w) => text.includes(w));
    }
    return true;
  });
}

// A search or a category is narrowing the list (the folder is its own tab).
export function hasActiveFilters(filters: NoteFilters): boolean {
  return filters.query.trim() !== "" || filters.category !== ALL_CATEGORIES;
}
