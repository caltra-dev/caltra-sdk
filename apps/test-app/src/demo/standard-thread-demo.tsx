import { useEffect, useState } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { CaltraClient, type CaltraSession, type CaltraSessionRuntime } from "@caltra/client";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import { CaltraChat } from "@caltra/react/ui";
import { Thread } from "../upstream/components/assistant-ui/elements/thread.aui.js";
import { Button } from "../upstream/components/ui/button.js";
import { TestAppAuthorizationCodeProvider } from "../authorization_code_provider.js";
import { TestAppPreviewFetch } from "../preview_fetch.js";

declare const __CALTRA_API_URL__: string;
declare const __CALTRA_LOCAL_STUB__: boolean;

/** Both modes use the real SDK, including token exchange, REST validation, and SSE parsing. */
export function StandardThreadDemo() {
  const [client] = useState(() => {
    const provider = new TestAppAuthorizationCodeProvider();
    return new CaltraClient({ apiUrl: window.location.origin,
      fetch: TestAppPreviewFetch.fetch, authorizationCodeProvider: () => provider.create() });
  });
  const [sessions, setSessions] = useState<CaltraSession[]>([]);
  const [selected, setSelected] = useState<string>();
  const [agent, setAgent] = useState<{ id: string; name: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [view, setView] = useState("standard");
  useEffect(() => {
    let active = true;
    void Promise.all([client.agents.get(), client.listSessions({ limit: 100 })]).then(([agent, page]) => {
      if (!active) return;
      setAgent(agent); setSessions(page.data);
      const requested = new URLSearchParams(window.location.search).get("session");
      setSelected(page.data.find(session => session.id === requested)?.id ?? page.data[0]?.id);
    }).catch(() => { if (active) setError("Could not connect. Check the demo server's API configuration and try reloading."); });
    return () => { active = false; };
  }, [client]);
  const select = (id: string) => {
    setSelected(id); const url = new URL(window.location.href); url.searchParams.set("session", id); window.history.replaceState(null, "", url);
  };
  const create = async () => {
    if (!agent) return;
    setBusy(true); setError(undefined);
    try { const session = await client.agents.sessions(agent.id).create(); setSessions(current => [session, ...current]); select(session.id); }
    catch { setError("Could not create a session. Please try again."); }
    finally { setBusy(false); }
  };
  return <main className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
      <div><h1 className="text-sm font-semibold">Caltra SDK demo</h1>
        <p className="mt-1 text-xs text-muted-foreground">{__CALTRA_LOCAL_STUB__ ? "Local API stub · simulated responses · resets on server restart" : "Real Caltra API · saved conversations"}</p></div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Demo controls">
        <Button variant={view === "standard" ? "default" : "outline"} size="sm" aria-pressed={view === "standard"} onClick={() => setView("standard")}>Standard Thread</Button>
        <Button variant={view === "caltra" ? "default" : "outline"} size="sm" aria-pressed={view === "caltra"} onClick={() => setView("caltra")}>CaltraChat</Button>
        <select aria-label="Session" className="max-w-48 rounded-md border bg-background p-2 text-xs" value={selected ?? ""} onChange={event => select(event.target.value)} disabled={!sessions.length}>
          {!sessions.length && <option value="">No sessions yet</option>}
          {sessions.map((session, index) => <option key={session.id} value={session.id}>{session.title ?? `Conversation ${sessions.length - index}`}</option>)}
        </select>
        <Button variant="outline" size="sm" disabled={!agent || busy} onClick={() => void create()}>{busy ? "Creating…" : "New conversation"}</Button>
      </div>
    </header>
    {error && <p role="alert" className="px-6 py-3 text-sm text-destructive">{error}</p>}
    <div className="min-h-0 flex-1">
      {selected ? <Conversation key={selected} client={client} sessionId={selected} view={view} />
        : <p role="status" className="p-8 text-sm text-muted-foreground">{agent ? "Start a new conversation to try the assistant." : error ? "Connection unavailable." : "Connecting…"}</p>}
    </div>
  </main>;
}

function Conversation({ client, sessionId, view }: { client: CaltraClient; sessionId: string; view: string }) {
  const [runtime] = useState<CaltraSessionRuntime>(() => client.createSessionRuntime({ sessionId }));
  const assistantRuntime = useAssistantUiRuntime(runtime);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    void runtime.start().catch(() => { if (active) setError(true); });
    return () => { active = false; void runtime.stop(); };
  }, [runtime]);
  if (error) return <p role="alert" className="p-6 text-destructive">Could not load this conversation. Reload to reconnect.</p>;
  return view === "standard"
    ? <AssistantRuntimeProvider runtime={assistantRuntime}><Thread autoFocus={false} /></AssistantRuntimeProvider>
    : <CaltraChat runtime={runtime} colorMode="light" slotProps={{ composerInput: { autoFocus: false } }} />;
}
