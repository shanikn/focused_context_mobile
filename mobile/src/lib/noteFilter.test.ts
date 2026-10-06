import { filterNotes, hasActiveFilters, normalizeForSearch } from "./noteFilter";
import { Note } from "../types/notes";

let n = 0;
function note(content: string, fields: Partial<Note> = {}): Note {
  n += 1;
  return { _id: `n${n}`, content, category: "todo", list_name: "General", contexts: [], ...fields } as Note;
}

const buyMilk = note("Buy MILK and eggs", { category: "errand" });
const exam = note("Prepare for the Computer Networks exam", { category: "event", list_name: "Uni" });
const hebrew = note("לקנות חלב ולחם", { category: "errand", list_name: "Home" });
const niqqud = note("לִקְנוֹת פֵּרוֹת", { category: "errand" });
const idea = note("App idea: smart notes", { category: "idea" });
const noFolder = note("call mom", { category: "reminder", list_name: "" });
const unknownCategory = note("something odd", { category: "weird" });
const ALL_NOTES = [buyMilk, exam, hebrew, niqqud, idea, noFolder, unknownCategory];

const ids = (notes: Note[]) => notes.map((x) => x._id);
const all = { folder: "All", categories: [] as string[], query: "" };

describe("normalizeForSearch", () => {
  test("lowercases, trims and collapses spaces", () => {
    expect(normalizeForSearch("  Buy   MILK ")).toBe("buy milk");
  });

  test("removes Hebrew vowel marks (niqqud) and invisible direction marks", () => {
    expect(normalizeForSearch("לִקְנוֹת")).toBe("לקנות");
    expect(normalizeForSearch("‏חלב‎")).toBe("חלב");
  });
});

describe("filterNotes", () => {
  test("no filters: everything, in the same order", () => {
    expect(ids(filterNotes(ALL_NOTES, all))).toEqual(ids(ALL_NOTES));
  });

  describe("search", () => {
    test("case-insensitive, anywhere in the text", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "milk" }))).toEqual([buyMilk._id]);
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "NETWORKS" }))).toEqual([exam._id]);
    });

    test("Hebrew, with or without vowel marks", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "חלב" }))).toEqual([hebrew._id]);
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "לקנות" }))).toEqual([hebrew._id, niqqud._id]);
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "לִקְנוֹת" }))).toEqual([hebrew._id, niqqud._id]);
    });

    test("every word must appear, in any order", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "eggs buy" }))).toEqual([buyMilk._id]);
      expect(ids(filterNotes(ALL_NOTES, { ...all, query: "buy exam" }))).toEqual([]);
    });

    test("only spaces counts as no search", () => {
      expect(filterNotes(ALL_NOTES, { ...all, query: "   " })).toHaveLength(ALL_NOTES.length);
    });
  });

  describe("categories", () => {
    test("none checked: every category", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, categories: [] }))).toEqual(ids(ALL_NOTES));
    });

    test("one checked: only notes of that kind", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, categories: ["errand"] }))).toEqual([
        buyMilk._id,
        hebrew._id,
        niqqud._id,
      ]);
    });

    test("several checked: notes of any of them, in the same order", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, categories: ["idea", "event"] }))).toEqual([exam._id, idea._id]);
    });

    test("old and unknown categories count as To-do", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, categories: ["todo"] }))).toEqual([noFolder._id, unknownCategory._id]);
    });
  });

  describe("folder (one tab)", () => {
    test("All: every folder", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, folder: "All" }))).toEqual(ids(ALL_NOTES));
    });

    test("only notes in that folder; no folder counts as General", () => {
      expect(ids(filterNotes(ALL_NOTES, { ...all, folder: "Uni" }))).toEqual([exam._id]);
      expect(ids(filterNotes(ALL_NOTES, { ...all, folder: "General" }))).toEqual([
        buyMilk._id,
        niqqud._id,
        idea._id,
        noFolder._id,
        unknownCategory._id,
      ]);
    });
  });

  test("the folder AND one of the checked categories AND the search", () => {
    expect(ids(filterNotes(ALL_NOTES, { folder: "Home", categories: ["errand"], query: "חלב" }))).toEqual([hebrew._id]);
    expect(ids(filterNotes(ALL_NOTES, { folder: "General", categories: ["errand", "idea"], query: "" }))).toEqual([
      buyMilk._id,
      niqqud._id,
      idea._id,
    ]);
    expect(filterNotes(ALL_NOTES, { folder: "Uni", categories: ["errand"], query: "" })).toEqual([]);
  });
});

test("hasActiveFilters: a search or checked categories (the folder is its own tab)", () => {
  expect(hasActiveFilters({ ...all })).toBe(false);
  expect(hasActiveFilters({ ...all, query: "  " })).toBe(false);
  expect(hasActiveFilters({ ...all, query: "milk" })).toBe(true);
  expect(hasActiveFilters({ ...all, categories: ["idea"] })).toBe(true);
  expect(hasActiveFilters({ ...all, folder: "Uni" })).toBe(false);
});
