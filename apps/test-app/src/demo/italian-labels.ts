import type { CaltraChatLabels } from "@caltra/react/ui";

export const italian = {
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
} satisfies CaltraChatLabels;
