/** Only these non-secret settings may be embedded in the browser bundle. */
export function demoConnectionSettings(environment: Record<string, string | undefined>) {
  const key = environment.npm_config_caltra_api_key ?? environment.npm_config_api_key ?? environment.CALTRA_API_KEY;
  const realApiAvailable = environment.CALTRA_DEMO_MODE !== "stub" && Boolean(key);
  if (environment.CALTRA_DEMO_MODE === "real" && !key) throw new Error("Real API mode requires CALTRA_API_KEY.");
  return { realApiAvailable, defaultConnection: realApiAvailable ? "real" : "stub" } as const;
}
