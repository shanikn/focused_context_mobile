import { getFolderSelection, setFolderSelection } from "./folderSelection";

beforeEach(() => setFolderSelection([]));

test("nothing checked at first", () => {
  expect(getFolderSelection()).toEqual([]);
});

test("remembers the checked folders while the app runs", () => {
  setFolderSelection(["Uni", "Games"]);
  expect(getFolderSelection()).toEqual(["Uni", "Games"]);
});

test("callers can't change the remembered list by accident", () => {
  setFolderSelection(["Uni"]);
  getFolderSelection().push("Games");
  expect(getFolderSelection()).toEqual(["Uni"]);
});
