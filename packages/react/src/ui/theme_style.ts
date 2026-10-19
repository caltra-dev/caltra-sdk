import type { CSSProperties } from "react";
import type { CaltraTheme, CaltraThemeColors } from "../themes/index.js";

export type CaltraChatStyle = CSSProperties & { [key: `--caltra-${string}`]: string | number };

const colorVariables: Record<keyof CaltraThemeColors, string> = {
  background: "background", foreground: "foreground", muted: "muted", mutedForeground: "muted-foreground",
  accent: "accent", accentForeground: "accent-foreground", border: "border", error: "error",
};

/** Both palettes reach CSS on the first render, including SSR, without a media-query effect. */
export function themeStyle(theme: CaltraTheme): CaltraChatStyle {
  const style: CaltraChatStyle = {
    "--caltra-theme-radius": theme.radius,
    "--caltra-theme-font-family": theme.fontFamily,
    "--caltra-theme-content-width": theme.contentWidth,
  };
  for (const mode of ["light", "dark"] as const) {
    for (const key of Object.keys(colorVariables) as Array<keyof CaltraThemeColors>) {
      style[`--caltra-theme-${mode}-${colorVariables[key]}`] = theme[mode][key];
    }
  }
  return style;
}
