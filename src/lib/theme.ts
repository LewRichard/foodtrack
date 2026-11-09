// Light/dark appearance. "system" follows the phone's setting and updates when it changes.
// index.html sets the same attribute before the app loads, so there's no flash of the wrong theme.

export type ThemePref = "system" | "light" | "dark";
export const THEME_PREFS: ThemePref[] = ["system", "light", "dark"];

export function isThemePref(value: unknown): value is ThemePref {
  return value === "system" || value === "light" || value === "dark";
}

const darkQuery = () => (typeof window === "undefined" ? undefined : window.matchMedia?.("(prefers-color-scheme: dark)"));

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return darkQuery()?.matches ? "dark" : "light";
}

// Browser toolbar colour, matching each theme's background.
const BAR_COLORS = { light: "#f4f7f3", dark: "#0f1210" } as const;

function apply(pref: ThemePref) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLORS[theme]);
  void import("./native.ts").then(async ({ isNative }) => {
    if (!isNative) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = light text, for dark backgrounds.
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  }).catch(() => {});
}

/** Applies the preference now and, for "system", whenever the phone switches. Returns a cleanup. */
export function watchTheme(pref: ThemePref): () => void {
  apply(pref);
  const query = darkQuery();
  if (pref !== "system" || !query) return () => {};
  const onChange = () => apply(pref);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
