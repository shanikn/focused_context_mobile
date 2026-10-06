// The notes list's folder tab and the categories checked in its filter.
// Kept in memory, so they stay while the app is open and reset when it
// restarts.

let folderTab = "All";
let categories: string[] = [];

export function getFolderTab(): string {
  return folderTab;
}

export function setFolderTab(name: string): void {
  folderTab = name;
}

export function getCategorySelection(): string[] {
  return [...categories];
}

export function setCategorySelection(names: string[]): void {
  categories = [...names];
}
