import { createContext, useContext } from "react";
import { italian } from "../../italian-labels.js";

/** Presentation labels shared by the packaged Thread and demo; never translate protocol values. */
const italianThreadLabels = {
  "Loading conversation": "Caricamento conversazione…",
  "Voice conversation": "Conversazione vocale",
  "You said": "Hai detto",
  "Assistant said": "L’assistente ha detto",
  "Assistant is speaking": "L’assistente sta parlando",
  "Copy": italian.copy,
  "Loading earlier messages": "Caricamento messaggi precedenti…",
  "Load earlier messages": "Carica messaggi precedenti",
  "Scroll to bottom": italian.scrollToBottom,
  "How can I help you today?": italian.welcomeTitle,
  "Send a message...": italian.placeholder,
  "Message input": italian.messageInput,
  "Voice input": "Input vocale",
  "Start voice input": "Avvia input vocale",
  "Stop voice input": "Interrompi input vocale",
  "Stop dictation": "Interrompi dettatura",
  "Send message": italian.send,
  "Resume generating": "Riprendi generazione",
  "Cancel sending": "Annulla invio",
  "Stop generating": "Interrompi generazione",
  "Assistant is working": "L’assistente sta lavorando",
  "Helpful": "Utile",
  "Not helpful": "Non utile",
  "Edit": "Modifica",
  "Previous": "Precedente",
  "Next": "Successivo",
  "Cancel": "Annulla",
  "Update": "Aggiorna",
  "Reasoning": italian.thought,
  "Loading reasoning…": italian.reasoningLoading,
  "Could not load reasoning.": italian.reasoningFailed,
  "Try again": italian.retry,
  "Reply queued, not sent yet": "Risposta in coda, non ancora inviata",
  "Running tool": "Strumento in esecuzione",
  "Waiting on tool": "In attesa dello strumento",
  "Cancelled tool": "Strumento annullato",
  "Failed tool": "Strumento non riuscito",
  "Used tool": "Strumento usato",
  "Result:": "Risultato:",
  "Cancelled reason:": "Motivo dell’annullamento:",
  "Error:": "Errore:",
  "{count} tool call": "{count} chiamata a uno strumento",
  "{count} tool calls": "{count} chiamate agli strumenti",
  "Allow": "Consenti",
  "Always allow": "Consenti sempre",
  "Deny": "Nega",
  "Always deny": "Nega sempre",
  "Cancelled before a decision": "Annullato prima della decisione",
  "Expired before a decision": "Scaduto prima della decisione",
  "Answered": "Risposta inviata",
  "Allowed": "Consentito",
  "Dismissed": "Ignorato",
  "Denied": "Negato",
  "Answered automatically": "Risposta inviata automaticamente",
  "Allowed automatically": "Consentito automaticamente",
  "Dismissed automatically": "Ignorato automaticamente",
  "Denied automatically": "Negato automaticamente",
  "Or type an answer": "Oppure scrivi una risposta",
  "Type your answer": "Scrivi la tua risposta",
  "Send": "Invia",
  "Dismiss": "Ignora",
  "Confirm": "Conferma",
  "Back": "Indietro",
  "Answer": "Risposta",
  "Note": "Nota",
  "Add a note to your decision": "Aggiungi una nota alla decisione",
  "Image": "Immagine",
  "Document": "Documento",
  "File": "File",
  "Upload failed": "Caricamento non riuscito",
  "Add Attachment": "Aggiungi allegato",
  "Preview {name}": "Anteprima di {name}",
  "Preview of {name}": "Anteprima di {name}",
  "Remove {name}": "Rimuovi {name}",
  "{type} attachment {name}": "Allegato {type}: {name}",
  ", upload failed": ", caricamento non riuscito",
  ", uploading": ", caricamento in corso",
  "Close": "Chiudi",
  "Image content": "Contenuto dell’immagine",
  "Image preview": "Anteprima dell’immagine",
  "Click to zoom image": "Ingrandisci immagine",
  "Zoomed image": "Immagine ingrandita",
  "Close zoomed image": "Chiudi immagine ingrandita",
  "Generating image…": "Generazione immagine…",
  "Image could not be generated": "Impossibile generare l’immagine",
  "Regenerate image": "Rigenera immagine",
  "Download image": "Scarica immagine",
  "Copy image": "Copia immagine",
  "The provider blocked this image.": "Il fornitore ha bloccato questa immagine.",
  "(opens in a new tab)": "(si apre in una nuova scheda)",
  "Text file": "File di testo",
  "{type} file": "File {type}",
  "Unnamed file": "File senza nome",
  "Download {name}": "Scarica {name}",
  "Audio": "Audio",
  "Video": "Video",
  "Pause": "Pausa",
  "Play": "Riproduci",
  "Seek": "Posizione di riproduzione",
  "Can't play this audio": "Impossibile riprodurre questo audio",
} as const;
export type ThreadLocale = "en" | "it";
export type ThreadLabel = keyof typeof italianThreadLabels;
export type ThreadTranslator = (key: ThreadLabel, values?: Record<string, string | number>) => string;

function translator(locale: ThreadLocale): ThreadTranslator {
  return (key, values = {}) => {
    const template = locale === "it" ? italianThreadLabels[key] : key;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder);
  };
}
const translators = { en: translator("en"), it: translator("it") };
export const ThreadTextOverrides = createContext<Partial<Record<ThreadLabel, string>>>({});
const ThreadLocaleContext = createContext<ThreadLocale>("en");
export const ThreadLocaleProvider = ThreadLocaleContext.Provider;
export const useThreadText = (): ThreadTranslator => {
  const locale = useContext(ThreadLocaleContext);
  const overrides = useContext(ThreadTextOverrides);
  return (key, values = {}) => (overrides[key] ?? translators[locale](key, values)).replace(/\{(\w+)\}/g,
    (placeholder, name: string) => Object.hasOwn(values, name) ? String(values[name]) : placeholder);
};
