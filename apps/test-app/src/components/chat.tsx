import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import { Thread } from "../upstream/components/assistant-ui/elements/thread.aui.js";
import "../demo/standard-thread.css";
import type { CaltraClient, CaltraSession } from "@caltra/client";
import { CaltraChat, type CaltraReasoningDisplay, type CaltraChatLabels } from "@caltra/react/ui";
import { caltraThemes, createCaltraTheme, type CaltraColorMode, type CaltraThemeName } from "@caltra/react/themes";
import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";

const italian: CaltraChatLabels = {
  thinking: "Ragionamento…", thought: "Ragionamento", reasoningLoading: "Caricamento ragionamento…", reasoningFailed: "Impossibile caricare il ragionamento.",
  olderLoading: "Caricamento messaggi precedenti…", olderFailed: "Impossibile caricare i messaggi precedenti. Riprova.",
  chat: "Conversazione", welcomeTitle: "Come posso aiutarti oggi?", welcomeDescription: "",
  placeholder: "Scrivi un messaggio…", messageInput: "Messaggio", send: "Invia messaggio",
  copy: "Copia", copied: "Copiato", scrollToBottom: "Vai in fondo", loading: "Caricamento conversazione…",
  connecting: "Connessione in corso…", recovering: "Riconnessione in corso. La conversazione è ancora qui.",
  connectionFailed: "Impossibile connettersi alla conversazione. Riprova.", retry: "Riprova",
  messageFailed: "Non è stato possibile completare il messaggio.", assistant: "Assistente", user: "Tu",
  toolRunning: "In esecuzione…", toolCompleted: "Completato", toolFailed: "Non riuscito",
  toolArguments: "Argomenti", toolResult: "Risultato", toolError: "Errore",
};

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
  const [sendingThinking, setSendingThinking] = useState(false);
  const [thinkingError, setThinkingError] = useState(false);
  const [reasoningDisplay, setReasoningDisplay] = useState<CaltraReasoningDisplay>("auto");
  const [theme, setTheme] = useState<CaltraThemeName | "brand">("assistant-ui");
  const [colorMode, setColorMode] = useState<CaltraColorMode>("system");
  const [language, setLanguage] = useState("en");
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
  const streamThinking = async () => {
    setSendingThinking(true);
    setThinkingError(false);
    try { await runtime.send("/think Thinking demo complete"); }
    catch { setThinkingError(true); }
    finally { setSendingThinking(false); }
  };
  return <main className="chat-shell">
    <header className="chat-header" data-success-toast-anchor>
      <div data-success-toast-avoid><span className="eyebrow">CALTRA REACT SDK</span><h1>{session.agent.name}</h1></div>
      <div className="demo-controls" data-success-toast-avoid>
        <label className="demo-appearance">Chat view
          <select aria-label="Chat view" value={view} onChange={event => setView(event.target.value)}>
            <option value="caltra">CaltraChat</option><option value="standard">Standard Thread</option>
          </select>
        </label>
        <label className="demo-appearance">Thinking display
          <select disabled={view === "standard"} aria-describedby={view === "standard" ? "thread-settings-limit" : undefined} aria-label="Thinking display" value={reasoningDisplay} onChange={event => setReasoningDisplay(event.target.value as CaltraReasoningDisplay)}>
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
          <select disabled={view === "standard"} aria-describedby={view === "standard" ? "thread-settings-limit" : undefined} aria-label="Language" value={view === "standard" ? "en" : language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">English</option><option value="it">Italiano</option>
          </select>
        </label>
        <button className="demo-thinking-button" type="button"
          disabled={sendingThinking || snapshot.isRunning || snapshot.connection !== "connected"}
          onClick={() => { void streamThinking(); }}>Stream thinking</button>
        <p className="demo-thinking-hint">Requires the local deterministic Caltra model; the API stub does not simulate reasoning. Sends <code>/think</code>.</p>
        {view === "standard" && <p className="demo-thinking-hint" id="thread-settings-limit">Standard Thread: English only. Thinking display is unavailable for Caltra’s separately loaded reasoning.</p>}
        {thinkingError && <p className="demo-thinking-hint" role="alert">Could not start thinking. Try again.</p>}
      </div>
    </header>
    {view === "standard" ? <div className={`signal-thread${dark ? " dark" : ""}`} style={threadStyle}>
      <AssistantRuntimeProvider runtime={assistantRuntime}><Thread autoFocus={false} /></AssistantRuntimeProvider>
    </div> : <CaltraChat reasoningDisplay={reasoningDisplay} runtime={runtime} labels={language === "it" ? italian : undefined}
      theme={theme === "brand" ? brandTheme : theme} colorMode={colorMode} />}
  </main>;
}
