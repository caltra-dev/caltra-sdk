import { ModelControls, ModelControlsProvider } from "../demo/model-controls.js";
import { italian, type ThreadLocale } from "@caltra/react/ui/thread";
import type { CaltraClient, CaltraSession } from "@caltra/client";
import { CaltraChat, type CaltraReasoningDisplay } from "@caltra/react/ui";
import { createCaltraTheme, type CaltraColorMode, type CaltraThemeName } from "@caltra/react/themes";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const brandTheme = createCaltraTheme({
  name: "brand", radius: "0.75rem",
  light: { background: "#fffaf5", muted: "#ffedd5", accent: "#9a3412", accentForeground: "#ffffff", border: "#fed7aa" },
  dark: { background: "#1c1410", muted: "#352319", accent: "#fdba74", accentForeground: "#431407", border: "#6b4530" },
});

const nativeComponents = { ComposerControls: ModelControls };

/** The demo consumes the packaged chat unchanged; customization is a live prop update. */
export function Chat({ client, session, localStub }: { client: CaltraClient; session: CaltraSession; localStub: boolean }) {
  const runtime = useMemo(() => client.createSessionRuntime({ sessionId: session.id }), [client, session.id]);
  useEffect(() => {
    void runtime.start().catch(() => undefined);
    return () => { void runtime.stop(); };
  }, [runtime]);
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const [reasoningDisplay, setReasoningDisplay] = useState<CaltraReasoningDisplay>("auto");
  const [theme, setTheme] = useState<CaltraThemeName | "brand">("assistant-ui");
  const [colorMode, setColorMode] = useState<CaltraColorMode>("system");
  const [language, setLanguage] = useState<ThreadLocale>("en");
  const streamThinking = () => {
    if (localStub) void runtime.send("/think Thinking demo complete").catch(() => undefined);
  };
  return <ModelControlsProvider client={client} runtime={runtime} snapshot={snapshot}><main className="chat-shell">
    <header className="chat-header" data-success-toast-anchor>
      <div data-success-toast-avoid><span className="eyebrow">CALTRA REACT SDK</span><h1>{session.agent.name}</h1></div>
      <div className="demo-controls" data-success-toast-avoid>
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
          disabled={!localStub || snapshot.isRunning || snapshot.connection !== "connected"}
          aria-describedby="thinking-demo-help"
          onClick={() => { void streamThinking(); }}>Stream thinking</button>
        <p id="thinking-demo-help" className="demo-thinking-hint">{localStub
          ? <>Streams a simulated reasoning summary. Auto opens while thinking and collapses when finished.</>
          : <>Choose Local stub in Connection to use the thinking test. On the real API, a Reasoning row appears only when the model returns reasoning; display settings cannot enable it.</>}</p>
      </div>
    </header>
    <CaltraChat runtime={runtime} autoFocus={false} reasoningDisplay={reasoningDisplay} locale={language}
      components={nativeComponents} labels={language === "it" ? italian : undefined}
      theme={theme === "brand" ? brandTheme : theme} colorMode={colorMode} />
  </main></ModelControlsProvider>;
}
