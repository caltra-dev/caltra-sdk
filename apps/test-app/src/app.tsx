import {
  CaltraClient,
  type CaltraAgent,
  type CaltraSession,
} from "@caltra/client";
import { LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Chat } from "./components/chat.js";
import { SessionList } from "./components/session_list.js";
import { useSuccessToast } from "./components/success_toast.js";
import { TestAppAuthorizationCodeProvider } from "./authorization_code_provider.js";

declare const __CALTRA_API_URL__: string;

export function App() {
  const { success } = useSuccessToast();
  const sdkClient = useMemo(() => {
    const authorizationCodeProvider = new TestAppAuthorizationCodeProvider();
    return new CaltraClient({
      apiUrl: __CALTRA_API_URL__,
      authorizationCodeProvider: async () => await authorizationCodeProvider.create(),
    });
  }, []);
  const [client, setClient] = useState<CaltraClient>();
  const [agents, setAgents] = useState<CaltraAgent[]>([]);
  const [sessions, setSessions] = useState<CaltraSession[]>([]);
  const [selected, setSelected] = useState<CaltraSession>();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    void Promise.resolve()
      .then(async () => {
        const [agentPage, sessionPage] = await Promise.all([
          sdkClient.listAgents({ limit: 100 }),
          sdkClient.listSessions({ limit: 100 }),
        ]);
        setClient(sdkClient);
        setAgents(agentPage.data);
        setSessions(sessionPage.data);
        setSelected(sessionPage.data[0]);
      })
      .catch((reason: unknown) => setError(
        reason instanceof Error ? reason : new Error("SDK initialization failed."),
      ));
  }, [sdkClient]);

  const createSession = async (agentId: string) => {
    if (!client) return;
    setCreating(true);
    setError(undefined);
    try {
      const session = await client.createSession({ agentId });
      setSessions((current) => [session, ...current.filter((item) => item.id !== session.id)]);
      setSelected(session);
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
        <p>Check the four server-side variables in <code>apps/test-app/.env.local</code>.</p>
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
        agents={agents}
        creating={creating}
        onCreate={createSession}
        onSelect={setSelected}
        selectedSessionId={selected?.id}
        sessions={sessions}
      />
      {selected
        ? <Chat client={client} key={selected.id} session={selected} />
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
