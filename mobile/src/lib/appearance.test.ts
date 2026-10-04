import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  APPEARANCE_OPTIONS,
  getAppearance,
  nativeColorScheme,
  resolveScheme,
  setAppearance,
} from "./appearance";
import { darkColors, lightColors, makeTheme } from "../theme";
import { contrastRatio } from "./categoryColors";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("resolveScheme (which palette to use)", () => {
  test("System follows the phone", () => {
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
  });

  test("System with no answer from the phone: light", () => {
    expect(resolveScheme("system", null)).toBe("light");
    expect(resolveScheme("system", undefined)).toBe("light");
  });

  test("Light and Dark ignore the phone", () => {
    expect(resolveScheme("light", "dark")).toBe("light");
    expect(resolveScheme("dark", "light")).toBe("dark");
  });
});

test("nativeColorScheme: what to tell Android/iOS (null = follow the system)", () => {
  expect(nativeColorScheme("system")).toBeNull();
  expect(nativeColorScheme("light")).toBe("light");
  expect(nativeColorScheme("dark")).toBe("dark");
});

describe("the Appearance setting on the phone", () => {
  test("options in order, default System", async () => {
    expect(APPEARANCE_OPTIONS).toEqual(["system", "light", "dark"]);
    expect(await getAppearance()).toBe("system");
  });

  test("saved and read back", async () => {
    await setAppearance("dark");
    expect(await getAppearance()).toBe("dark");
    expect(await AsyncStorage.getItem("focusedcontext.appearance")).toBe("dark");
  });

  test("anything else stored counts as System", async () => {
    await AsyncStorage.setItem("focusedcontext.appearance", "sepia");
    expect(await getAppearance()).toBe("system");
  });

  test("an invalid value isn't saved", async () => {
    await expect(setAppearance("sepia" as never)).rejects.toThrow();
    expect(await getAppearance()).toBe("system");
  });
});

describe("palettes", () => {
  test("light and dark have the same color names", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  test.each([
    ["light", lightColors],
    ["dark", darkColors],
  ])("%s palette has readable contrast", (_name, c) => {
    expect(contrastRatio(c.text, c.background)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(c.text, c.surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(c.textMuted, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.textMuted, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.primaryDark, c.primarySoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.primaryDark, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.text, c.chip)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.danger, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  test("the dark primary is a lighter green that stands out on dark backgrounds", () => {
    expect(darkColors.primary).not.toBe(lightColors.primary);
    expect(contrastRatio(darkColors.primary, darkColors.background)).toBeGreaterThanOrEqual(4.5);
  });

  test("makeTheme: text presets use that palette's colors", () => {
    const dark = makeTheme("dark");
    expect(dark.dark).toBe(true);
    expect(dark.colors).toBe(darkColors);
    expect(dark.type.body.color).toBe(darkColors.text);
    expect(dark.type.caption.color).toBe(darkColors.textMuted);
    expect(makeTheme("light").type.body.color).toBe(lightColors.text);
  });
});
