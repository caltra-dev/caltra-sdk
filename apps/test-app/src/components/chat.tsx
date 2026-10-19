import type { CaltraClient, CaltraSession } from "@caltra/client";
import { CaltraChat, type CaltraChatLabels } from "@caltra/react/ui";
import { createCaltraTheme, type CaltraColorMode, type CaltraThemeName } from "@caltra/react/themes";
import { useState } from "react";

const italian: CaltraChatLabels = {
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
  const [theme, setTheme] = useState<CaltraThemeName | "brand">("assistant-ui");
  const [colorMode, setColorMode] = useState<CaltraColorMode>("system");
  const [language, setLanguage] = useState("en");
  return <main className="chat-shell">
    <header className="chat-header" data-success-toast-anchor>
      <div data-success-toast-avoid><span className="eyebrow">CALTRA REACT SDK</span><h1>{session.agent.name}</h1></div>
      <div className="demo-controls" data-success-toast-avoid>
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
      </div>
    </header>
    <CaltraChat client={client} sessionId={session.id} labels={language === "it" ? italian : undefined}
      theme={theme === "brand" ? brandTheme : theme} colorMode={colorMode} />
  </main>;
}
