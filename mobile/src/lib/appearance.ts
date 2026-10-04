import AsyncStorage from "@react-native-async-storage/async-storage";
import { ColorScheme } from "../theme";

// The Appearance setting (System / Light / Dark), saved on this phone.

export const APPEARANCE_OPTIONS = ["system", "light", "dark"] as const;
export type AppearancePref = (typeof APPEARANCE_OPTIONS)[number];

const KEY = "focusedcontext.appearance";

function isPref(value: unknown): value is AppearancePref {
  return typeof value === "string" && (APPEARANCE_OPTIONS as readonly string[]).includes(value);
}

export async function getAppearance(): Promise<AppearancePref> {
  const value = await AsyncStorage.getItem(KEY);
  return isPref(value) ? value : "system";
}

export async function setAppearance(pref: AppearancePref): Promise<void> {
  if (!isPref(pref)) {
    throw new Error(`appearance must be one of ${APPEARANCE_OPTIONS.join(", ")}`);
  }
  await AsyncStorage.setItem(KEY, pref);
}

// Which palette to use; "system" follows the phone (light if it doesn't say).
export function resolveScheme(
  pref: AppearancePref,
  systemScheme: string | null | undefined
): ColorScheme {
  if (pref === "light" || pref === "dark") {
    return pref;
  }
  return systemScheme === "dark" ? "dark" : "light";
}

// What to pass to Appearance.setColorScheme: null lets the OS decide again.
// Setting it makes Android's own UI in the app (date/time pickers, alerts)
// follow the choice too.
export function nativeColorScheme(pref: AppearancePref): ColorScheme | null {
  return pref === "system" ? null : pref;
}
