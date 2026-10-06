// The folders checked in the notes list's folder filter. Kept in memory, so
// the choice stays while the app is open and resets when it restarts.

let selection: string[] = [];

export function getFolderSelection(): string[] {
  return [...selection];
}

export function setFolderSelection(names: string[]): void {
  selection = [...names];
}
