import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, useColorScheme } from "react-native";
import { makeTheme, Theme } from "./theme";
import {
  AppearancePref,
  getAppearance,
  nativeColorScheme,
  resolveScheme,
  setAppearance,
} from "./lib/appearance";

interface ThemeContextValue extends Theme {
  appearance: AppearancePref;
  setAppearancePref: (pref: AppearancePref) => Promise<void>;
}

// Without a provider (e.g. in a component test) everything is light.
const ThemeContext = createContext<ThemeContextValue>({
  ...makeTheme("light"),
  appearance: "system",
  setAppearancePref: async () => {},
});

// The phone's own setting, which Appearance.setColorScheme overrides while
// Light or Dark is chosen; remember it for "System".
function useSystemScheme(): string | null | undefined {
  return useColorScheme();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemScheme();
  const [appearance, setAppearanceState] = useState<AppearancePref>("system");

  useEffect(() => {
    getAppearance()
      .then((pref) => {
        setAppearanceState(pref);
        Appearance.setColorScheme?.(nativeColorScheme(pref));
      })
      .catch(() => {});
  }, []);

  const setAppearancePref = useCallback(async (pref: AppearancePref) => {
    setAppearanceState(pref);
    // Android's own UI in the app (date/time pickers, alerts) follows this
    Appearance.setColorScheme?.(nativeColorScheme(pref));
    await setAppearance(pref);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ ...makeTheme(resolveScheme(appearance, systemScheme)), appearance, setAppearancePref }),
    [appearance, systemScheme, setAppearancePref]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Build a component's StyleSheet for the active theme (rebuilt only when the
// theme changes).
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme.scheme]); // eslint-disable-line react-hooks/exhaustive-deps
}
