import type { CaltraClient, CaltraSession } from "@caltra/client";
import { CaltraChat, type CaltraReasoningDisplay, type CaltraChatLabels } from "@caltra/react/ui";
import { createCaltraTheme, type CaltraColorMode, type CaltraThemeName } from "@caltra/react/themes";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

const italian: CaltraChatLabels = {
  thinking: "Ragionamento…", thought: "Ragionamento", reasoningLoading: "Caricamento ragionamento…", reasoningFailed: "Impossibile caricare il ragionamento.",
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
  const [sendingThinking, setSendingThinking] = useState(false);
  const [thinkingError, setThinkingError] = useState(false);
  const [reasoningDisplay, setReasoningDisplay] = useState<CaltraReasoningDisplay>("auto");
  const [theme, setTheme] = useState<CaltraThemeName | "brand">("assistant-ui");
  const [colorMode, setColorMode] = useState<CaltraColorMode>("system");
  const [language, setLanguage] = useState("en");
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
          <select aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}>
            <option value="en">English</option><option value="it">Italiano</option>
          </select>
        </label>
        <button className="demo-thinking-button" type="button"
          disabled={sendingThinking || snapshot.isRunning || snapshot.connection !== "connected"}
          onClick={() => { void streamThinking(); }}>Stream thinking</button>
        <p className="demo-thinking-hint">Sends <code>/think</code> to the local deterministic model. Choose Auto or Expanded to watch the text stream.</p>
        {thinkingError && <p className="demo-thinking-hint" role="alert">Could not start thinking. Try again.</p>}
      </div>
    </header>
    <CaltraChat reasoningDisplay={reasoningDisplay} runtime={runtime} labels={language === "it" ? italian : undefined}
      theme={theme === "brand" ? brandTheme : theme} colorMode={colorMode} />
  </main>;
}
