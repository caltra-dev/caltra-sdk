import {
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { CaltraClient } from "@caltra/client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { CaltraSessionStore, type CaltraConnectionState } from "./session_store.js";

export interface UseCaltraRuntimeOptions {
  client: CaltraClient;
  sessionId: string;
}

export interface UseCaltraRuntimeResult {
  connection: CaltraConnectionState;
  error: Error | null;
  refresh: () => Promise<void>;
  runtime: AssistantRuntime;
}

/** Adapts one durable Caltra session to assistant-ui without supplying presentation components. */
export function useCaltraRuntime(options: UseCaltraRuntimeOptions): UseCaltraRuntimeResult {
  const store = useMemo(
    () => new CaltraSessionStore(options.client, options.sessionId),
    [options.client, options.sessionId],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    void store.start().catch(() => undefined);
    return () => void store.stop();
  }, [store]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const text = message.content
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    if (text === "") throw new Error("Caltra currently accepts text messages only.");
    await store.send(text);
  }, [store]);

  const messages = useMemo<ThreadMessageLike[]>(() => snapshot.messages.map((message) => ({
    content: [{ type: "text", text: message.text }],
    createdAt: new Date(message.created_at),
    id: message.id,
    role: message.role,
  })), [snapshot.messages]);

  const runtime = useExternalStoreRuntime({
    convertMessage: (message) => message,
    isRunning: snapshot.isRunning,
    isSendDisabled: snapshot.connection !== "connected",
    messages,
    onNew,
  });

  return {
    connection: snapshot.connection,
    error: snapshot.error,
    refresh: async () => await store.refresh(),
    runtime,
  };
}
