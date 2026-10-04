// Order of note folders (lists) everywhere they're shown: General first,
// then the other folders alphabetically. The notes list adds "All" in front.

export const GENERAL = "General";
export const ALL = "All";

export function folderNames(
  notes: { list_name?: string | null }[],
  customLists: string[]
): string[] {
  const others = new Set<string>();
  for (const name of [...notes.map((n) => n.list_name || GENERAL), ...customLists]) {
    if (name && name !== GENERAL && name !== ALL) {
      others.add(name);
    }
  }
  return [GENERAL, ...[...others].sort()];
}

export function folderTabs(notes: { list_name?: string | null }[], customLists: string[]): string[] {
  return [ALL, ...folderNames(notes, customLists)];
}
