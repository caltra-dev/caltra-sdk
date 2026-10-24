import {
  CaltraClient,
  type CaltraSession,
} from "@caltra/client";
import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Chat } from "./components/chat.js";
import { SessionList } from "./components/session_list.js";
import { useSuccessToast } from "./components/success_toast.js";
import { TestAppAuthorizationCodeProvider } from "./authorization_code_provider.js";

import { TestAppPreviewFetch } from "./preview_fetch.js";

declare const __CALTRA_REAL_API_AVAILABLE__: boolean;
declare const __CALTRA_DEFAULT_CONNECTION__: "stub" | "real";
type Connection = "stub" | "real";

export function App() {
  const [connection, setConnection] = useState<Connection>(__CALTRA_DEFAULT_CONNECTION__);
  return <div className="demo-app">
    <div className="demo-connection-bar">
      <label className="demo-appearance">Connection
        <select aria-label="Connection" value={connection} onChange={event => {
          const url = new URL(window.location.href);
          url.searchParams.delete("session");
          window.history.replaceState(null, "", url);
          setConnection(event.target.value as Connection);
        }}>
          <option value="stub">Local stub</option>
          {__CALTRA_REAL_API_AVAILABLE__ && <option value="real">Real Caltra API</option>}
        </select>
      </label>
      <p>{__CALTRA_REAL_API_AVAILABLE__ ? "Switching connection clears the current draft and opens that connection’s sessions."
        : "Launch with CALTRA_API_KEY or --caltra-api-key to enable Real Caltra API."}</p>
    </div>
    <ConnectedApp key={connection} connection={connection} />
  </div>;
}

function ConnectedApp({ connection }: { connection: Connection }) {
  const { success } = useSuccessToast();
  const sdkClient = useMemo(() => {
    const authorizationCodeProvider = new TestAppAuthorizationCodeProvider(undefined, connection === "stub" ? "/demo/stub" : "");
    return new CaltraClient({
      apiUrl: window.location.origin + (connection === "stub" ? "/demo/stub" : ""),
      fetch: TestAppPreviewFetch.fetch,
      authorizationCodeProvider: async () => await authorizationCodeProvider.create(),
    });
  }, [connection]);
  const [client, setClient] = useState<CaltraClient>();
  const [agent, setAgent] = useState<{ id: string; name: string }>();
  const [sessions, setSessions] = useState<CaltraSession[]>([]);
  const [selected, setSelected] = useState<CaltraSession>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(async () => {
        const [hostedAgent, sessionPage] = await Promise.all([
          sdkClient.agents.get(),
          sdkClient.listSessions({ limit: 100 }),
        ]);
        if (!active) return;
        setClient(sdkClient);
        setAgent(hostedAgent);
        setSessions(sessionPage.data);
        const requested = new URLSearchParams(window.location.search).get("session");
        // Resolve deep links only within the sessions authorized for this client.
        setSelected(sessionPage.data.find((session) => session.id === requested) ?? sessionPage.data[0]);
      })
      .catch((reason: unknown) => { if (active) setError(
        reason instanceof Error ? reason : new Error("SDK initialization failed."),
      ); });
    return () => { active = false; };
  }, [sdkClient]);

  const selectSession = (session: CaltraSession) => {
    setSelected(session);
    const url = new URL(window.location.href);
    url.searchParams.set("session", session.id);
    window.history.replaceState(null, "", url);
  };

  const createSession = async () => {
    if (!client || !agent) return;
    setCreating(true);
    setError(undefined);
    try {
      const session = await client.agents.sessions(agent.id).create();
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      selectSession(session);
      success({
        message: `Session opened for ${session.agent.name}.`,
        operationId: `create-session:${session.id}`,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error("Session creation failed."));
    } finally {
      setCreating(false);
    }
  };

  if (error && !client) {
    return (
      <div className="boot-state failure">
        <span>CONNECTION REFUSED</span>
        <h1>Signal room unavailable.</h1>
        <p>{error.message}</p>
        <p>Check the demo server’s API key and workspace configuration.</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="boot-state">
        <LoaderCircle className="spinner" />
        <span>AUTHENTICATING CLIENT</span>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <SessionList
        localStub={connection === "stub"}
        agent={agent}
        creating={creating}
        onCreate={createSession}
        onSelect={selectSession}
        selectedSessionId={selected?.id}
        sessions={sessions}
      />
      {selected
        ? <Chat client={client} key={selected.id} session={selected} localStub={connection === "stub"} />
        : (
            <main className="no-session">
              <span>NO ACTIVE CHANNEL</span>
              <h1>Choose a session or open a new one.</h1>
              {error && <p>{error.message}</p>}
            </main>
          )}
    </div>
  );
}
