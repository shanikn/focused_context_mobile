import AsyncStorage from "@react-native-async-storage/async-storage";

const LISTS_KEY = "focusedcontext.customLists";

export async function getCustomLists(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(LISTS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => String(item).trim())
      .filter((item) => item && item !== "All" && item !== "General");
  } catch {
    return [];
  }
}

export async function saveCustomLists(listNames: string[]): Promise<void> {
  const normalized = [...new Set(
    listNames
      .map((item) => item.trim())
      .filter((item) => item && item !== "All" && item !== "General")
  )].sort((a, b) => a.localeCompare(b));

  await AsyncStorage.setItem(LISTS_KEY, JSON.stringify(normalized));
}

export async function addCustomList(listName: string): Promise<string[]> {
  const current = await getCustomLists();
  const next = [...current, listName];
  await saveCustomLists(next);
  return getCustomLists();
}

export async function removeCustomList(listName: string): Promise<string[]> {
  const current = await getCustomLists();
  const next = current.filter((item) => item !== listName);
  await saveCustomLists(next);
  return next;
}
