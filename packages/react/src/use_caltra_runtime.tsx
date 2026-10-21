import type { AssistantRuntime } from "@assistant-ui/react";
import { useAssistantUiRuntime } from "@caltra/assistant-ui";
import { CaltraSessionRuntime, type CaltraClient, type CaltraConnectionState } from "@caltra/client";
import { useEffect, useMemo, useSyncExternalStore } from "react";

export interface UseCaltraRuntimeOptions { client: CaltraClient; sessionId: string; }
export interface UseCaltraRuntimeResult {
  connection: CaltraConnectionState;
  error: Error | null;
  historyLoaded: boolean;
  hasOlderMessages: boolean;
  loadingOlder: boolean;
  olderError: Error | null;
  loadOlder(): Promise<void>;
  refresh(): Promise<void>;
  reconnect(): Promise<void>;
  runtime: AssistantRuntime;
}

/** Compatibility convenience hook. Owns its Caltra session runtime and returns assistant-ui's runtime. */
export function useCaltraRuntime({ client, sessionId }: UseCaltraRuntimeOptions): UseCaltraRuntimeResult {
  const session = useMemo(() => new CaltraSessionRuntime(client, sessionId), [client, sessionId]);
  useEffect(() => {
    void session.start().catch(() => undefined);
    return () => { void session.stop(); };
  }, [session]);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const runtime = useAssistantUiRuntime(session);
  return { connection: snapshot.connection, error: snapshot.error, historyLoaded: snapshot.historyLoaded,
    hasOlderMessages: snapshot.hasOlderMessages, loadingOlder: snapshot.loadingOlder, olderError: snapshot.olderError,
    loadOlder: () => session.loadOlder(), refresh: () => session.refresh(), reconnect: () => session.reconnect(), runtime };
}
