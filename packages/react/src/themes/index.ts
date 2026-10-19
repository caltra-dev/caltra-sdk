export type CaltraColorMode = "system" | "light" | "dark";

export interface CaltraThemeColors {
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  error: string;
}

export interface CaltraTheme {
  readonly name: string;
  readonly light: Readonly<CaltraThemeColors>;
  readonly dark: Readonly<CaltraThemeColors>;
  readonly radius: string;
  readonly fontFamily: string;
  readonly contentWidth: string;
}

export interface CaltraThemeOverrides {
  name?: string;
  light?: Partial<CaltraThemeColors>;
  dark?: Partial<CaltraThemeColors>;
  radius?: string;
  fontFamily?: string;
  contentWidth?: string;
}

const assistantUi: CaltraTheme = Object.freeze({
  name: "assistant-ui",
  light: Object.freeze({ background: "#ffffff", foreground: "#18181b", muted: "#f4f4f5", mutedForeground: "#71717a", accent: "#18181b", accentForeground: "#fafafa", border: "#e4e4e7", error: "#b42318" }),
  dark: Object.freeze({ background: "#09090b", foreground: "#fafafa", muted: "#27272a", mutedForeground: "#a1a1aa", accent: "#fafafa", accentForeground: "#18181b", border: "#3f3f46", error: "#fda29b" }),
  radius: "1rem",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  contentWidth: "44rem",
});

/** Create a complete theme without mutating its base; omitted values inherit per mode. */
export function createCaltraTheme(overrides: CaltraThemeOverrides, base: CaltraTheme = assistantUi): CaltraTheme {
  return Object.freeze({
    ...base, ...overrides,
    light: Object.freeze({ ...base.light, ...overrides.light }),
    dark: Object.freeze({ ...base.dark, ...overrides.dark }),
  });
}

/** Presets contain no CSS imports or browser-dependent state. */
export const caltraThemes = Object.freeze({
  "assistant-ui": assistantUi,
  ocean: createCaltraTheme({
    name: "ocean",
    light: { background: "#f8fafc", foreground: "#0f172a", muted: "#e2e8f0", mutedForeground: "#475569", accent: "#0369a1", accentForeground: "#ffffff", border: "#cbd5e1" },
    dark: { background: "#0f172a", foreground: "#f1f5f9", muted: "#1e293b", mutedForeground: "#94a3b8", accent: "#7dd3fc", accentForeground: "#082f49", border: "#475569" },
  }),
});

export type CaltraThemeName = keyof typeof caltraThemes;
