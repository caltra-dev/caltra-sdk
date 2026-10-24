import { AssistantRuntimeProvider, RuntimeAdapterProvider } from "@assistant-ui/react";
import { ModelControls } from "../demo/model-controls.js";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import { italian } from "../demo/italian-labels.js";
import type { ThreadLocale } from "../upstream/lib/thread-i18n.js";
import { SignalThread } from "../demo/signal-thread.js";
import "../demo/standard-thread.css";
import type { CaltraClient, CaltraSession } from "@caltra/client";
import { CaltraChat, type CaltraReasoningDisplay } from "@caltra/react/ui";
import { caltraThemes, createCaltraTheme, type CaltraColorMode, type CaltraThemeName } from "@caltra/react/themes";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";



declare const __CALTRA_LOCAL_STUB__: boolean;

const brandTheme = createCaltraTheme({
  name: "brand", radius: "0.75rem",
  light: { background: "#fffaf5", muted: "#ffedd5", accent: "#9a3412", accentForeground: "#ffffff", border: "#fed7aa" },
  dark: { background: "#1c1410", muted: "#352319", accent: "#fdba74", accentForeground: "#431407", border: "#6b4530" },
});

/** The demo consumes the packaged chat unchanged; customization is a live prop update. */
export function Chat({ client, session }: { client: CaltraClient; session: CaltraSession }) {
  const runtime = useMemo(() => client.createSessionRuntime({ sessionId: session.id }), [client, session.id]);
  useEffect(() => {
    void runtime.start().catch(() => undefined);
    return () => { void runtime.stop(); };
  }, [runtime]);
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const assistantRuntime = useAssistantUiRuntime(runtime);
  const [view, setView] = useState("caltra");
  const sharedAdapters = useMemo(() => ({ modelContext: { getModelContext: () => assistantRuntime.thread.getModelContext() } }), [assistantRuntime]);
  const [reasoningDisplay, setReasoningDisplay] = useState<CaltraReasoningDisplay>("auto");
  const [theme, setTheme] = useState<CaltraThemeName | "brand">("assistant-ui");
  const [colorMode, setColorMode] = useState<CaltraColorMode>("system");
  const [language, setLanguage] = useState<ThreadLocale>("en");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const dark = colorMode === "dark" || (colorMode === "system" && systemDark);
  const selectedTheme = theme === "brand" ? brandTheme : caltraThemes[theme];
  const palette = selectedTheme[dark ? "dark" : "light"];
  const threadStyle = {
    "--background": palette.background, "--foreground": palette.foreground,
    "--muted": palette.muted, "--muted-foreground": palette.mutedForeground,
    "--primary": palette.accent, "--primary-foreground": palette.accentForeground,
    "--accent": palette.muted, "--accent-foreground": palette.foreground,
    "--secondary": palette.muted, "--secondary-foreground": palette.foreground,
    "--border": palette.border, "--input": palette.border, "--ring": palette.accent,
    "--popover": palette.background, "--popover-foreground": palette.foreground,
    "--card": palette.background, "--card-foreground": palette.foreground,
    "--destructive": palette.error, "--radius": selectedTheme.radius,
    fontFamily: selectedTheme.fontFamily, colorScheme: dark ? "dark" : "light",
  } as CSSProperties;
  const streamThinking = () => {
    if (__CALTRA_LOCAL_STUB__) assistantRuntime.thread.append("/think Thinking demo complete");
  };
  return <AssistantRuntimeProvider runtime={assistantRuntime}><main className="chat-shell">
    <header className="chat-header" data-success-toast-anchor>
      <div data-success-toast-avoid><span className="eyebrow">CALTRA REACT SDK</span><h1>{session.agent.name}</h1></div>
      <div className="demo-controls" data-success-toast-avoid>
        <ModelControls client={client} runtime={runtime} snapshot={snapshot} />
        <label className="demo-appearance">Chat view
          <select aria-label="Chat view" value={view} onChange={event => setView(event.target.value)}>
            <option value="caltra">CaltraChat</option><option value="standard">Standard Thread</option>
          </select>
        </label>
        <label className="demo-appearance">Thinking display
          <select aria-label="Thinking display" value={reasoningDisplay} onChange={event => setReasoningDisplay(event.target.value as CaltraReasoningDisplay)}>
            <option value="hidden">Hidden</option><option value="auto">Auto</option><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option>
          </select>
        </label>
        <label className="demo-appearance">Theme
          <select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value as CaltraThemeName | "brand")}>
            <option value="assistant-ui">Assistant UI</option><option value="ocean">Ocean</option><option value="brand">Custom brand</option>
          </select>
        </label>
        <label className="demo-appearance">Color mode
          <select aria-label="Color mode" value={colorMode} onChange={(event) => setColorMode(event.target.value as CaltraColorMode)}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
        <label className="demo-appearance">Language
          <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value as ThreadLocale)}>
            <option value="en">English</option><option value="it">Italiano</option>
          </select>
        </label>
        <button className="demo-thinking-button" type="button"
          disabled={!__CALTRA_LOCAL_STUB__ || snapshot.isRunning || snapshot.connection !== "connected"}
          aria-describedby="thinking-demo-help"
          onClick={() => { void streamThinking(); }}>Stream thinking</button>
        <p id="thinking-demo-help" className="demo-thinking-hint">{__CALTRA_LOCAL_STUB__
          ? <>Streams a simulated reasoning summary. Auto opens while thinking and collapses when finished.</>
          : <>The thinking test requires <code>npm run demo --local-stub</code>. On the real API, a Reasoning row appears only when the model returns reasoning; display settings cannot enable it.</>}</p>
        {view === "standard" && snapshot.error && <p className="demo-thinking-hint" role="alert">{snapshot.connection === "recovering" || snapshot.connection === "connecting"
          ? "Connection interrupted. Reconnecting…"
          : snapshot.connection === "failed" ? <>Connection unavailable. <button type="button" onClick={() => { void runtime.reconnect().catch(() => undefined); }}>Retry</button></>
          : "Could not complete the request. Check the selection and try again."}</p>}
      </div>
    </header>
    {view === "standard" ? <div lang={language} className={`signal-thread${dark ? " dark" : ""}`} style={threadStyle}>
      <SignalThread runtime={assistantRuntime} session={runtime} display={reasoningDisplay} locale={language} />
    </div> : <RuntimeAdapterProvider adapters={sharedAdapters}><CaltraChat reasoningDisplay={reasoningDisplay} runtime={runtime} labels={language === "it" ? italian : undefined}
      theme={theme === "brand" ? brandTheme : theme} colorMode={colorMode} /></RuntimeAdapterProvider>}
  </main></AssistantRuntimeProvider>;
}
