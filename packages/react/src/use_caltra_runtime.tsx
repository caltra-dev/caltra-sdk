import {
  ExportedMessageRepository,
  type AppendMessage,
  type AssistantRuntime,
  type ThreadMessageLike,
  type ThreadMessage,
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
  historyLoaded: boolean;
  refresh: () => Promise<void>;
  /** Reconnects after a terminal failure while preserving this session's loaded history. */
  reconnect: () => Promise<void>;
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
    content: [
      ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
      ...(message.tool_calls ?? []).map(tool => ({ type: "tool-call" as const, toolCallId: tool.id, toolName: tool.name,
        args: tool.arguments as import("@assistant-ui/react").ToolCallMessagePart["args"], argsText: JSON.stringify(tool.arguments),
        ...(tool.status === "running" ? {} : { result: tool.result ?? null }),
        isError: tool.status === "failed" || tool.status === "cancelled",
        // Keep per-tool lifecycle distinct from the enclosing assistant message.
        artifact: { caltraToolStatus: tool.status },
      })),
    ],
    createdAt: new Date(message.created_at),
    id: message.id,
    role: message.role,
    ...(message.role === "assistant" ? {
      status: message.status === "streaming"
        ? { type: "running" as const }
        : message.status === "completed"
          ? { type: "complete" as const, reason: "stop" as const }
          : { type: "incomplete" as const, reason: message.status === "cancelled" ? "cancelled" as const : "error" as const },
    } : {}),
  })), [snapshot.messages]);

  // Caltra owns a linear transcript. Replace the repository so removed optimistic
  // IDs cannot survive as phantom edit/regeneration branches in assistant-ui.
  const messageRepository = useMemo(() => ExportedMessageRepository.fromArray(messages), [messages]);
  const runtime = useExternalStoreRuntime<ThreadMessage>({
    isLoading: !snapshot.historyLoaded,
    isRunning: snapshot.isRunning,
    isSendDisabled: snapshot.connection !== "connected",
    messageRepository,
    onNew,
  });

  return {
    connection: snapshot.connection,
    error: snapshot.error,
    historyLoaded: snapshot.historyLoaded,
    refresh: async () => await store.refresh(),
    reconnect: async () => await store.reconnect(),
    runtime,
  };
}
