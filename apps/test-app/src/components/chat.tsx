import type { CaltraClient, CaltraSession } from "@caltra/client";
import { CaltraChat, type CaltraChatLabels } from "@caltra/react/ui";
import "@caltra/react/styles.css";
import { useState } from "react";

const italian: CaltraChatLabels = {
  chat: "Conversazione", welcomeTitle: "Come posso aiutarti oggi?", welcomeDescription: "",
  placeholder: "Scrivi un messaggio…", messageInput: "Messaggio", send: "Invia messaggio",
  copy: "Copia", copied: "Copiato", scrollToBottom: "Vai in fondo", loading: "Caricamento conversazione…",
  connecting: "Connessione in corso…", recovering: "Riconnessione in corso. La conversazione è ancora qui.",
  connectionFailed: "Impossibile connettersi alla conversazione. Riprova.", retry: "Riprova",
  messageFailed: "Non è stato possibile completare il messaggio.", assistant: "Assistente", user: "Tu",
};

/** The demo consumes the packaged chat unchanged; customization is a live prop update. */
export function Chat({ client, session }: { client: CaltraClient; session: CaltraSession }) {
  const [customized, setCustomized] = useState(false);
  return <main className="chat-shell">
    <header className="chat-header" data-success-toast-anchor>
      <div data-success-toast-avoid><span className="eyebrow">CALTRA REACT SDK</span><h1>{session.agent.name}</h1></div>
      <label className="demo-appearance" data-success-toast-avoid>
        Appearance
        <select value={customized ? "custom" : "default"} onChange={(event) => setCustomized(event.target.value === "custom")}>
          <option value="default">Default styling</option><option value="custom">Custom theme · Italiano</option>
        </select>
      </label>
    </header>
    <CaltraChat client={client} sessionId={session.id} labels={customized ? italian : undefined}
      style={customized ? { "--caltra-accent": "#1d4ed8", "--caltra-background": "#f8fbff", "--caltra-muted": "#e8effb", "--caltra-radius": "0.75rem" } : undefined} />
  </main>;
}
