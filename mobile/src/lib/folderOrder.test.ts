import { folderNames, folderTabs, GENERAL } from "./folderOrder";

const note = (list_name?: string) => ({ list_name }) as { list_name?: string };

test("General comes first, the other folders keep their alphabetical order", () => {
  expect(folderNames([note("Shopping"), note("Games"), note("General"), note("Uni")], [])).toEqual([
    GENERAL,
    "Games",
    "Shopping",
    "Uni",
  ]);
});

test("notes without a folder count as General", () => {
  expect(folderNames([note(undefined), note(""), note("Games")], [])).toEqual([GENERAL, "Games"]);
});

test("custom (empty) folders are included and de-duplicated", () => {
  expect(folderNames([note("Games")], ["Ideas", "Games"])).toEqual([GENERAL, "Games", "Ideas"]);
});

test("General is always there, even with no notes", () => {
  expect(folderNames([], [])).toEqual([GENERAL]);
});

test("notes list tabs: All, then General right after it, then the rest", () => {
  expect(folderTabs([note("Games"), note("General"), note("Work")], [])).toEqual([
    "All",
    GENERAL,
    "Games",
    "Work",
  ]);
});
