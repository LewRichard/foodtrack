import { describe, expect, it } from "vitest";
import { isThemePref, resolveTheme, THEME_PREFS } from "../src/lib/theme.ts";

describe("theme", () => {
  it("accepts only known choices", () => {
    expect(THEME_PREFS.every(isThemePref)).toBe(true);
    expect(isThemePref("blue")).toBe(false);
    expect(isThemePref(undefined)).toBe(false);
  });

  it("uses the chosen theme, and light when the device can't say", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("system")).toBe("light"); // no matchMedia in tests
  });
});
